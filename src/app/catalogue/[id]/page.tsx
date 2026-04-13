'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
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
import { Badge } from '@/components/ui/badge'
import { StockBadge } from '@/components/stock-badge'
import { Pencil, Trash2, ArrowLeft, Plus, X, ArrowUp, ArrowDown, Search } from 'lucide-react'
import { toast } from 'sonner'

const FAMILLES_DEFAULT = ['RTK', 'Kit', 'Gateway', 'Accessoire', 'Autre']
const STATUTS = ['Composant', 'Produit fini', 'Location', 'Obsolète']

interface Produit {
  id: string
  reference: string
  nom: string
  famille: string
  statut: string
  stock_actuel: number
  seuil_alerte: number
  prix_ht: number
  description: string | null
}

interface RefFournisseur {
  id: string
  reference: string
  fournisseur: string | null
}

interface BomRow {
  composant_id: string
  reference: string
  nom: string
  quantite_necessaire: number
  stock_actuel: number
  stock_apres: number
  is_deficit: boolean
  is_alerte: boolean
  seuil_alerte: number
}

interface MouvementRow {
  id: string
  description: string
  date: string
  type: string
  quantite: number
  source: string
}

interface SubstitutRow {
  id: string
  composant_id: string
  substitut_id: string
  priorite: number
  note: string | null
  substitut_nom: string
  substitut_ref: string
  substitut_statut: string
}

interface UsedAsSubstitutRow {
  id: string
  composant_id: string
  composant_nom: string
  composant_ref: string
  priorite: number
}

interface ComposantOption {
  id: string
  reference: string
  nom: string
  statut: string
}

