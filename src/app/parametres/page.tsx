'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

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
      toast.success('Operateur modifie')
    } else {
      const { error } = await sb.from('operateurs').insert({
        nom: opForm.nom.trim(),
        email: opForm.email.trim() || null,
      })
      if (error) { toast.error(error.message); return }
      toast.success('Operateur ajoute')
    }

    setOpDialogOpen(false)
    loadData()
  }

  async function handleDeleteOp() {
    if (!opToDelete) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('operateurs').delete().eq('id', opToDelete.id)
    if (error) { toast.error(error.message); return }
    toast.success('Operateur supprime')
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

      toast.success('Famille modifiee')
    } else {
      const { error } = await sb.from('familles').insert({
        nom: famForm.nom.trim(),
      })
      if (error) { toast.error(error.message); return }
      toast.success('Famille ajoutee')
    }

    setFamDialogOpen(false)
    loadData()
  }

  async function handleDeleteFam() {
    if (!famToDelete) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('familles').delete().eq('id', famToDelete.id)
    if (error) { toast.error(error.message); return }
    toast.success('Famille supprimee')
    setFamDeleteOpen(false)
    loadData()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Parametres</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="operateurs">Operateurs</TabsTrigger>
          <TabsTrigger value="familles">Familles</TabsTrigger>
        </TabsList>

        {/* ═══ Operateurs ═══ */}
        <TabsContent value="operateurs" className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un operateur..."
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
              <CardTitle>{filteredOps.length} operateur{filteredOps.length > 1 ? 's' : ''}</CardTitle>
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
      </Tabs>

      {/* Dialog: Add/Edit Operateur */}
      <Dialog open={opDialogOpen} onOpenChange={setOpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOp ? 'Modifier' : 'Ajouter'} un operateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input
                value={opForm.nom}
                onChange={(e) => setOpForm((f) => ({ ...f, nom: e.target.value }))}
                placeholder="Nom de l'operateur"
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
            <DialogTitle>Supprimer l&apos;operateur</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Supprimer <strong>{opToDelete?.nom}</strong> ? Cette action est irreversible.
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
