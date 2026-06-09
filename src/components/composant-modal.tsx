'use client'

import { useEffect, useState, useCallback } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StockBadge } from '@/components/stock-badge'
import { PrixTrend } from '@/components/prix-trend'
import {
  Pencil, Trash2, Plus, X, ArrowUp, ArrowDown, Search, AlertTriangle, ExternalLink, Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { normSearch } from '@/lib/utils'
import { getDeleteImpact, deleteProduitWithDetach, type DeleteImpact } from '@/lib/delete-produit'

// ─── Types ───

interface Produit {
  id: string; reference: string; nom: string; famille: string; statut: string
  stock_actuel: number; seuil_alerte: number; prix_ht: number; description: string | null
  prix_ht_precedent: number | null
}

interface RefFournisseur {
  id: string
  reference: string
  fournisseur: string | null
  lien_url: string | null
  lien_verifie_le: string | null
}

interface SubstitutRow {
  id: string; composant_id: string; substitut_id: string; priorite: number; note: string | null
  substitut_nom: string; substitut_ref: string; substitut_statut: string
}

interface UsedAsSubstitutRow {
  id: string; composant_id: string; composant_nom: string; composant_ref: string; priorite: number
}

interface BomImpact {
  produit_nom: string; produit_ref: string
  role: 'principal' | 'substitut'
  has_substitut: boolean
  substitut_nom: string | null
  parent_nom?: string
}

interface ComposantOption { id: string; reference: string; nom: string; statut: string }

const FAMILLES_DEFAULT = ['RTK', 'Kit', 'Gateway', 'Accessoire', 'Autre']
const STATUTS = ['Composant', 'Produit fini', 'Location', 'Obsolète']

// ─── Lien fournisseur effectif ───
// Faute de champ dédié, les URLs fournisseur sont souvent collées dans les
// champs réf/fournisseur. Ces URLs fournies à la main sont plus fiables que le
// lien trouvé par l'agent Amazon (qui peut cibler un produit voisin) : on les
// prend en priorité, et « Trouver » ne sert que s'il n'y a aucun lien.

function asUrl(s: string | null): string | null {
  const t = s?.trim() ?? ''
  return /^https?:\/\//i.test(t) ? t : null
}

function refLienUrl(r: RefFournisseur): string | null {
  return asUrl(r.reference) ?? asUrl(r.fournisseur) ?? asUrl(r.lien_url)
}

// ─── Props ───

interface ComposantModalProps {
  composantId: string | null
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

export function ComposantModal({ composantId, open, onClose, onChanged }: ComposantModalProps) {
  const [produit, setProduit] = useState<Produit | null>(null)
  const [refsFournisseurs, setRefsFournisseurs] = useState<RefFournisseur[]>([])
  const [substituts, setSubstituts] = useState<SubstitutRow[]>([])
  const [usedAsSubstitut, setUsedAsSubstitut] = useState<UsedAsSubstitutRow[]>([])
  const [familles, setFamilles] = useState<string[]>(FAMILLES_DEFAULT)
  const [allComposants, setAllComposants] = useState<ComposantOption[]>([])
  const [dirty, setDirty] = useState(false)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    nom: '', famille: '', statut: '', prix_ht: '', seuil_alerte: '', description: '',
  })

  // Stock adjustment
  const [newStock, setNewStock] = useState('')
  const [saving, setSaving] = useState(false)

  // Supplier refs
  const [addingRef, setAddingRef] = useState(false)
  const [newRef, setNewRef] = useState({ reference: '', fournisseur: '', lien_url: '' })
  // Édition manuelle du lien d'une réf existante (#1)
  const [editingLienId, setEditingLienId] = useState<string | null>(null)
  const [editingLienValue, setEditingLienValue] = useState('')

  // Add substitut
  const [addSubOpen, setAddSubOpen] = useState(false)
  const [subSearch, setSubSearch] = useState('')
  const [selectedSubId, setSelectedSubId] = useState('')
  const [subNote, setSubNote] = useState('')

  // Obsolete dialog
  const [obsoleteOpen, setObsoleteOpen] = useState(false)
  const [bomImpacts, setBomImpacts] = useState<BomImpact[]>([])
  const [markingObsolete, setMarkingObsolete] = useState(false)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Nested modal for clicking on substitut names
  const [nestedId, setNestedId] = useState<string | null>(null)

  const loadData = useCallback(() => {
    if (!composantId) return
    const sb = createSupabaseClient()

    sb.from('produits').select('*').eq('id', composantId).single()
      .then(({ data }) => {
        if (data) {
          const p = data as Produit
          setProduit(p)
          setNewStock(String(p.stock_actuel))
          setEditForm({
            nom: p.nom, famille: p.famille, statut: p.statut,
            prix_ht: String(p.prix_ht), seuil_alerte: String(p.seuil_alerte),
            description: p.description ?? '',
          })
        }
      })

    sb.from('references_fournisseurs').select('id, reference, fournisseur, lien_url, lien_verifie_le')
      .eq('produit_id', composantId).order('created_at')
      .then(({ data }) => setRefsFournisseurs((data as RefFournisseur[]) ?? []))

    sb.from('substituts')
      .select('id, composant_id, substitut_id, priorite, note, substitut:substitut_id(nom, reference, statut)')
      .eq('composant_id', composantId).order('priorite')
      .then(({ data }) => {
        setSubstituts((data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string, composant_id: r.composant_id as string,
          substitut_id: r.substitut_id as string, priorite: r.priorite as number,
          note: r.note as string | null,
          substitut_nom: (r.substitut as { nom: string } | null)?.nom ?? '',
          substitut_ref: (r.substitut as { reference: string } | null)?.reference ?? '',
          substitut_statut: (r.substitut as { statut: string } | null)?.statut ?? '',
        })))
      })

    sb.from('substituts')
      .select('id, composant_id, priorite, composant:composant_id(nom, reference)')
      .eq('substitut_id', composantId).order('priorite')
      .then(({ data }) => {
        setUsedAsSubstitut((data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string, composant_id: r.composant_id as string,
          composant_nom: (r.composant as { nom: string } | null)?.nom ?? '',
          composant_ref: (r.composant as { reference: string } | null)?.reference ?? '',
          priorite: r.priorite as number,
        })))
      })

    sb.from('familles').select('nom').order('nom')
      .then(({ data }) => { if (data?.length) setFamilles(data.map((f: { nom: string }) => f.nom)) })

    sb.from('produits').select('id, reference, nom, statut').in('statut', ['Composant', 'Obsolète']).order('nom')
      .then(({ data }) => setAllComposants((data as ComposantOption[]) ?? []))
  }, [composantId])

  useEffect(() => {
    if (open && composantId) {
      setEditing(false)
      setAddingRef(false)
      setAddSubOpen(false)
      setDirty(false)
      loadData()
    }
  }, [open, composantId, loadData])

  function handleClose() {
    if (dirty) onChanged?.()
    onClose()
  }

  // ─── Edit ───

  async function handleSaveEdit() {
    if (!produit) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('produits').update({
      nom: editForm.nom.trim(), famille: editForm.famille, statut: editForm.statut,
      prix_ht: parseFloat(editForm.prix_ht) || 0,
      seuil_alerte: parseInt(editForm.seuil_alerte, 10) || 0,
      description: editForm.description.trim() || null,
    }).eq('id', produit.id)
    if (error) { toast.error(error.message); return }
    setDirty(true)
    setProduit({
      ...produit, nom: editForm.nom.trim(), famille: editForm.famille,
      statut: editForm.statut, prix_ht: parseFloat(editForm.prix_ht) || 0,
      seuil_alerte: parseInt(editForm.seuil_alerte, 10) || 0,
      description: editForm.description.trim() || null,
    })
    setEditing(false)
    toast.success('Produit modifié')
  }

  // ─── Stock ───

  async function handleAjustement() {
    if (!produit) return
    const qty = parseInt(newStock, 10)
    if (isNaN(qty)) return
    setSaving(true)
    const sb = createSupabaseClient()
    const diff = qty - produit.stock_actuel
    const { error } = await sb.from('produits').update({ stock_actuel: qty }).eq('id', produit.id)
    if (!error) {
      await sb.from('mouvements').insert({
        description: `Ajustement manuel — ${produit.nom}`, type: 'Ajustement',
        source: 'Ajustement', produit_id: produit.id, quantite: diff, valide_par: 'Rafa',
        notes: `Stock: ${produit.stock_actuel} → ${qty}`,
      })
      setProduit({ ...produit, stock_actuel: qty })
      setDirty(true)
      toast.success(`Stock ajusté: ${qty}`)
    }
    setSaving(false)
  }

  // ─── Supplier refs ───

  async function handleAddRef() {
    if (!newRef.reference.trim() || !produit) return
    const lien = newRef.lien_url.trim()
    const sb = createSupabaseClient()
    const { data, error } = await sb.from('references_fournisseurs')
      .insert({
        produit_id: produit.id,
        reference: newRef.reference.trim(),
        fournisseur: newRef.fournisseur.trim() || null,
        lien_url: lien || null,
        lien_verifie_le: lien ? new Date().toISOString() : null,
      })
      .select('id, reference, fournisseur, lien_url, lien_verifie_le').single()
    if (error) { toast.error(error.message); return }
    setRefsFournisseurs((prev) => [...prev, data as RefFournisseur])
    setNewRef({ reference: '', fournisseur: '', lien_url: '' })
    setAddingRef(false)
  }

  async function handleDeleteRef(refId: string) {
    const sb = createSupabaseClient()
    await sb.from('references_fournisseurs').delete().eq('id', refId)
    setRefsFournisseurs((prev) => prev.filter((r) => r.id !== refId))
  }

  function startEditLien(r: RefFournisseur) {
    setEditingLienId(r.id)
    setEditingLienValue(refLienUrl(r) ?? '')
  }

  async function handleSaveLien(refId: string) {
    const v = editingLienValue.trim()
    const sb = createSupabaseClient()
    const { error } = await sb.from('references_fournisseurs')
      .update({ lien_url: v || null, lien_verifie_le: v ? new Date().toISOString() : null })
      .eq('id', refId)
    if (error) { toast.error(error.message); return }
    setRefsFournisseurs((prev) => prev.map((r) => r.id === refId ? { ...r, lien_url: v || null } : r))
    setEditingLienId(null)
    setEditingLienValue('')
  }

  // Lookup automatique du lien fournisseur (#4) : Amazon en priorité, fallback
  // best-effort sur autres. La requête côté serveur (route API) évite les CORS
  // et permet d'avoir un user-agent crédible.
  async function handleSearchLink(ref: RefFournisseur) {
    if (!produit) return
    // Un lien existe déjà (fourni ou trouvé) : on l'ouvre directement, pas de
    // recherche Amazon.
    const existing = refLienUrl(ref)
    if (existing) {
      window.open(existing, '_blank')
      return
    }
    const tid = toast.loading('Recherche du lien fournisseur...')
    try {
      const res = await fetch('/api/factures/supplier-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nom: produit.nom,
          prix: produit.prix_ht,
          fournisseur: ref.fournisseur,
          produit_id: produit.id,
          reference: ref.reference,
        }),
      })
      const data = await res.json()
      toast.dismiss(tid)
      if (!res.ok) {
        toast.error(data.error ?? 'Recherche impossible')
        return
      }
      if (!data.match) {
        toast.info('Aucun lien plausible trouvé')
        return
      }
      // Si Amazon a retourné une page produit identifiée, on persiste et on
      // affiche le lien. Sinon (lien de recherche pré-remplie), on ouvre la
      // recherche dans un onglet sans rien enregistrer.
      if (data.persisted) {
        setRefsFournisseurs((prev) => prev.map((r) =>
          r.id === ref.id ? { ...r, lien_url: data.match.url, lien_verifie_le: new Date().toISOString() } : r,
        ))
        toast.success('Lien associé')
      } else {
        window.open(data.match.url, '_blank')
        toast.info('Pas de match direct — recherche Amazon ouverte dans un onglet')
      }
    } catch (e) {
      toast.dismiss(tid)
      toast.error((e as Error).message)
    }
  }

  // ─── Substituts ───

  function wouldCreateLoop(substitutId: string): boolean {
    return usedAsSubstitut.some((u) => u.composant_id === substitutId)
  }

  const filteredSubComposants = allComposants.filter((c) => {
    if (!composantId || c.id === composantId) return false
    if (substituts.some((s) => s.substitut_id === c.id)) return false
    if (!subSearch.trim()) return true
    const s = normSearch(subSearch)
    return normSearch(c.nom).includes(s) || normSearch(c.reference).includes(s)
  })

  async function handleAddSubstitut() {
    if (!selectedSubId || !composantId) return
    if (wouldCreateLoop(selectedSubId)) { toast.error('Boucle de substitution détectée'); return }
    const sb = createSupabaseClient()
    const nextPrio = substituts.length > 0 ? Math.max(...substituts.map((s) => s.priorite)) + 1 : 1
    const { error } = await sb.from('substituts').insert({
      composant_id: composantId, substitut_id: selectedSubId, priorite: nextPrio,
      note: subNote.trim() || null,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Substitut ajouté')
    setAddSubOpen(false)
    setSelectedSubId('')
    setSubNote('')
    setDirty(true)
    loadData()
  }

  async function handleDeleteSubstitut(subId: string) {
    const sb = createSupabaseClient()
    await sb.from('substituts').delete().eq('id', subId)
    const remaining = substituts.filter((s) => s.id !== subId)
    for (let i = 0; i < remaining.length; i++) {
      await sb.from('substituts').update({ priorite: i + 1 }).eq('id', remaining[i].id)
    }
    setDirty(true)
    loadData()
  }

  async function handleMoveSubstitut(subId: string, direction: 'up' | 'down') {
    const idx = substituts.findIndex((s) => s.id === subId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= substituts.length) return
    const sb = createSupabaseClient()
    const a = substituts[idx], b = substituts[swapIdx]
    await Promise.all([
      sb.from('substituts').update({ priorite: b.priorite }).eq('id', a.id),
      sb.from('substituts').update({ priorite: a.priorite }).eq('id', b.id),
    ])
    loadData()
  }

  // ─── Mark as obsolete ───

  async function analyzeObsoleteImpact() {
    if (!composantId || !produit) return
    const sb = createSupabaseClient()
    const impacts: BomImpact[] = []

    // As principal component in BOMs
    const { data: bomLines } = await sb
      .from('nomenclatures')
      .select('produit_assemble_id, produit:produit_assemble_id(nom, reference)')
      .eq('composant_id', composantId)

    for (const line of (bomLines ?? [])) {
      const p = line.produit as unknown as { nom: string; reference: string } | null
      if (!p) continue

      // Check if this component has substituts
      const hasSub = substituts.length > 0
      impacts.push({
        produit_nom: p.nom, produit_ref: p.reference,
        role: 'principal', has_substitut: hasSub,
        substitut_nom: hasSub ? substituts[0].substitut_nom : null,
      })
    }

    // As substitut in other components
    for (const u of usedAsSubstitut) {
      impacts.push({
        produit_nom: u.composant_nom, produit_ref: u.composant_ref,
        role: 'substitut', has_substitut: true,
        substitut_nom: null, parent_nom: u.composant_nom,
      })
    }

    setBomImpacts(impacts)
    setObsoleteOpen(true)
  }

  async function handleMarkObsolete() {
    if (!produit) return
    setMarkingObsolete(true)
    const sb = createSupabaseClient()
    const { error } = await sb.from('produits').update({ statut: 'Obsolète' }).eq('id', produit.id)
    if (error) { toast.error(error.message); setMarkingObsolete(false); return }
    setProduit({ ...produit, statut: 'Obsolète' })
    setEditForm((f) => ({ ...f, statut: 'Obsolète' }))
    setDirty(true)
    setMarkingObsolete(false)
    setObsoleteOpen(false)
    toast.success(`${produit.nom} marqué comme obsolète`)
  }

  // ─── Delete ───

  // Mesure l'impact avant suppression (logique partagée avec catalogue/[id]).
  async function analyzeDeleteImpact() {
    if (!produit) return
    setDeleteImpact(await getDeleteImpact(produit.id))
    setDeleteOpen(true)
  }

  async function handleDelete() {
    if (!produit || !deleteImpact) return
    setDeleting(true)
    try {
      await deleteProduitWithDetach(produit.id, deleteImpact)
    } catch (e) {
      setDeleting(false)
      toast.error((e as Error).message)
      return
    }
    setDeleting(false)
    toast.success(`"${produit.nom}" supprimé`)
    setDeleteOpen(false)
    // Pas via setDirty + handleClose : le state ne serait pas encore propagé
    // et onChanged ne serait jamais appelé.
    onChanged?.()
    onClose()
  }

  // ─── Render ───

  if (!produit) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
        <DialogContent><p className="text-muted-foreground py-8 text-center">Chargement...</p></DialogContent>
      </Dialog>
    )
  }

  const isComposant = produit.statut === 'Composant' || produit.statut === 'Obsolète'
  const isObsolete = produit.statut === 'Obsolète'

  return (
    <>
      <Dialog open={open && !nestedId} onOpenChange={(o) => { if (!o) handleClose() }}>
        <DialogContent className="sm:max-w-4xl w-[min(96vw,64rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>{produit.nom}</DialogTitle>
              {isObsolete && <Badge className="bg-gray-200 text-gray-700 border-gray-300 text-[11px]">obsolète</Badge>}
            </div>
            <p className="text-sm text-muted-foreground font-mono">{produit.reference}</p>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* ═══ Fiche ═══ */}
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nom</Label>
                  <Input value={editForm.nom} onChange={(e) => setEditForm((f) => ({ ...f, nom: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Famille</Label>
                    <Select value={editForm.famille} onValueChange={(v) => setEditForm((f) => ({ ...f, famille: v ?? f.famille }))}>
                      <SelectTrigger>{editForm.famille}</SelectTrigger>
                      <SelectContent>{familles.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Statut</Label>
                    <Select value={editForm.statut} onValueChange={(v) => setEditForm((f) => ({ ...f, statut: v ?? f.statut }))}>
                      <SelectTrigger>{editForm.statut}</SelectTrigger>
                      <SelectContent>{STATUTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                  <Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit}>Enregistrer</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Famille :</span> {produit.famille}</div>
                  <div><span className="text-muted-foreground">Statut :</span> {produit.statut}</div>
                  <div className="flex items-center gap-1"><span className="text-muted-foreground">Prix HT :</span> {produit.prix_ht} &euro; <PrixTrend actuel={produit.prix_ht} precedent={produit.prix_ht_precedent} /></div>
                  <div><span className="text-muted-foreground">Seuil alerte :</span> {produit.seuil_alerte}</div>
                  <div><span className="text-muted-foreground">Stock :</span> <StockBadge stockActuel={produit.stock_actuel} seuilAlerte={produit.seuil_alerte} /></div>
                  {produit.description && <div className="col-span-2"><span className="text-muted-foreground">Description :</span> {produit.description}</div>}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-3 w-3 mr-1" />Modifier
                  </Button>
                  {produit.statut === 'Composant' && (
                    <Button size="sm" variant="ghost" className="text-amber-700 hover:text-amber-800" onClick={analyzeObsoleteImpact}>
                      <AlertTriangle className="h-3 w-3 mr-1" />Marquer obsolète
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive ml-auto" onClick={analyzeDeleteImpact}>
                    <Trash2 className="h-3 w-3 mr-1" />Supprimer
                  </Button>
                </div>
                <div className="flex items-end gap-2 pt-2 border-t">
                  <div>
                    <span className="text-muted-foreground text-xs">Ajuster le stock</span>
                    <Input type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} className="w-24 h-8" />
                  </div>
                  <Button size="sm" onClick={handleAjustement} disabled={saving}>Ajuster</Button>
                </div>
              </div>
            )}

            {/* ═══ Substituts ═══ */}
            {isComposant && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Substituts</h3>
                    <p className="text-[11px] text-muted-foreground">Utilisés si ce composant est en rupture</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddSubOpen(true); setSubSearch(''); setSelectedSubId(''); setSubNote('') }}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                  </Button>
                </div>
                {substituts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun substitut.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-xs">Prio</TableHead>
                        <TableHead className="text-xs">Composant</TableHead>
                        <TableHead className="text-xs">Note</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {substituts.map((s, idx) => (
                        <TableRow key={s.id}>
                          <TableCell className="tabular-nums text-xs">{s.priorite}</TableCell>
                          <TableCell>
                            <button type="button" className="text-sm font-medium text-blue-700 hover:underline cursor-pointer" onClick={() => setNestedId(s.substitut_id)}>
                              {s.substitut_nom}
                            </button>
                            {s.substitut_statut === 'Obsolète' && <Badge className="ml-1 bg-gray-200 text-gray-700 border-gray-300 text-[9px]">obsolète</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.note ?? '—'}</TableCell>
                          <TableCell>
                            <div className="flex gap-0.5 justify-end">
                              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => handleMoveSubstitut(s.id, 'up')}><ArrowUp className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === substituts.length - 1} onClick={() => handleMoveSubstitut(s.id, 'down')}><ArrowDown className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteSubstitut(s.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {usedAsSubstitut.length > 0 && (
                  <div className="pt-2">
                    <h3 className="text-sm font-semibold mb-1">Utilisé comme substitut de</h3>
                    {usedAsSubstitut.map((u) => (
                      <div key={u.id} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">·</span>
                        <button type="button" className="font-medium text-blue-700 hover:underline cursor-pointer" onClick={() => setNestedId(u.composant_id)}>
                          {u.composant_nom}
                        </button>
                        <span className="text-xs text-muted-foreground">(priorité {u.priorite})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═══ Refs fournisseurs ═══ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Références fournisseurs</h3>
                {!addingRef && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddingRef(true)}><Plus className="h-3 w-3 mr-1" />Ajouter</Button>}
              </div>
              {addingRef && (
                <div className="rounded-lg border p-3 space-y-2.5 bg-muted/20">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Référence fournisseur</Label>
                      <Input value={newRef.reference} onChange={(e) => setNewRef((r) => ({ ...r, reference: e.target.value }))} placeholder="Ex : 203-3281" className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Nom du fournisseur</Label>
                      <Input value={newRef.fournisseur} onChange={(e) => setNewRef((r) => ({ ...r, fournisseur: e.target.value }))} placeholder="Ex : RS Components" className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Lien direct</Label>
                      <Input value={newRef.lien_url} onChange={(e) => setNewRef((r) => ({ ...r, lien_url: e.target.value }))} placeholder="https://…" className="h-8" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddingRef(false)}>Annuler</Button>
                    <Button size="sm" className="h-8" onClick={handleAddRef}>Ajouter la référence</Button>
                  </div>
                </div>
              )}
              {refsFournisseurs.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] h-7">Référence</TableHead>
                      <TableHead className="text-[11px] h-7">Fournisseur</TableHead>
                      <TableHead className="text-[11px] h-7">Lien</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refsFournisseurs.map((r) => {
                      const lien = refLienUrl(r)
                      return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs max-w-48 truncate" title={r.reference}>{r.reference}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-48 truncate" title={r.fournisseur ?? undefined}>
                          {asUrl(r.fournisseur) ? new URL(asUrl(r.fournisseur)!).hostname : r.fournisseur ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {editingLienId === r.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editingLienValue}
                                onChange={(e) => setEditingLienValue(e.target.value)}
                                placeholder="https://…"
                                className="h-7 text-xs w-48"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLien(r.id) }}
                              />
                              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleSaveLien(r.id)}>OK</Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingLienId(null); setEditingLienValue('') }}><X className="h-3 w-3" /></Button>
                            </div>
                          ) : lien ? (
                            <div className="flex items-center gap-1">
                              <a
                                href={lien}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Voir
                              </a>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => startEditLien(r)} title="Modifier le lien">
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => startEditLien(r)}
                                title="Ajouter un lien à la main"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Lien
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-muted-foreground"
                                onClick={() => handleSearchLink(r)}
                                title="Rechercher automatiquement (Amazon)"
                              >
                                <Globe className="h-3 w-3 mr-1" />
                                Trouver
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="w-8">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteRef(r.id)}><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
              {refsFournisseurs.length === 0 && !addingRef && (
                <p className="text-xs text-muted-foreground">Aucune référence.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Add substitut dialog ═══ */}
      <Dialog open={addSubOpen} onOpenChange={setAddSubOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un substitut</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher..." value={subSearch} onChange={(e) => setSubSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {filteredSubComposants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun composant</p>
              ) : filteredSubComposants.map((c) => {
                const isLoop = wouldCreateLoop(c.id)
                return (
                  <button key={c.id} type="button" disabled={isLoop}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${isLoop ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent cursor-pointer'} ${selectedSubId === c.id ? 'bg-accent' : ''}`}
                    onClick={() => !isLoop && setSelectedSubId(c.id)}
                  >
                    <span className="font-medium">{c.nom}</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.reference}</span>
                    {c.statut === 'Obsolète' && <Badge className="bg-gray-200 text-gray-700 border-gray-300 text-[10px]">obsolète</Badge>}
                    {isLoop && <span className="text-[10px] text-red-500 ml-auto">boucle</span>}
                  </button>
                )
              })}
            </div>
            <Input placeholder="Note (optionnel)" value={subNote} onChange={(e) => setSubNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubOpen(false)}>Annuler</Button>
            <Button onClick={handleAddSubstitut} disabled={!selectedSubId}>Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Obsolete confirmation dialog ═══ */}
      <Dialog open={obsoleteOpen} onOpenChange={setObsoleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Marquer comme obsolète ?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>Marquer <strong>&quot;{produit.nom}&quot;</strong> comme obsolète ?</p>
            {bomImpacts.length > 0 ? (
              <>
                <p className="text-muted-foreground">Ce composant est utilisé dans {bomImpacts.length} BOM :</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {bomImpacts.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 rounded border p-2">
                      <span className="text-muted-foreground">·</span>
                      <span className="font-medium">{b.produit_nom}</span>
                      <span className="text-xs text-muted-foreground">
                        ({b.role === 'principal' ? 'composant principal' : `substitut de "${b.parent_nom}"`}
                        {b.role === 'principal' && !b.has_substitut && ' — aucun substitut défini'}
                        {b.role === 'principal' && b.has_substitut && ` — substitut : ${b.substitut_nom}`})
                      </span>
                    </div>
                  ))}
                </div>
                {bomImpacts.some((b) => b.role === 'principal' && !b.has_substitut) && (
                  <p className="text-amber-700 bg-amber-50 rounded-lg p-2 text-xs">
                    Les BOM sans substitut seront bloquées à la prochaine fabrication.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Ce composant n&apos;est utilisé dans aucune BOM.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObsoleteOpen(false)}>Annuler</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleMarkObsolete} disabled={markingObsolete}>
              {markingObsolete ? 'En cours...' : 'Marquer comme obsolète'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Delete confirmation dialog ═══ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Supprimer ce produit ?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            {(deleteImpact?.usedInBoms ?? 0) > 0 ? (
              <>
                <p>
                  <strong>&quot;{produit.nom}&quot;</strong> est utilisé comme composant dans{' '}
                  <strong>{deleteImpact!.usedInBoms} nomenclature{deleteImpact!.usedInBoms > 1 ? 's' : ''}</strong>.
                </p>
                <p className="text-red-700 bg-red-50 rounded-lg p-3">
                  Suppression impossible : retirez-le d&apos;abord de ces nomenclatures,
                  ou marquez-le obsolète pour le sortir du flux sans perdre l&apos;historique.
                </p>
              </>
            ) : (
              <>
                <p>
                  Supprimer définitivement <strong>&quot;{produit.nom}&quot;</strong> ({produit.reference}) ?
                  Cette action est irréversible.
                </p>
                {deleteImpact && (deleteImpact.mouvements > 0 || deleteImpact.validations > 0 || deleteImpact.fabrications > 0) && (
                  <div className="text-muted-foreground space-y-1">
                    <p>Sera conservé mais détaché de ce produit :</p>
                    <ul className="list-disc pl-5">
                      {deleteImpact.mouvements > 0 && <li>{deleteImpact.mouvements} mouvement{deleteImpact.mouvements > 1 ? 's' : ''} de stock</li>}
                      {deleteImpact.validations > 0 && <li>{deleteImpact.validations} ligne{deleteImpact.validations > 1 ? 's' : ''} de facture</li>}
                      {deleteImpact.fabrications > 0 && <li>{deleteImpact.fabrications} fabrication{deleteImpact.fabrications > 1 ? 's' : ''}</li>}
                    </ul>
                  </div>
                )}
                {deleteImpact && deleteImpact.ownBomLines > 0 && (
                  <p className="text-muted-foreground">
                    Sa nomenclature ({deleteImpact.ownBomLines} ligne{deleteImpact.ownBomLines > 1 ? 's' : ''}) sera supprimée.
                  </p>
                )}
                {(substituts.length > 0 || refsFournisseurs.length > 0) && (
                  <p className="text-muted-foreground">
                    Seront supprimés avec lui :{' '}
                    {[
                      refsFournisseurs.length > 0 ? `${refsFournisseurs.length} référence(s) fournisseur` : null,
                      substituts.length > 0 ? `${substituts.length} lien(s) de substitut` : null,
                    ].filter(Boolean).join(', ')}.
                  </p>
                )}
                {usedAsSubstitut.length > 0 && (
                  <p className="text-amber-700 bg-amber-50 rounded-lg p-3">
                    Attention : ce composant est le substitut de{' '}
                    {usedAsSubstitut.map((u) => `"${u.composant_nom}"`).join(', ')} — ce{usedAsSubstitut.length > 1 ? 's' : ''} lien{usedAsSubstitut.length > 1 ? 's' : ''} ser{usedAsSubstitut.length > 1 ? 'ont' : 'a'} supprimé{usedAsSubstitut.length > 1 ? 's' : ''}.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || (deleteImpact?.usedInBoms ?? 0) > 0}>
              {deleting ? 'Suppression...' : 'Supprimer définitivement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Nested component modal ═══ */}
      {nestedId && (
        <ComposantModal
          composantId={nestedId}
          open={!!nestedId}
          onClose={() => setNestedId(null)}
          onChanged={() => { setDirty(true); loadData() }}
        />
      )}
    </>
  )
}