export default function ProduitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [produit, setProduit] = useState<Produit | null>(null)
  const [bom, setBom] = useState<BomRow[]>([])
  const [mouvements, setMouvements] = useState<MouvementRow[]>([])
  const [refsFournisseurs, setRefsFournisseurs] = useState<RefFournisseur[]>([])
  const [newRef, setNewRef] = useState({ reference: '', fournisseur: '' })
  const [addingRef, setAddingRef] = useState(false)

  // Stock adjustment
  const [newStock, setNewStock] = useState('')
  const [saving, setSaving] = useState(false)
  const [familles, setFamilles] = useState<string[]>(FAMILLES_DEFAULT)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    nom: '', famille: '', statut: '', prix_ht: '', seuil_alerte: '', description: '',
  })

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false)

  // ─── Substituts ───
  const [substituts, setSubstituts] = useState<SubstitutRow[]>([])
  const [usedAsSubstitut, setUsedAsSubstitut] = useState<UsedAsSubstitutRow[]>([])
  const [addSubOpen, setAddSubOpen] = useState(false)
  const [subSearch, setSubSearch] = useState('')
  const [allComposants, setAllComposants] = useState<ComposantOption[]>([])
  const [selectedSubId, setSelectedSubId] = useState('')
  const [subNote, setSubNote] = useState('')

  const loadSubstituts = useCallback(() => {
    const sb = createSupabaseClient()

    // Substituts of this component (outgoing)
    sb.from('substituts')
      .select('id, composant_id, substitut_id, priorite, note, substitut:substitut_id(nom, reference, statut)')
      .eq('composant_id', id)
      .order('priorite')
      .then(({ data }) => {
        setSubstituts((data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          composant_id: r.composant_id as string,
          substitut_id: r.substitut_id as string,
          priorite: r.priorite as number,
          note: r.note as string | null,
          substitut_nom: (r.substitut as { nom: string } | null)?.nom ?? '',
          substitut_ref: (r.substitut as { reference: string } | null)?.reference ?? '',
          substitut_statut: (r.substitut as { statut: string } | null)?.statut ?? '',
        })))
      })

    // Used as substitut of (incoming)
    sb.from('substituts')
      .select('id, composant_id, priorite, composant:composant_id(nom, reference)')
      .eq('substitut_id', id)
      .order('priorite')
      .then(({ data }) => {
        setUsedAsSubstitut((data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          composant_id: r.composant_id as string,
          composant_nom: (r.composant as { nom: string } | null)?.nom ?? '',
          composant_ref: (r.composant as { reference: string } | null)?.reference ?? '',
          priorite: r.priorite as number,
        })))
      })
  }, [id])

  useEffect(() => {
    const sb = createSupabaseClient()

    sb.from('produits')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          const p = data as Produit
          setProduit(p)
          setNewStock(String(p.stock_actuel))
          resetEditForm(p)

          if (p.statut === 'Produit fini') {
            sb.rpc('resolve_bom', { p_produit_id: id, p_quantite: 1 }).then(
              ({ data: bomData }) => setBom((bomData as BomRow[]) ?? [])
            )
          }
        }
      })

    sb.from('mouvements')
      .select('id, description, date, type, quantite, source')
      .eq('produit_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setMouvements((data as MouvementRow[]) ?? []))

    sb.from('references_fournisseurs')
      .select('id, reference, fournisseur')
      .eq('produit_id', id)
      .order('created_at')
      .then(({ data }) => setRefsFournisseurs((data as RefFournisseur[]) ?? []))

    sb.from('familles')
      .select('nom')
      .order('nom')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFamilles((data as { nom: string }[]).map((f) => f.nom))
        }
      })

    // Load all composants for substitut picker
    sb.from('produits')
      .select('id, reference, nom, statut')
      .in('statut', ['Composant', 'Obsolète'])
      .order('nom')
      .then(({ data }) => setAllComposants((data as ComposantOption[]) ?? []))

    loadSubstituts()
  }, [id, loadSubstituts])

  function resetEditForm(p: Produit) {
    setEditForm({
      nom: p.nom, famille: p.famille, statut: p.statut,
      prix_ht: String(p.prix_ht), seuil_alerte: String(p.seuil_alerte),
      description: p.description ?? '',
    })
  }

  async function handleSaveEdit() {
    if (!produit) return
    const sb = createSupabaseClient()
    const { error } = await sb
      .from('produits')
      .update({
        nom: editForm.nom.trim(), famille: editForm.famille, statut: editForm.statut,
        prix_ht: parseFloat(editForm.prix_ht) || 0,
        seuil_alerte: parseInt(editForm.seuil_alerte, 10) || 0,
        description: editForm.description.trim() || null,
      })
      .eq('id', id)

    if (error) { toast.error(error.message); return }

    const updated = {
      ...produit, nom: editForm.nom.trim(), famille: editForm.famille,
      statut: editForm.statut, prix_ht: parseFloat(editForm.prix_ht) || 0,
      seuil_alerte: parseInt(editForm.seuil_alerte, 10) || 0,
      description: editForm.description.trim() || null,
    }
    setProduit(updated)
    setEditing(false)
    toast.success('Produit modifie')
  }

  async function handleAddRef() {
    if (!newRef.reference.trim()) { toast.error('Reference requise'); return }
    const sb = createSupabaseClient()
    const { data, error } = await sb
      .from('references_fournisseurs')
      .insert({ produit_id: id, reference: newRef.reference.trim(), fournisseur: newRef.fournisseur.trim() || null })
      .select('id, reference, fournisseur')
      .single()
    if (error) { toast.error(error.message); return }
    setRefsFournisseurs((prev) => [...prev, data as RefFournisseur])
    setNewRef({ reference: '', fournisseur: '' })
    setAddingRef(false)
    toast.success('Reference fournisseur ajoutee')
  }

  async function handleDeleteRef(refId: string) {
    const sb = createSupabaseClient()
    const { error } = await sb.from('references_fournisseurs').delete().eq('id', refId)
    if (error) { toast.error(error.message); return }
    setRefsFournisseurs((prev) => prev.filter((r) => r.id !== refId))
    toast.success('Reference supprimee')
  }

  async function handleDelete() {
    const sb = createSupabaseClient()
    const { error } = await sb.from('produits').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Produit supprime')
    router.push('/composants')
  }

  async function handleAjustement() {
    if (!produit) return
    const qty = parseInt(newStock, 10)
    if (isNaN(qty)) return
    setSaving(true)
    const sb = createSupabaseClient()
    const diff = qty - produit.stock_actuel
    const { error: e1 } = await sb.from('produits').update({ stock_actuel: qty }).eq('id', id)
    if (!e1) {
      await sb.from('mouvements').insert({
        description: `Ajustement manuel — ${produit.nom}`, type: 'Ajustement',
        source: 'Ajustement', produit_id: id, quantite: diff, valide_par: 'Rafa',
        notes: `Stock: ${produit.stock_actuel} → ${qty}`,
      })
      setProduit({ ...produit, stock_actuel: qty })
      toast.success(`Stock ajuste: ${qty}`)
    } else {
      toast.error('Erreur lors de la mise a jour')
    }
    setSaving(false)
  }

  // ─── Substituts logic ───

  // Detect loops: check if adding substitut_id would create a cycle
  function wouldCreateLoop(substitutId: string): boolean {
    // Check if substitutId already has us as a substitut (direct or indirect)
    // For simplicity, check direct loop only (A->B->A)
    // The substituts of B
    const bSubstituts = allComposants.length > 0 ? [] : [] // We need to check from DB
    // Actually we can check: does substitutId have id in its substituts?
    // We loaded usedAsSubstitut which tells us who we substitute for
    // But we need the substituts of the target. Let's do a simple direct check:
    // If B already substitutes A (i.e., B is in our usedAsSubstitut list), that's a loop
    return usedAsSubstitut.some((u) => u.composant_id === substitutId)
  }

  const filteredSubComposants = allComposants.filter((c) => {
    if (c.id === id) return false // No self-substitut
    if (substituts.some((s) => s.substitut_id === c.id)) return false // Already added
    if (!subSearch.trim()) return true
    const s = subSearch.toLowerCase()
    return c.nom.toLowerCase().includes(s) || c.reference.toLowerCase().includes(s)
  })

  async function handleAddSubstitut() {
    if (!selectedSubId) return
    if (wouldCreateLoop(selectedSubId)) {
      toast.error('Boucle de substitution detectee — interdit')
      return
    }

    const sb = createSupabaseClient()
    const nextPrio = substituts.length > 0 ? Math.max(...substituts.map((s) => s.priorite)) + 1 : 1
    const { error } = await sb.from('substituts').insert({
      composant_id: id,
      substitut_id: selectedSubId,
      priorite: nextPrio,
      note: subNote.trim() || null,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Substitut ajoute')
    setAddSubOpen(false)
    setSelectedSubId('')
    setSubNote('')
    setSubSearch('')
    loadSubstituts()
  }

  async function handleDeleteSubstitut(subId: string) {
    const sb = createSupabaseClient()
    const { error } = await sb.from('substituts').delete().eq('id', subId)
    if (error) { toast.error(error.message); return }
    toast.success('Substitut retire')
    // Reorder remaining
    const remaining = substituts.filter((s) => s.id !== subId)
    for (let i = 0; i < remaining.length; i++) {
      await sb.from('substituts').update({ priorite: i + 1 }).eq('id', remaining[i].id)
    }
    loadSubstituts()
  }

  async function handleMoveSubstitut(subId: string, direction: 'up' | 'down') {
    const idx = substituts.findIndex((s) => s.id === subId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= substituts.length) return

    const sb = createSupabaseClient()
    const a = substituts[idx]
    const b = substituts[swapIdx]
    await Promise.all([
      sb.from('substituts').update({ priorite: b.priorite }).eq('id', a.id),
      sb.from('substituts').update({ priorite: a.priorite }).eq('id', b.id),
    ])
    loadSubstituts()
  }

  // ─── Render ───

  if (!produit) return <p className="text-muted-foreground">Chargement...</p>

  const isComposant = produit.statut === 'Composant' || produit.statut === 'Obsolète'

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => {
            if (produit.statut === 'Produit fini') router.push('/produits-finis')
            else router.push('/composants')
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{produit.nom}</h1>
          <p className="text-sm text-muted-foreground font-mono">{produit.reference}</p>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { resetEditForm(produit); setEditing(true) }}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Supprimer
            </Button>
          </div>
        )}
      </div>

      {/* ═══ Fiche produit ═══ */}
      <Card>
        <CardHeader><CardTitle>Fiche produit</CardTitle></CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nom du produit</Label>
                <Input value={editForm.nom} onChange={(e) => setEditForm((f) => ({ ...f, nom: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Famille</Label>
                  <Select value={editForm.famille} onValueChange={(v) => setEditForm((f) => ({ ...f, famille: v ?? f.famille }))}>
                    <SelectTrigger>{editForm.famille}</SelectTrigger>
                    <SelectContent>
                      {familles.map((f) => (<SelectItem key={f} value={f}>{f}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select value={editForm.statut} onValueChange={(v) => setEditForm((f) => ({ ...f, statut: v ?? f.statut }))}>
                    <SelectTrigger>{editForm.statut}</SelectTrigger>
                    <SelectContent>
                      {STATUTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Prix HT</Label>
                  <Input type="number" value={editForm.prix_ht} onChange={(e) => setEditForm((f) => ({ ...f, prix_ht: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Seuil alerte</Label>
                  <Input type="number" value={editForm.seuil_alerte} onChange={(e) => setEditForm((f) => ({ ...f, seuil_alerte: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description optionnelle" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveEdit}>Enregistrer</Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Famille :</span> {produit.famille}</div>
              <div><span className="text-muted-foreground">Statut :</span> {produit.statut}</div>
              <div><span className="text-muted-foreground">Ref interne :</span> <span className="font-mono">{produit.reference}</span></div>
              <div><span className="text-muted-foreground">Prix HT :</span> {produit.prix_ht} &euro;</div>
              <div><span className="text-muted-foreground">Seuil alerte :</span> {produit.seuil_alerte}</div>
              <div><span className="text-muted-foreground">Stock :</span> <StockBadge stockActuel={produit.stock_actuel} seuilAlerte={produit.seuil_alerte} /></div>
              {produit.description && (
                <div className="col-span-2"><span className="text-muted-foreground">Description :</span> {produit.description}</div>
              )}
              <div className="col-span-2 flex items-end gap-2 pt-2 border-t">
                <div>
                  <span className="text-muted-foreground text-xs">Ajuster le stock</span>
                  <Input type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} className="w-28" />
                </div>
                <Button onClick={handleAjustement} disabled={saving}>Ajuster</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ BOM (Produit fini only) ═══ */}
      {produit.statut === 'Produit fini' && bom.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Nomenclature (BOM pour 1 unite)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Composant</TableHead>
                  <TableHead>Qte requise</TableHead>
                  <TableHead>Stock actuel</TableHead>
                  <TableHead>Stock apres</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.map((b) => (
                  <TableRow key={b.composant_id}>
                    <TableCell className="font-medium">{b.nom}</TableCell>
                    <TableCell>{b.quantite_necessaire}</TableCell>
                    <TableCell>{b.stock_actuel}</TableCell>
                    <TableCell>
                      <span className={b.is_deficit ? 'text-red-600 font-bold' : b.is_alerte ? 'text-yellow-600 font-bold' : ''}>
                        {b.stock_apres}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ═══ Substituts (Composant / Obsolète only) ═══ */}
      {isComposant && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Substituts</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Utilises si ce composant est en rupture de stock
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setAddSubOpen(true); setSubSearch(''); setSelectedSubId(''); setSubNote('') }}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter un substitut
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {substituts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun substitut defini.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Prio</TableHead>
                      <TableHead>Composant</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {substituts.map((s, idx) => (
                      <TableRow key={s.id}>
                        <TableCell className="tabular-nums font-medium">{s.priorite}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.substitut_nom}</span>
                            <span className="text-xs text-muted-foreground font-mono">{s.substitut_ref}</span>
                            {s.substitut_statut === 'Obsolète' && (
                              <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">obsolete</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.note ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-0.5 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => handleMoveSubstitut(s.id, 'up')}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === substituts.length - 1} onClick={() => handleMoveSubstitut(s.id, 'down')}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteSubstitut(s.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {usedAsSubstitut.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Utilise comme substitut de</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {usedAsSubstitut.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">·</span>
                      <span className="font-medium">{u.composant_nom}</span>
                      <span className="text-xs text-muted-foreground font-mono">{u.composant_ref}</span>
                      <span className="text-xs text-muted-foreground">(priorite {u.priorite})</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ═══ Refs fournisseurs ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>References fournisseurs</CardTitle>
            {!addingRef && (
              <Button size="sm" variant="outline" onClick={() => setAddingRef(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {addingRef && (
            <div className="flex items-end gap-2 mb-4">
              <div className="space-y-1.5 flex-1">
                <Label>Reference</Label>
                <Input value={newRef.reference} onChange={(e) => setNewRef((r) => ({ ...r, reference: e.target.value }))} placeholder="Ref fournisseur" />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label>Fournisseur</Label>
                <Input value={newRef.fournisseur} onChange={(e) => setNewRef((r) => ({ ...r, fournisseur: e.target.value }))} placeholder="Nom du fournisseur" />
              </div>
              <Button size="sm" onClick={handleAddRef}>Ajouter</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingRef(false)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          )}
          {refsFournisseurs.length === 0 && !addingRef ? (
            <p className="text-sm text-muted-foreground">Aucune reference fournisseur.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refsFournisseurs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.reference}</TableCell>
                    <TableCell>{r.fournisseur ?? '—'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteRef(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ═══ Derniers mouvements ═══ */}
      <Card>
        <CardHeader><CardTitle>Derniers mouvements</CardTitle></CardHeader>
        <CardContent>
          {mouvements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mouvement.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Quantite</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mouvements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="tabular-nums">{m.date}</TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell className="max-w-xs truncate">{m.description}</TableCell>
                    <TableCell className="tabular-nums">{m.quantite}</TableCell>
                    <TableCell className="text-muted-foreground">{m.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ═══ Dialog suppression ═══ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer le produit</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Supprimer <strong>{produit.nom}</strong> ? Cette action est irreversible. Les mouvements associes ne seront pas supprimes.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog ajouter substitut ═══ */}
      <Dialog open={addSubOpen} onOpenChange={setAddSubOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un substitut</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Rechercher un composant</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher..." value={subSearch} onChange={(e) => setSubSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {filteredSubComposants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun composant disponible</p>
              ) : (
                filteredSubComposants.map((c) => {
                  const isLoop = wouldCreateLoop(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={isLoop}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                        isLoop ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent'
                      } ${selectedSubId === c.id ? 'bg-accent' : ''}`}
                      onClick={() => !isLoop && setSelectedSubId(c.id)}
                    >
                      <span className="font-medium">{c.nom}</span>
                      <span className="text-xs text-muted-foreground font-mono">{c.reference}</span>
                      {c.statut === 'Obsolète' && (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">obsolete</Badge>
                      )}
                      {isLoop && (
                        <span className="text-[10px] text-red-500 ml-auto">boucle</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Note (optionnel)</Label>
              <Input value={subNote} onChange={(e) => setSubNote(e.target.value)} placeholder="Ex: Degrade acceptable" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubOpen(false)}>Annuler</Button>
            <Button onClick={handleAddSubstitut} disabled={!selectedSubId}>Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
