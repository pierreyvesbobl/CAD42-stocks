'use client'

import { useEffect, useState, useCallback, Suspense, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Pencil, Trash2, ArrowLeft, Package, Copy, X } from 'lucide-react'
import { toast } from 'sonner'
import { ComposantModal } from '@/components/composant-modal'
import { normSearch, parseDecimal, formatQty } from '@/lib/utils'
import { duplicateProduit } from '@/lib/duplicate-produit'
import { getDefaultSeuilAlerte } from '@/lib/app-settings'
import { getDeleteImpact, deleteProduitWithDetach, type DeleteImpact } from '@/lib/delete-produit'
import { computeBomCost, hasPrix, type BomCost } from '@/lib/prix'
import { BomCoutBadge } from '@/components/bom-cout-badge'

const STATUTS_PRODUIT = ['Composant', 'Produit fini', 'Location']

interface ProduitFini {
  id: string
  reference: string
  nom: string
}

interface Composant {
  id: string
  reference: string
  nom: string
  statut: string
}

interface NomRow {
  id: string
  produit_assemble_id: string
  composant_id: string
  quantite: number
  section: string | null
  composant_nom: string
  composant_ref: string
  composant_statut: string
  composant_prix: number | null
}

interface BomGroup {
  produit: ProduitFini
  lignes: NomRow[]
}

