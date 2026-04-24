'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { createSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Plus, Pencil, Trash2, Save, Sun, Moon, Monitor } from 'lucide-react'
import { toast } from 'sonner'

interface SettingInfo {
  key: string
  label: string | null
  source: 'env' | 'db' | 'none'
  masked: string | null
  value: string | null
  set: boolean
  updated_at: string | null
}

const OUTLOOK_KEYS = [
  'outlook_tenant_id',
  'outlook_client_id',
  'outlook_client_secret',
  'outlook_mailbox',
] as const
type OutlookKey = typeof OUTLOOK_KEYS[number]

const OUTLOOK_META: Record<OutlookKey, { label: string; secret: boolean; placeholder: string }> = {
  outlook_tenant_id: { label: 'Tenant ID', secret: false, placeholder: '00000000-0000-0000-0000-000000000000' },
  outlook_client_id: { label: 'Client ID', secret: false, placeholder: '00000000-0000-0000-0000-000000000000' },
  outlook_client_secret: { label: 'Client Secret', secret: true, placeholder: '•••••••••••••' },
  outlook_mailbox: { label: 'Boîte mail', secret: false, placeholder: 'facturation@exemple.com' },
}

interface Operateur {
  id: string
  nom: string
  email: string | null
  created_at: string
}

interface Famille {
  id: string
  nom: string
  created_at: string
}