function NomenclaturesContent() {
  const router = useRouter()
  // La BOM ouverte vit dans l'URL (?bom=...) : recliquer sur « Nomenclatures »
  // dans la nav (href /nomenclatures) ramène donc à la liste, et le bouton
  // retour navigateur fonctionne aussi.
  const searchParams = useSearchParams()
  const selectedProduit = searchParams.get('bom')
  const [produitsFinis, setProduitsFinis] = useState<ProduitFini[]>([])
  const [composants, setComposants] = useState<Composant[]>([])
  const [nomenclatures, setNomenclatures] = useState<NomRow[]>([])
  // Ids interdits comme composant de la BOM ouverte (le produit lui-même + ses
  // ancêtres) — les ajouter créerait un cycle. Chargé via rpc bom_invalid_components.
  const [invalidComponentIds, setInvalidComponentIds] = useState<Set<string>>(new Set())
  // Coût composants en cascade de la BOM ouverte (resolve_bom mode doc).
  const [bomCost, setBomCost] = useState<BomCost | null>(null)
  const [search, setSearch] = useState('')

  function openBom(produitId: string) {
    router.push(`/nomenclatures?bom=${produitId}`)
  }

  function closeBom() {
    router.push('/nomenclatures')
  }

  // Retour en haut à chaque changement de vue (le scroll est porté par <main>)
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [selectedProduit])

  // Add component dialog — multi-sélection (#21) : un id → quantité saisie
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addSelected, setAddSelected] = useState<Record<string, string>>({})
  const [addSection, setAddSection] = useState('')

  // Edit quantity dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<NomRow | null>(null)
  const [editQuantite, setEditQuantite] = useState('')
  const [editSection, setEditSection] = useState('')

  // Sélection multiple de lignes pour actions groupées (modif section / suppr.)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [bulkSection, setBulkSection] = useState('')

  // Réinitialise la sélection en changeant de BOM
  useEffect(() => { setSelectedRows(new Set()); setBulkSection('') }, [selectedProduit])

  // Delete BOM dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteProduitId, setDeleteProduitId] = useState<string | null>(null)

  // Suppression du produit fini lui-même (pas seulement sa BOM), avec impact
  const [deleteProductOpen, setDeleteProductOpen] = useState(false)
  const [deleteProductImpact, setDeleteProductImpact] = useState<DeleteImpact | null>(null)
  const [deletingProduct, setDeletingProduct] = useState(false)

  // Component detail modal
  const [detailModalId, setDetailModalId] = useState<string | null>(null)

  // Duplicate BOM confirmation
  const [dupProduit, setDupProduit] = useState<ProduitFini | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  // Create product dialog
  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [createProductMode, setCreateProductMode] = useState<'composant' | 'produit_fini'>('composant')
  const [newProduct, setNewProduct] = useState({ nom: '', famille: '', statut: 'Composant', prix_ht: '' })
  const [familles, setFamilles] = useState<string[]>([])

  const loadData = useCallback(() => {
    const sb = createSupabaseClient()

    sb.from('produits')
      .select('id, reference, nom')
      .eq('statut', 'Produit fini')
      .order('nom')
      .then(({ data }) => setProduitsFinis(data ?? []))

    // Composants candidats : on autorise aussi les produits finis comme
    // composant (BOM imbriquée / « kit présenté sous une autre forme »).
    sb.from('produits')
      .select('id, reference, nom, statut')
      .in('statut', ['Composant', 'Produit fini'])
      .order('nom')
      .then(({ data }) => setComposants(data ?? []))

    sb.from('familles')
      .select('nom')
      .order('nom')
      .then(({ data }) => {
        const noms = (data ?? []).map((f: { nom: string }) => f.nom)
        setFamilles(noms)
        if (noms.length > 0 && !newProduct.famille) {
          setNewProduct((p) => ({ ...p, famille: noms[0] }))
        }
      })

    sb.from('nomenclatures')
      .select('id, produit_assemble_id, composant_id, quantite, section, composant:composant_id(nom, reference, statut, prix_ht)')
      .order('created_at')
      .then(({ data }) => {
        const rows = (data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          produit_assemble_id: r.produit_assemble_id as string,
          composant_id: r.composant_id as string,
          quantite: r.quantite as number,
          section: (r.section as string | null) ?? null,
          composant_nom: (r.composant as { nom: string } | null)?.nom ?? '',
          composant_ref: (r.composant as { reference: string } | null)?.reference ?? '',
          composant_statut: (r.composant as { statut: string } | null)?.statut ?? '',
          composant_prix: (r.composant as { prix_ht: number } | null)?.prix_ht ?? null,
        }))
        setNomenclatures(rows)
      })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Candidats interdits (anti-cycle) pour la BOM ouverte : le produit lui-même
  // et tous ses ancêtres. Le trigger DB reste le garde-fou dur.
  useEffect(() => {
    if (!selectedProduit) { setInvalidComponentIds(new Set()); return }
    const sb = createSupabaseClient()
    sb.rpc('bom_invalid_components', { p_produit_id: selectedProduit }).then(({ data }) => {
      setInvalidComponentIds(new Set(((data ?? []) as { id: string }[]).map((r) => r.id)))
    })
  }, [selectedProduit, nomenclatures])

  // Coût composants (cascade) de la BOM ouverte : resolve_bom en mode doc
  // explose jusqu'aux feuilles, on somme prix_ht × quantité.
  useEffect(() => {
    if (!selectedProduit) { setBomCost(null); return }
    const sb = createSupabaseClient()
    sb.rpc('resolve_bom', { p_produit_id: selectedProduit, p_quantite: 1 }).then(({ data }) => {
      setBomCost(computeBomCost((data ?? []) as Parameters<typeof computeBomCost>[0]))
    })
  }, [selectedProduit, nomenclatures])

  // Tous les produits finis, y compris sans BOM (#7) — sinon impossible de
  // créer une nomenclature a posteriori sur un produit créé sans composant.
  const groups: BomGroup[] = produitsFinis.map((p) => ({
    produit: p,
    lignes: nomenclatures.filter((n) => n.produit_assemble_id === p.id),
  }))

  const filteredGroups = groups.filter((g) => {
    if (!search.trim()) return true
    const s = normSearch(search)
    return (
      normSearch(g.produit.nom).includes(s) ||
      normSearch(g.produit.reference).includes(s) ||
      g.lignes.some((l) => normSearch(l.composant_nom).includes(s))
    )
  })


  // ─── Detail view ───

  const selectedGroup = selectedProduit
    ? groups.find((g) => g.produit.id === selectedProduit)
    : null

  const selectedProduitData = selectedProduit
    ? produitsFinis.find((p) => p.id === selectedProduit)
    : null

  const selectedLignes = selectedProduit
    ? nomenclatures.filter((n) => n.produit_assemble_id === selectedProduit)
    : []

  // Regroupement par section (#20) — les lignes sans section finissent dans un
  // groupe « Sans section » placé en dernier ; ordre des sections par 1re
  // apparition pour rester stable.
  const sectionedLignes = (() => {
    const order: string[] = []
    const map = new Map<string, NomRow[]>()
    for (const l of selectedLignes) {
      const key = l.section ?? '__no_section__' // sentinelle « sans section »
      if (!map.has(key)) { map.set(key, []); order.push(key) }
      map.get(key)!.push(l)
    }
    order.sort((a, b) => (a === '__no_section__' ? 1 : b === '__no_section__' ? -1 : 0))
    return order.map((key) => ({
      key,
      label: key === '__no_section__' ? 'Sans section' : key,
      lignes: map.get(key)!,
    }))
  })()
  // En-têtes affichés seulement si la BOM est réellement sectionnée
  const showSectionHeaders = sectionedLignes.length > 1 || sectionedLignes[0]?.key !== '__no_section__'

  // ─── Add component ───

  const filteredAddComposants = composants.filter((c) => {
    // Exclude already added
    if (selectedLignes.some((l) => l.composant_id === c.id)) return false
    // Exclude le produit lui-même + ses ancêtres (créerait un cycle)
    if (invalidComponentIds.has(c.id)) return false
    if (!addSearch.trim()) return true
    const s = normSearch(addSearch)
    return normSearch(c.nom).includes(s) || normSearch(c.reference).includes(s)
  })

  // Sections déjà utilisées dans cette BOM (suggestions de saisie)
  const existingSections = Array.from(
    new Set(selectedLignes.map((l) => l.section).filter((s): s is string => !!s)),
  ).sort()

  function toggleAddSelect(composantId: string) {
    setAddSelected((prev) => {
      const next = { ...prev }
      if (next[composantId] !== undefined) delete next[composantId]
      else next[composantId] = '1'
      return next
    })
  }

  async function handleAddComponent() {
    const ids = Object.keys(addSelected)
    if (ids.length === 0 || !selectedProduit) return
    const section = addSection.trim() || null
    const sb = createSupabaseClient()
    const { error } = await sb.from('nomenclatures').insert(
      ids.map((composant_id) => ({
        produit_assemble_id: selectedProduit,
        composant_id,
        quantite: parseDecimal(addSelected[composant_id], 1),
        section,
      })),
    )
    if (error) {
      // Le trigger anti-cycle remonte un message explicite ; on le relaie tel quel.
      toast.error(/cycle/i.test(error.message)
        ? 'Impossible : ce composant créerait un cycle dans la nomenclature.'
        : error.message)
      return
    }
    toast.success(ids.length > 1 ? `${ids.length} composants ajoutés` : 'Composant ajouté')
    setAddOpen(false)
    setAddSelected({})
    setAddSection('')
    setAddSearch('')
    loadData()
  }

  // ─── Edit quantity ───

  function openEdit(row: NomRow) {
    setEditRow(row)
    setEditQuantite(formatQty(row.quantite))
    setEditSection(row.section ?? '')
    setEditOpen(true)
  }

  async function handleSaveEdit() {
    if (!editRow) return
    const sb = createSupabaseClient()
    const { error } = await sb
      .from('nomenclatures')
      .update({ quantite: parseDecimal(editQuantite, 1), section: editSection.trim() || null })
      .eq('id', editRow.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Quantité mise à jour')
    setEditOpen(false)
    loadData()
  }

  // ─── Delete component from BOM ───

  async function handleDeleteComponent(nomId: string) {
    const sb = createSupabaseClient()
    const { error } = await sb.from('nomenclatures').delete().eq('id', nomId)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Composant retiré')
    loadData()
  }

  // ─── Actions groupées sur la sélection ───

  function toggleRowSelect(id: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedRows((prev) =>
      prev.size === selectedLignes.length ? new Set() : new Set(selectedLignes.map((l) => l.id)),
    )
  }

  // Applique (ou retire si null) une section à toutes les lignes cochées.
  async function handleBulkSection(section: string | null) {
    if (selectedRows.size === 0) return
    const sb = createSupabaseClient()
    const { error } = await sb
      .from('nomenclatures')
      .update({ section })
      .in('id', Array.from(selectedRows))
    if (error) { toast.error(error.message); return }
    toast.success(section ? `Section « ${section} » appliquée` : 'Section retirée')
    setSelectedRows(new Set())
    setBulkSection('')
    loadData()
  }

  async function handleBulkDelete() {
    if (selectedRows.size === 0) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('nomenclatures').delete().in('id', Array.from(selectedRows))
    if (error) { toast.error(error.message); return }
    toast.success(`${selectedRows.size} composant(s) retiré(s)`)
    setSelectedRows(new Set())
    loadData()
  }

  // Retire (dégroupe) une section : ses lignes repassent « sans section » (#2).
  async function handleRemoveSection(sectionName: string) {
    const ids = selectedLignes.filter((l) => l.section === sectionName).map((l) => l.id)
    if (ids.length === 0) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('nomenclatures').update({ section: null }).in('id', ids)
    if (error) { toast.error(error.message); return }
    toast.success(`Section « ${sectionName} » supprimée`)
    loadData()
  }

  // ─── Delete entire BOM ───

  async function handleDeleteBom() {
    if (!deleteProduitId) return
    const sb = createSupabaseClient()
    const { data, error } = await sb
      .from('nomenclatures')
      .delete()
      .eq('produit_assemble_id', deleteProduitId)
      .select('id')
    if (error) {
      toast.error(error.message)
      return
    }
    setDeleteOpen(false)
    // Aucune ligne supprimée = ce produit fini n'avait pas de BOM. On ne ment
    // plus avec « Nomenclature supprimée » : le produit lui-même se retire via
    // « Supprimer le produit ».
    if (!data || data.length === 0) {
      toast.info('Aucune BOM à supprimer pour ce produit')
      return
    }
    toast.success('Nomenclature supprimée')
    closeBom()
    loadData()
  }

  // ─── Delete the finished product itself (not just its BOM) ───

  async function analyzeProductDeleteImpact() {
    if (!selectedProduit) return
    setDeleteProductImpact(await getDeleteImpact(selectedProduit))
    setDeleteProductOpen(true)
  }

  async function handleDeleteProduct() {
    if (!selectedProduit || !deleteProductImpact) return
    setDeletingProduct(true)
    try {
      await deleteProduitWithDetach(selectedProduit, deleteProductImpact)
    } catch (e) {
      setDeletingProduct(false)
      toast.error((e as Error).message)
      return
    }
    setDeletingProduct(false)
    toast.success(`Produit « ${selectedProduitData?.nom ?? ''} » supprimé`)
    setDeleteProductOpen(false)
    closeBom()
    loadData()
  }

  // ─── Create new BOM ───

  function openCreateProductFini() {
    setCreateProductMode('produit_fini')
    setNewProduct({ nom: '', famille: familles[0] ?? 'Accessoire', statut: 'Produit fini', prix_ht: '' })
    setCreateProductOpen(true)
  }

  async function handleCreateProductFiniAndBom() {
    if (!newProduct.nom.trim()) {
      toast.error('Nom du produit requis')
      return
    }
    const sb = createSupabaseClient()
    const { data: refData } = await sb.rpc('next_internal_ref')
    const internalRef = (refData as string) ?? `CAD-${Date.now()}`
    const defaultSeuil = await getDefaultSeuilAlerte()

    const { data, error } = await sb
      .from('produits')
      .insert({
        reference: internalRef,
        nom: newProduct.nom.trim(),
        famille: newProduct.famille,
        statut: 'Produit fini',
        prix_ht: parseFloat(newProduct.prix_ht) || 0,
        stock_actuel: 0,
        seuil_alerte: defaultSeuil,
      })
      .select('id, reference, nom')
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(`Produit fini "${data.nom}" créé`)
    setCreateProductOpen(false)
    loadData()
    // Open the new BOM directly
    openBom(data.id)
  }

  // ─── Duplicate BOM ───

  // Duplique le produit fini + sa nomenclature, puis ouvre la copie.
  async function handleConfirmDuplicateBom() {
    if (!dupProduit) return
    setDuplicating(true)
    try {
      const created = await duplicateProduit(dupProduit.id, { withBom: true })
      toast.success(`"${created.nom}" créé (BOM copiée)`)
      setDupProduit(null)
      loadData()
      openBom(created.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
    setDuplicating(false)
  }

  // ─── Create product ───

  function openCreateProduct() {
    setCreateProductMode('composant')
    setNewProduct({ nom: '', famille: familles[0] ?? 'Accessoire', statut: 'Composant', prix_ht: '' })
    setCreateProductOpen(true)
  }

  async function handleCreateProduct() {
    if (!newProduct.nom.trim()) {
      toast.error('Nom du produit requis')
      return
    }
    const sb = createSupabaseClient()
    const { data: refData } = await sb.rpc('next_internal_ref')
    const internalRef = (refData as string) ?? `CAD-${Date.now()}`
    const defaultSeuil = await getDefaultSeuilAlerte()

    const { data, error } = await sb
      .from('produits')
      .insert({
        reference: internalRef,
        nom: newProduct.nom.trim(),
        famille: newProduct.famille,
        statut: newProduct.statut,
        prix_ht: parseFloat(newProduct.prix_ht) || 0,
        stock_actuel: 0,
        seuil_alerte: defaultSeuil,
      })
      .select('id, reference, nom')
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(`Produit "${data.nom}" créé`)
    setCreateProductOpen(false)

    // If it's a composant, pre-select it in the add dialog
    if (newProduct.statut === 'Composant') {
      setAddSelected((prev) => ({ ...prev, [data.id]: '1' }))
    }

    loadData()
  }

  // ─── Render: Detail ───

  if (selectedProduit && selectedProduitData) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={closeBom}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Nomenclature — {selectedProduitData.nom}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              {selectedProduitData.reference}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setAddOpen(true); setAddSearch(''); setAddSelected({}); setAddSection('') }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Ajouter composant
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => { setDeleteProduitId(selectedProduit); setDeleteOpen(true) }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Supprimer BOM
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={analyzeProductDeleteImpact}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Supprimer le produit
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>
                {selectedLignes.length} composant{selectedLignes.length > 1 ? 's' : ''}
              </CardTitle>
              {bomCost && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Coût composants</span>
                  <BomCoutBadge cost={bomCost} />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedLignes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucun composant. Cliquez sur &quot;Ajouter composant&quot; pour commencer.
              </p>
            ) : (
              <>
                {/* Barre d'actions groupées (#3) — visible dès qu'une ligne est cochée */}
                {selectedRows.size > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
                    <span className="text-sm font-medium px-1">{selectedRows.size} sélectionné{selectedRows.size > 1 ? 's' : ''}</span>
                    <Input
                      list="bom-sections-bulk"
                      value={bulkSection}
                      onChange={(e) => setBulkSection(e.target.value)}
                      placeholder="Section à appliquer…"
                      className="h-8 w-56"
                    />
                    <datalist id="bom-sections-bulk">
                      {existingSections.map((s) => <option key={s} value={s} />)}
                    </datalist>
                    <Button size="sm" className="h-8" disabled={!bulkSection.trim()} onClick={() => handleBulkSection(bulkSection.trim())}>
                      Appliquer la section
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => handleBulkSection(null)}>
                      Retirer la section
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive ml-auto" onClick={handleBulkDelete}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Supprimer ({selectedRows.size})
                    </Button>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedRows.size > 0 && selectedRows.size === selectedLignes.length}
                          onCheckedChange={toggleSelectAll}
                          title="Tout sélectionner"
                        />
                      </TableHead>
                      <TableHead>Composant</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead className="text-right">Prix unit.</TableHead>
                      <TableHead className="text-right">Quantité</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sectionedLignes.map((grp) => (
                      <Fragment key={grp.key}>
                        {/* En-tête de section (#20) — masqué s'il n'y a qu'un seul
                            groupe « Sans section » (BOM non organisée) */}
                        {showSectionHeaders && (
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={6} className="py-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{grp.label}</span>
                                {grp.key !== '__no_section__' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    title="Supprimer cette section (les composants restent, sans section)"
                                    onClick={() => handleRemoveSection(grp.key)}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {grp.lignes.map((l) => (
                          <TableRow key={l.id} data-state={selectedRows.has(l.id) ? 'selected' : undefined}>
                            <TableCell>
                              <Checkbox
                                checked={selectedRows.has(l.id)}
                                onCheckedChange={() => toggleRowSelect(l.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <button type="button" className="font-medium text-blue-700 hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setDetailModalId(l.composant_id) }}>
                                  {l.composant_nom}
                                </button>
                                {l.composant_statut === 'Produit fini' && (
                                  <Badge variant="secondary" className="text-[10px] font-normal">Sous-ensemble</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono text-xs">
                              {l.composant_ref}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {hasPrix(l.composant_prix)
                                ? `${l.composant_prix} €`
                                : <span className="text-amber-600 font-medium" title="Prix manquant">— €</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatQty(l.quantite)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEdit(l)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteComponent(l.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        {/* Dialog: Add component(s) — multi-sélection (#21) */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ajouter des composants</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 min-w-0">
              <div className="space-y-1.5">
                <Label>Rechercher un composant</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher... (cochez-en plusieurs)"
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              {/* Wrapper rounded+overflow-hidden pour clipper le fond des lignes
                  sélectionnées (sinon il déborde des coins arrondis) */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                {filteredAddComposants.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Aucun composant disponible
                    </p>
                    <Button size="sm" variant="outline" onClick={() => openCreateProduct()}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Créer un nouveau produit
                    </Button>
                  </div>
                ) : (
                  <>
                    {filteredAddComposants.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent cursor-pointer ${
                          addSelected[c.id] !== undefined ? 'bg-accent' : ''
                        }`}
                        onClick={() => toggleAddSelect(c.id)}
                      >
                        <Checkbox checked={addSelected[c.id] !== undefined} className="pointer-events-none shrink-0" />
                        <span className="font-medium truncate min-w-0">{c.nom}</span>
                        {c.statut === 'Produit fini' && (
                          <Badge variant="secondary" className="text-[10px] font-normal shrink-0">Sous-ensemble</Badge>
                        )}
                        <span className="text-xs text-muted-foreground font-mono shrink-0 ml-auto pl-2">{c.reference}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-accent cursor-pointer border-t"
                      onClick={() => openCreateProduct()}
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium">Créer un nouveau produit</span>
                    </button>
                  </>
                )}
                </div>
              </div>

              {/* Sélection : quantité par composant */}
              {Object.keys(addSelected).length > 0 && (
                <div className="space-y-1.5">
                  <Label>Quantités ({Object.keys(addSelected).length} sélectionné{Object.keys(addSelected).length > 1 ? 's' : ''})</Label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {Object.keys(addSelected).map((cid) => {
                      const c = composants.find((x) => x.id === cid)
                      return (
                        <div key={cid} className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 text-sm truncate" title={c?.nom}>{c?.nom ?? cid}</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={addSelected[cid]}
                            onChange={(e) => setAddSelected((prev) => ({ ...prev, [cid]: e.target.value }))}
                            className="w-20 h-8 text-right shrink-0"
                            placeholder="Qté"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => toggleAddSelect(cid)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Section (optionnel)</Label>
                <Input
                  list="bom-sections"
                  value={addSection}
                  onChange={(e) => setAddSection(e.target.value)}
                  placeholder="Ex : Boîtier externe, Batterie…"
                  className="h-8"
                />
                <datalist id="bom-sections">
                  {existingSections.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
              <Button onClick={handleAddComponent} disabled={Object.keys(addSelected).length === 0}>
                Ajouter{Object.keys(addSelected).length > 0 ? ` (${Object.keys(addSelected).length})` : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Edit quantity */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier la quantité</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm">
                Composant: <strong>{editRow?.composant_nom}</strong>
              </p>
              <div className="space-y-1.5">
                <Label>Quantité</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editQuantite}
                  onChange={(e) => setEditQuantite(e.target.value)}
                  placeholder="Ex : 1,5"
                  className="w-32"
                />
                <p className="text-[11px] text-muted-foreground">Décimales acceptées (fil au mètre : 1,5).</p>
              </div>
              <div className="space-y-1.5">
                <Label>Section (optionnel)</Label>
                <Input
                  list="bom-sections-edit"
                  value={editSection}
                  onChange={(e) => setEditSection(e.target.value)}
                  placeholder="Ex : Boîtier externe…"
                  className="w-full"
                />
                <datalist id="bom-sections-edit">
                  {existingSections.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button onClick={handleSaveEdit}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Delete BOM */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer la nomenclature</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Supprimer toute la nomenclature de <strong>{selectedProduitData.nom}</strong> ?
              Tous les composants seront retirés. Cette action est irréversible.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleDeleteBom}>Supprimer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Delete the finished product itself (with impact analysis) */}
        <Dialog open={deleteProductOpen} onOpenChange={setDeleteProductOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Supprimer ce produit ?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              {(deleteProductImpact?.usedInBoms ?? 0) > 0 ? (
                <>
                  <p>
                    <strong>« {selectedProduitData.nom} »</strong> est utilisé comme composant dans{' '}
                    <strong>{deleteProductImpact!.usedInBoms} nomenclature{deleteProductImpact!.usedInBoms > 1 ? 's' : ''}</strong>.
                  </p>
                  <p className="text-red-700 bg-red-50 rounded-lg p-3">
                    Suppression impossible : retirez-le d&apos;abord de ces nomenclatures.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Supprimer définitivement <strong>« {selectedProduitData.nom} »</strong> ({selectedProduitData.reference}) ?
                    Cette action est irréversible.
                  </p>
                  {deleteProductImpact && (deleteProductImpact.mouvements > 0 || deleteProductImpact.validations > 0 || deleteProductImpact.fabrications > 0) && (
                    <div className="text-muted-foreground space-y-1">
                      <p>Sera conservé mais détaché de ce produit :</p>
                      <ul className="list-disc pl-5">
                        {deleteProductImpact.mouvements > 0 && <li>{deleteProductImpact.mouvements} mouvement{deleteProductImpact.mouvements > 1 ? 's' : ''} de stock</li>}
                        {deleteProductImpact.validations > 0 && <li>{deleteProductImpact.validations} ligne{deleteProductImpact.validations > 1 ? 's' : ''} de facture</li>}
                        {deleteProductImpact.fabrications > 0 && <li>{deleteProductImpact.fabrications} fabrication{deleteProductImpact.fabrications > 1 ? 's' : ''}</li>}
                      </ul>
                    </div>
                  )}
                  {deleteProductImpact && deleteProductImpact.ownBomLines > 0 && (
                    <p className="text-muted-foreground">
                      Sa nomenclature ({deleteProductImpact.ownBomLines} ligne{deleteProductImpact.ownBomLines > 1 ? 's' : ''}) sera supprimée.
                    </p>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteProductOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleDeleteProduct} disabled={deletingProduct || (deleteProductImpact?.usedInBoms ?? 0) > 0}>
                {deletingProduct ? 'Suppression...' : 'Supprimer définitivement'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Create product */}
        <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {createProductMode === 'produit_fini' ? 'Créer un nouveau produit fini' : 'Créer un nouveau produit'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nom du produit</Label>
                <Input
                  value={newProduct.nom}
                  onChange={(e) => setNewProduct((p) => ({ ...p, nom: e.target.value }))}
                  placeholder="Nom du produit"
                />
              </div>
              <div className={createProductMode === 'produit_fini' ? '' : 'grid grid-cols-2 gap-4'}>
                <div className="space-y-1.5">
                  <Label>Famille</Label>
                  <Select
                    value={newProduct.famille}
                    onValueChange={(v) => setNewProduct((p) => ({ ...p, famille: v ?? p.famille }))}
                  >
                    <SelectTrigger>{newProduct.famille || 'Famille'}</SelectTrigger>
                    <SelectContent>
                      {familles.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {createProductMode !== 'produit_fini' && (
                  <div className="space-y-1.5">
                    <Label>Statut</Label>
                    <Select
                      value={newProduct.statut}
                      onValueChange={(v) => setNewProduct((p) => ({ ...p, statut: v ?? p.statut }))}
                    >
                      <SelectTrigger>{newProduct.statut}</SelectTrigger>
                      <SelectContent>
                        {STATUTS_PRODUIT.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Prix HT unitaire</Label>
                <Input
                  type="number"
                  value={newProduct.prix_ht}
                  onChange={(e) => setNewProduct((p) => ({ ...p, prix_ht: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateProductOpen(false)}>Annuler</Button>
              <Button onClick={createProductMode === 'produit_fini' ? handleCreateProductFiniAndBom : handleCreateProduct}>
                <Plus className="h-4 w-4 mr-1" />
                Créer le produit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ComposantModal
          composantId={detailModalId}
          open={!!detailModalId}
          onClose={() => setDetailModalId(null)}
          onChanged={loadData}
        />
      </div>
    )
  }

  // ─── Render: List ───

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nomenclatures (BOM)</h1>
        <Button onClick={() => openCreateProductFini()}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouvelle nomenclature
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucune nomenclature trouvée.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((g) => (
            <Card
              key={g.produit.id}
              className="cursor-pointer hover:border-[#a6cb4d]/50 transition-colors"
              onClick={() => openBom(g.produit.id)}
            >
              <CardContent className="py-3">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{g.produit.nom}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-2">
                      {g.produit.reference}
                    </span>
                  </div>
                  {g.lignes.length === 0 ? (
                    <span className="text-sm text-amber-600">Aucune BOM — cliquer pour la créer</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {g.lignes.length} composant{g.lignes.length > 1 ? 's' : ''}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Dupliquer cette nomenclature"
                    onClick={(e) => { e.stopPropagation(); setDupProduit(g.produit) }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: Create product fini */}
      <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Créer un nouveau produit fini
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom du produit</Label>
              <Input
                value={newProduct.nom}
                onChange={(e) => setNewProduct((p) => ({ ...p, nom: e.target.value }))}
                placeholder="Nom du produit"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Famille</Label>
              <Select
                value={newProduct.famille}
                onValueChange={(v) => setNewProduct((p) => ({ ...p, famille: v ?? p.famille }))}
              >
                <SelectTrigger>{newProduct.famille || 'Famille'}</SelectTrigger>
                <SelectContent>
                  {familles.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prix HT unitaire</Label>
              <Input
                type="number"
                value={newProduct.prix_ht}
                onChange={(e) => setNewProduct((p) => ({ ...p, prix_ht: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateProductOpen(false)}>Annuler</Button>
            <Button onClick={handleCreateProductFiniAndBom}>
              <Plus className="h-4 w-4 mr-1" />
              Créer le produit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmation duplication BOM */}
      <Dialog open={!!dupProduit} onOpenChange={(o) => { if (!o) setDupProduit(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dupliquer cette nomenclature ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Un nouveau produit fini <strong>&quot;{dupProduit?.nom} (copie)&quot;</strong> sera créé
            avec une nouvelle référence interne, un stock à 0 et tous les composants
            de la nomenclature. Elle s&apos;ouvrira pour l&apos;éditer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupProduit(null)}>Annuler</Button>
            <Button onClick={handleConfirmDuplicateBom} disabled={duplicating}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              {duplicating ? 'Duplication...' : 'Dupliquer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// useSearchParams impose une frontière Suspense au prerender.
export default function NomenclaturesPage() {
  return (
    <Suspense>
      <NomenclaturesContent />
    </Suspense>
  )
}