export default function ParametresPage() {
  const [tab, setTab] = useState('operateurs')

  // ─── Theme ───
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [themeMounted, setThemeMounted] = useState(false)
  useEffect(() => setThemeMounted(true), [])

  // ─── Integrations (clés API) ───
  const [settings, setSettings] = useState<SettingInfo[]>([])
  const [geminiInput, setGeminiInput] = useState('')
  const [savingGemini, setSavingGemini] = useState(false)
  const [outlookInputs, setOutlookInputs] = useState<Record<OutlookKey, string>>({
    outlook_tenant_id: '',
    outlook_client_id: '',
    outlook_client_secret: '',
    outlook_mailbox: '',
  })
  const [savingOutlook, setSavingOutlook] = useState(false)

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/settings')
    if (!res.ok) return
    const data = await res.json()
    const loaded = (data.settings as SettingInfo[]) ?? []
    setSettings(loaded)
    // Préremplir les champs non-secrets d'Outlook avec les valeurs actuelles
    setOutlookInputs((prev) => {
      const next = { ...prev }
      for (const k of OUTLOOK_KEYS) {
        const s = loaded.find((x) => x.key === k)
        if (!OUTLOOK_META[k].secret && s?.value) {
          next[k] = s.value
        }
      }
      return next
    })
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  async function handleSaveGemini() {
    setSavingGemini(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'gemini_api_key', value: geminiInput }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Échec enregistrement')
        return
      }
      toast.success(data.deleted ? 'Clé supprimée' : 'Clé enregistrée')
      setGeminiInput('')
      loadSettings()
    } finally {
      setSavingGemini(false)
    }
  }

  const geminiSetting = settings.find((s) => s.key === 'gemini_api_key')

  async function handleSaveOutlook() {
    setSavingOutlook(true)
    try {
      // On envoie tous les champs: pour les secrets, une valeur vide signifie
      // "laisser la valeur actuelle" → on ne remplace que si rempli.
      // Pour les non-secrets, on envoie toujours la valeur courante.
      const updates: Array<{ key: OutlookKey; value: string }> = []
      for (const k of OUTLOOK_KEYS) {
        const v = outlookInputs[k].trim()
        if (OUTLOOK_META[k].secret) {
          if (v) updates.push({ key: k, value: v })
        } else {
          updates.push({ key: k, value: v })
        }
      }
      if (updates.length === 0) {
        toast.info('Aucune modification')
        return
      }
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Échec enregistrement Outlook')
        return
      }
      toast.success('Paramètres Outlook enregistrés')
      // Effacer uniquement les champs secrets (on ne veut pas garder la clé en clair dans le state)
      setOutlookInputs((prev) => ({
        ...prev,
        outlook_client_secret: '',
      }))
      loadSettings()
    } finally {
      setSavingOutlook(false)
    }
  }

  async function handleDeleteOutlookSecret() {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'outlook_client_secret', value: '' }),
    })
    if (res.ok) {
      toast.success('Client Secret supprimé')
      loadSettings()
    } else {
      const data = await res.json()
      toast.error(data.error ?? 'Échec suppression')
    }
  }

  function settingFor(key: string) {
    return settings.find((s) => s.key === key)
  }

  // ─── Operateurs ───
  const [operateurs, setOperateurs] = useState<Operateur[]>([])
  const [opSearch, setOpSearch] = useState('')
  const [opDialogOpen, setOpDialogOpen] = useState(false)
  const [editingOp, setEditingOp] = useState<Operateur | null>(null)
  const [opForm, setOpForm] = useState({ nom: '', email: '' })
  const [opDeleteOpen, setOpDeleteOpen] = useState(false)
  const [opToDelete, setOpToDelete] = useState<Operateur | null>(null)

  // ─── Familles ───
  const [familles, setFamilles] = useState<Famille[]>([])
  const [famSearch, setFamSearch] = useState('')
  const [famDialogOpen, setFamDialogOpen] = useState(false)
  const [editingFam, setEditingFam] = useState<Famille | null>(null)
  const [famForm, setFamForm] = useState({ nom: '' })
  const [famDeleteOpen, setFamDeleteOpen] = useState(false)
  const [famToDelete, setFamToDelete] = useState<Famille | null>(null)

  const loadData = useCallback(() => {
    const sb = createSupabaseClient()
    sb.from('operateurs')
      .select('*')
      .order('nom')
      .then(({ data }) => setOperateurs((data as Operateur[]) ?? []))

    sb.from('familles')
      .select('*')
      .order('nom')
      .then(({ data }) => setFamilles((data as Famille[]) ?? []))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ─── Operateurs CRUD ───

  const filteredOps = operateurs.filter((o) => {
    if (!opSearch.trim()) return true
    const s = opSearch.toLowerCase()
    return o.nom.toLowerCase().includes(s) || (o.email ?? '').toLowerCase().includes(s)
  })

  function openAddOp() {
    setEditingOp(null)
    setOpForm({ nom: '', email: '' })
    setOpDialogOpen(true)
  }

  function openEditOp(op: Operateur) {
    setEditingOp(op)
    setOpForm({ nom: op.nom, email: op.email ?? '' })
    setOpDialogOpen(true)
  }

  async function handleSaveOp() {
    if (!opForm.nom.trim()) {
      toast.error('Nom requis')
      return
    }
    const sb = createSupabaseClient()

    if (editingOp) {
      const { error } = await sb
        .from('operateurs')
        .update({ nom: opForm.nom.trim(), email: opForm.email.trim() || null })
        .eq('id', editingOp.id)
      if (error) { toast.error(error.message); return }
      toast.success('Opérateur modifié')
    } else {
      const { error } = await sb.from('operateurs').insert({
        nom: opForm.nom.trim(),
        email: opForm.email.trim() || null,
      })
      if (error) { toast.error(error.message); return }
      toast.success('Opérateur ajouté')
    }

    setOpDialogOpen(false)
    loadData()
  }

  async function handleDeleteOp() {
    if (!opToDelete) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('operateurs').delete().eq('id', opToDelete.id)
    if (error) { toast.error(error.message); return }
    toast.success('Opérateur supprimé')
    setOpDeleteOpen(false)
    loadData()
  }

  // ─── Familles CRUD ───

  const filteredFams = familles.filter((f) => {
    if (!famSearch.trim()) return true
    return f.nom.toLowerCase().includes(famSearch.toLowerCase())
  })

  function openAddFam() {
    setEditingFam(null)
    setFamForm({ nom: '' })
    setFamDialogOpen(true)
  }

  function openEditFam(fam: Famille) {
    setEditingFam(fam)
    setFamForm({ nom: fam.nom })
    setFamDialogOpen(true)
  }

  async function handleSaveFam() {
    if (!famForm.nom.trim()) {
      toast.error('Nom requis')
      return
    }
    const sb = createSupabaseClient()

    if (editingFam) {
      // Update family name in familles table
      const { error } = await sb
        .from('familles')
        .update({ nom: famForm.nom.trim() })
        .eq('id', editingFam.id)
      if (error) { toast.error(error.message); return }

      // Update all products with old family name
      await sb
        .from('produits')
        .update({ famille: famForm.nom.trim() })
        .eq('famille', editingFam.nom)

      toast.success('Famille modifiée')
    } else {
      const { error } = await sb.from('familles').insert({
        nom: famForm.nom.trim(),
      })
      if (error) { toast.error(error.message); return }
      toast.success('Famille ajoutée')
    }

    setFamDialogOpen(false)
    loadData()
  }

  async function handleDeleteFam() {
    if (!famToDelete) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('familles').delete().eq('id', famToDelete.id)
    if (error) { toast.error(error.message); return }
    toast.success('Famille supprimée')
    setFamDeleteOpen(false)
    loadData()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Paramètres</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="operateurs">Opérateurs</TabsTrigger>
          <TabsTrigger value="familles">Familles</TabsTrigger>
          <TabsTrigger value="apparence">Apparence</TabsTrigger>
          <TabsTrigger value="integrations">Intégrations</TabsTrigger>
        </TabsList>

        {/* ═══ Operateurs ═══ */}
        <TabsContent value="operateurs" className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un opérateur..."
                value={opSearch}
                onChange={(e) => setOpSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={openAddOp}>
              <Plus className="h-4 w-4 mr-1.5" />
              Ajouter
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{filteredOps.length} opérateur{filteredOps.length > 1 ? 's' : ''}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOps.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.nom}</TableCell>
                      <TableCell className="text-muted-foreground">{op.email ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditOp(op)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => { setOpToDelete(op); setOpDeleteOpen(true) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Familles ═══ */}
        <TabsContent value="familles" className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher une famille..."
                value={famSearch}
                onChange={(e) => setFamSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={openAddFam}>
              <Plus className="h-4 w-4 mr-1.5" />
              Ajouter
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{filteredFams.length} famille{filteredFams.length > 1 ? 's' : ''}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFams.map((fam) => (
                    <TableRow key={fam.id}>
                      <TableCell className="font-medium">{fam.nom}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditFam(fam)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => { setFamToDelete(fam); setFamDeleteOpen(true) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Apparence ═══ */}
        <TabsContent value="apparence" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Thème</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5 max-w-sm">
                <Label>Mode d&apos;affichage</Label>
                <Select
                  value={themeMounted ? (theme ?? 'system') : 'system'}
                  onValueChange={(v) => v && setTheme(v)}
                >
                  <SelectTrigger>
                    <span className="flex items-center gap-2">
                      {(() => {
                        const t = themeMounted ? theme : 'system'
                        if (t === 'light') return <><Sun className="h-4 w-4" /> Clair</>
                        if (t === 'dark') return <><Moon className="h-4 w-4" /> Sombre</>
                        return <><Monitor className="h-4 w-4" /> Système</>
                      })()}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <span className="flex items-center gap-2"><Sun className="h-4 w-4" /> Clair</span>
                    </SelectItem>
                    <SelectItem value="dark">
                      <span className="flex items-center gap-2"><Moon className="h-4 w-4" /> Sombre</span>
                    </SelectItem>
                    <SelectItem value="system">
                      <span className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Système</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {themeMounted && theme === 'system' && (
                  <p className="text-xs text-muted-foreground">
                    Actuellement : {resolvedTheme === 'dark' ? 'sombre' : 'clair'} (suit les préférences OS)
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Integrations ═══ */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clé API Gemini</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">État :</span>
                  {geminiSetting?.set ? (
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      Configurée
                    </span>
                  ) : (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      Non configurée
                    </span>
                  )}
                  {geminiSetting?.source === 'env' && (
                    <span className="text-xs text-muted-foreground">
                      (via variable d&apos;environnement)
                    </span>
                  )}
                  {geminiSetting?.source === 'db' && (
                    <span className="text-xs text-muted-foreground">
                      (enregistrée en base)
                    </span>
                  )}
                </div>
                {geminiSetting?.masked && (
                  <div className="font-mono text-xs text-muted-foreground">
                    {geminiSetting.masked}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 max-w-md">
                <Label>Nouvelle clé</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={geminiInput}
                    onChange={(e) => setGeminiInput(e.target.value)}
                    placeholder="AIzaSy..."
                    autoComplete="off"
                  />
                  <Button
                    onClick={handleSaveGemini}
                    disabled={savingGemini || !geminiInput.trim()}
                  >
                    <Save className="h-4 w-4 mr-1.5" />
                    Enregistrer
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {geminiSetting?.source === 'env'
                    ? 'La variable d\'environnement GEMINI_API_KEY a toujours la priorité. Supprimez-la pour utiliser la clé enregistrée ici.'
                    : 'La clé est stockée dans la table app_settings (RLS: service_role uniquement).'}
                </p>
              </div>

              {geminiSetting?.source === 'db' && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const res = await fetch('/api/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ key: 'gemini_api_key', value: '' }),
                    })
                    if (res.ok) {
                      toast.success('Clé supprimée')
                      loadSettings()
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Supprimer la clé enregistrée
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outlook (Microsoft Graph)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Identifiants de l&apos;application Azure AD utilisée pour récupérer les
                factures depuis la boîte mail. Permission requise : <code>Mail.Read</code> (Application)
                avec admin consent.
              </p>
              <div className="space-y-3 max-w-xl">
                {OUTLOOK_KEYS.map((k) => {
                  const meta = OUTLOOK_META[k]
                  const s = settingFor(k)
                  return (
                    <div key={k} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>{meta.label}</Label>
                        <div className="flex items-center gap-2 text-xs">
                          {s?.set ? (
                            <>
                              <span className="text-emerald-700 dark:text-emerald-400">
                                Configuré
                              </span>
                              <span className="text-muted-foreground">
                                ({s.source === 'env' ? 'env' : 'base'})
                              </span>
                            </>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">
                              Non configuré
                            </span>
                          )}
                        </div>
                      </div>
                      <Input
                        type={meta.secret ? 'password' : 'text'}
                        value={outlookInputs[k]}
                        onChange={(e) =>
                          setOutlookInputs((prev) => ({ ...prev, [k]: e.target.value }))
                        }
                        placeholder={
                          meta.secret && s?.set
                            ? 'Laisser vide pour conserver la valeur actuelle'
                            : meta.placeholder
                        }
                        autoComplete="off"
                      />
                      {meta.secret && s?.masked && (
                        <div className="font-mono text-xs text-muted-foreground">
                          Actuel : {s.masked}
                        </div>
                      )}
                      {s?.source === 'env' && (
                        <p className="text-xs text-muted-foreground">
                          La variable d&apos;environnement a toujours la priorité sur la
                          valeur enregistrée ici.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={handleSaveOutlook} disabled={savingOutlook}>
                  <Save className="h-4 w-4 mr-1.5" />
                  Enregistrer
                </Button>
                {settingFor('outlook_client_secret')?.source === 'db' && (
                  <Button variant="outline" onClick={handleDeleteOutlookSecret}>
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Supprimer le Client Secret enregistré
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Add/Edit Operateur */}
      <Dialog open={opDialogOpen} onOpenChange={setOpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOp ? 'Modifier' : 'Ajouter'} un opérateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input
                value={opForm.nom}
                onChange={(e) => setOpForm((f) => ({ ...f, nom: e.target.value }))}
                placeholder="Nom de l'opérateur"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={opForm.email}
                onChange={(e) => setOpForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemple.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveOp}>{editingOp ? 'Enregistrer' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Operateur */}
      <Dialog open={opDeleteOpen} onOpenChange={setOpDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l&apos;opérateur</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Supprimer <strong>{opToDelete?.nom}</strong> ? Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpDeleteOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteOp}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add/Edit Famille */}
      <Dialog open={famDialogOpen} onOpenChange={setFamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFam ? 'Modifier' : 'Ajouter'} une famille</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input
                value={famForm.nom}
                onChange={(e) => setFamForm((f) => ({ ...f, nom: e.target.value }))}
                placeholder="Nom de la famille"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFamDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveFam}>{editingFam ? 'Enregistrer' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Famille */}
      <Dialog open={famDeleteOpen} onOpenChange={setFamDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la famille</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Supprimer la famille <strong>{famToDelete?.nom}</strong> ? Les produits existants garderont leur famille actuelle.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFamDeleteOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteFam}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
