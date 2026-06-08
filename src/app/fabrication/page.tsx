'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { toast } from 'sonner'
import { Search, Undo2, Factory, Wrench, Plus, Trash2, ArrowUp, ArrowDown, Settings2 } from 'lucide-react'
import { ComposantModal } from '@/components/composant-modal'
import { normSearch, formatQty } from '@/lib/utils'

// ─── Types ───

interface ProduitFini { id: string; reference: string; nom: string }
interface Operateur { id: string; nom: string; email: string | null }

interface BomPreview {
  composant_id: string; reference: string; nom: string
  quantite_necessaire: number; stock_actuel: number; stock_apres: number
  is_deficit: boolean; is_alerte: boolean; section: string | null
}

interface SubstitutRow {
  id: string; composant_id: string; substitut_id: string; priorite: number; note: string | null
  substitut_nom: string; substitut_ref: string; substitut_statut: string; substitut_stock: number
}

// Resolved line for the recap
interface ResolvedLine {
  composant_id: string; composant_nom: string; composant_ref: string
  quantite_necessaire: number; stock_actuel: number
  section: string | null
  // Resolution
  status: 'green' | 'orange' | 'red'
  used_id: string // actual component ID to consume (original or substitut)
  used_nom: string
  used_stock: number // stock disponible de l'élément réellement consommé (#22)
  is_substitut: boolean
  checked: boolean
}

interface FabHistory {
  id: string; produit_id: string; produit_nom: string; quantite: number
  mode: string; operateur: string; batch_id: string
  cancelled: boolean; cancelled_at: string | null; cancelled_by: string | null
  created_at: string
}

interface OperateurStats { operateur: string; total: number; fabrications: number; maintenances: number }

interface ComposantOption { id: string; reference: string; nom: string; statut: string }

// ─── Page ───

export default function FabricationPage() {
  const [tab, setTab] = useState('lancer')
  const [mode, setMode] = useState<'fabrication' | 'maintenance'>('fabrication')
  const [produits, setProduits] = useState<ProduitFini[]>([])
  const [operateurs, setOperateurs] = useState<Operateur[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [quantite, setQuantite] = useState('1')
  const [operateur, setOperateur] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<BomPreview[]>([])
  const [resolvedLines, setResolvedLines] = useState<ResolvedLine[]>([])

  // History
  const [history, setHistory] = useState<FabHistory[]>([])
  const [historySearch, setHistorySearch] = useState('')

  // Cancel dialog
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelItem, setCancelItem] = useState<FabHistory | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Stats
  const [stats, setStats] = useState<OperateurStats[]>([])

  // Substitut management modal
  const [subModalOpen, setSubModalOpen] = useState(false)
  const [subModalComposantId, setSubModalComposantId] = useState('')
  const [subModalComposantNom, setSubModalComposantNom] = useState('')
  const [subModalSubs, setSubModalSubs] = useState<SubstitutRow[]>([])
  const [subModalAddSearch, setSubModalAddSearch] = useState('')
  const [subModalAddId, setSubModalAddId] = useState('')
  const [subModalAddNote, setSubModalAddNote] = useState('')
  const [subModalAdding, setSubModalAdding] = useState(false)
  const [allComposants, setAllComposants] = useState<ComposantOption[]>([])

  // Component detail modal
  const [detailModalId, setDetailModalId] = useState<string | null>(null)

  const loadHistory = useCallback(() => {
    const sb = createSupabaseClient()
    sb.from('fabrication_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setHistory((data as FabHistory[]) ?? []))
  }, [])

  useEffect(() => {
    const sb = createSupabaseClient()
    sb.from('produits').select('id, reference, nom').eq('statut', 'Produit fini').order('nom')
      .then(({ data }) => setProduits(data ?? []))

    sb.from('operateurs').select('id, nom, email').order('nom')
      .then(({ data }) => {
        const ops = (data ?? []) as Operateur[]
        setOperateurs(ops)
        if (ops.length > 0 && !operateur) setOperateur(ops[0].nom)
      })

    sb.from('produits').select('id, reference, nom, statut').in('statut', ['Composant', 'Obsolète']).order('nom')
      .then(({ data }) => setAllComposants((data as ComposantOption[]) ?? []))

    loadHistory()
  }, [loadHistory])

  // Stats
  useEffect(() => {
    const map = new Map<string, OperateurStats>()
    for (const h of history) {
      if (h.cancelled) continue
      if (!map.has(h.operateur)) map.set(h.operateur, { operateur: h.operateur, total: 0, fabrications: 0, maintenances: 0 })
      const s = map.get(h.operateur)!
      s.total++
      if (h.mode === 'fabrication') s.fabrications++; else s.maintenances++
    }
    setStats(Array.from(map.values()).sort((a, b) => b.total - a.total))
  }, [history])

  // ─── BOM preview + substitut resolution ───

  async function resolveSubstituts(bomData: BomPreview[]) {
    if (bomData.length === 0) { setResolvedLines([]); return }
    const sb = createSupabaseClient()
    const ids = bomData.map((b) => b.composant_id)

    // 2 requêtes batchées au lieu de 2 par composant — la sélection d'un
    // produit fini était sinon très lente sur les grosses BOM.
    const [prodsRes, subsRes] = await Promise.all([
      sb.from('produits').select('id, statut').in('id', ids),
      sb.from('substituts')
        .select('composant_id, substitut_id, priorite, substitut:substitut_id(nom, reference, statut, stock_actuel)')
        .in('composant_id', ids)
        .order('priorite'),
    ])

    const statutById = new Map(
      ((prodsRes.data ?? []) as { id: string; statut: string }[]).map((p) => [p.id, p.statut])
    )
    const subsByComposant = new Map<string, { substitut_id: string; substitut: unknown }[]>()
    for (const s of ((subsRes.data ?? []) as { composant_id: string; substitut_id: string; substitut: unknown }[])) {
      const list = subsByComposant.get(s.composant_id) ?? []
      list.push(s)
      subsByComposant.set(s.composant_id, list)
    }

    const lines: ResolvedLine[] = bomData.map((b) => {
      const line: ResolvedLine = {
        composant_id: b.composant_id, composant_nom: b.nom, composant_ref: b.reference,
        quantite_necessaire: b.quantite_necessaire, stock_actuel: b.stock_actuel,
        section: b.section ?? null,
        status: 'green', used_id: b.composant_id, used_nom: b.nom,
        used_stock: b.stock_actuel, is_substitut: false, checked: mode === 'fabrication',
      }

      const isObsolete = statutById.get(b.composant_id) === 'Obsolète'

      // In fabrication mode, obsolete components must use substituts
      // In maintenance mode, obsolete components are usable
      const needsSubstitut = isObsolete && mode === 'fabrication'
        ? true
        : b.stock_actuel < b.quantite_necessaire

      if (!needsSubstitut) {
        line.status = isObsolete && mode === 'maintenance' ? 'orange' : 'green'
      } else {
        // Try substituts (déjà triés par priorité)
        let found = false
        for (const s of (subsByComposant.get(b.composant_id) ?? [])) {
          const sub = s.substitut as { nom: string; reference: string; statut: string; stock_actuel: number } | null
          if (!sub) continue
          if (sub.stock_actuel >= b.quantite_necessaire) {
            line.status = 'orange'
            line.used_id = s.substitut_id
            line.used_nom = sub.nom
            line.used_stock = sub.stock_actuel
            line.is_substitut = true
            found = true
            break
          }
        }
        if (!found) {
          line.status = 'red'
          line.checked = false
        }
      }

      return line
    })

    setResolvedLines(lines)
  }

  useEffect(() => {
    if (!selectedId || !quantite) {
      setPreview([])
      setResolvedLines([])
      return
    }
    const sb = createSupabaseClient()
    sb.rpc('resolve_bom', {
      p_produit_id: selectedId,
      p_quantite: parseInt(quantite, 10) || 1,
    }).then(({ data }) => {
      const bomData = (data as BomPreview[]) ?? []
      setPreview(bomData)
      resolveSubstituts(bomData)
    })
  }, [selectedId, quantite, mode])

  function toggleLine(composantId: string) {
    setResolvedLines((prev) => prev.map((l) =>
      l.composant_id === composantId ? { ...l, checked: !l.checked } : l
    ))
  }

  // Tout cocher / décocher (les lignes rouges restent décochées)
  const selectableLines = resolvedLines.filter((l) => l.status !== 'red')
  const allChecked = selectableLines.length > 0 && selectableLines.every((l) => l.checked)
  function toggleAll(checked: boolean) {
    setResolvedLines((prev) => prev.map((l) =>
      l.status === 'red' ? l : { ...l, checked }
    ))
  }

  const hasBlockingRed = resolvedLines.some((l) => l.checked && l.status === 'red')
  const hasAnyRed = resolvedLines.some((l) => l.status === 'red')

  // Regroupement du récap par section (#20) — identique à la vue nomenclature.
  // Pour une option (BOM imbriquée), la section porte le nom du sous-assemblage.
  const sectionedResolved = (() => {
    const order: string[] = []
    const map = new Map<string, ResolvedLine[]>()
    for (const l of resolvedLines) {
      const key = l.section ?? '__no_section__'
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
  const showFabSections = sectionedResolved.length > 1 || sectionedResolved[0]?.key !== '__no_section__'

  // ─── Substitut management modal ───

  async function openSubModal(composantId: string, composantNom: string) {
    setSubModalComposantId(composantId)
    setSubModalComposantNom(composantNom)
    setSubModalAdding(false)
    setSubModalAddSearch('')
    setSubModalAddId('')
    setSubModalAddNote('')
    await loadSubModalSubs(composantId)
    setSubModalOpen(true)
  }

  async function loadSubModalSubs(composantId: string) {
    const sb = createSupabaseClient()
    const { data } = await sb
      .from('substituts')
      .select('id, composant_id, substitut_id, priorite, note, substitut:substitut_id(nom, reference, statut, stock_actuel)')
      .eq('composant_id', composantId)
      .order('priorite')

    setSubModalSubs((data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      composant_id: r.composant_id as string,
      substitut_id: r.substitut_id as string,
      priorite: r.priorite as number,
      note: r.note as string | null,
      substitut_nom: (r.substitut as { nom: string } | null)?.nom ?? '',
      substitut_ref: (r.substitut as { reference: string } | null)?.reference ?? '',
      substitut_statut: (r.substitut as { statut: string } | null)?.statut ?? '',
      substitut_stock: (r.substitut as { stock_actuel: number } | null)?.stock_actuel ?? 0,
    })))
  }

  async function handleSubModalAdd() {
    if (!subModalAddId) return
    const sb = createSupabaseClient()
    const nextPrio = subModalSubs.length > 0 ? Math.max(...subModalSubs.map((s) => s.priorite)) + 1 : 1
    const { error } = await sb.from('substituts').insert({
      composant_id: subModalComposantId,
      substitut_id: subModalAddId,
      priorite: nextPrio,
      note: subModalAddNote.trim() || null,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Substitut ajouté')
    setSubModalAdding(false)
    setSubModalAddId('')
    setSubModalAddNote('')
    await loadSubModalSubs(subModalComposantId)
  }

  async function handleSubModalDelete(subId: string) {
    const sb = createSupabaseClient()
    await sb.from('substituts').delete().eq('id', subId)
    const remaining = subModalSubs.filter((s) => s.id !== subId)
    for (let i = 0; i < remaining.length; i++) {
      await sb.from('substituts').update({ priorite: i + 1 }).eq('id', remaining[i].id)
    }
    await loadSubModalSubs(subModalComposantId)
  }

  async function handleSubModalMove(subId: string, dir: 'up' | 'down') {
    const idx = subModalSubs.findIndex((s) => s.id === subId)
    if (idx < 0) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= subModalSubs.length) return
    const sb = createSupabaseClient()
    const a = subModalSubs[idx], b = subModalSubs[swapIdx]
    await Promise.all([
      sb.from('substituts').update({ priorite: b.priorite }).eq('id', a.id),
      sb.from('substituts').update({ priorite: a.priorite }).eq('id', b.id),
    ])
    await loadSubModalSubs(subModalComposantId)
  }

  function handleSubModalClose() {
    setSubModalOpen(false)
    // Re-resolve substituts
    if (preview.length > 0) {
      resolveSubstituts(preview)
    }
  }

  const filteredSubAddComposants = allComposants.filter((c) => {
    if (c.id === subModalComposantId) return false
    if (subModalSubs.some((s) => s.substitut_id === c.id)) return false
    if (!subModalAddSearch.trim()) return true
    const s = normSearch(subModalAddSearch)
    return normSearch(c.nom).includes(s) || normSearch(c.reference).includes(s)
  })

  // ─── Launch fabrication ───

  async function handleLancer() {
    if (!selectedId || !operateur) return
    if (hasBlockingRed) {
      toast.error('Composants sans stock ni substitut. Impossible de lancer.')
      return
    }

    setLoading(true)
    const sb = createSupabaseClient()
    const batchId = crypto.randomUUID()
    const qty = parseInt(quantite, 10) || 1
    const checkedLines = resolvedLines.filter((l) => l.checked)
    let errors = 0

    for (const line of checkedLines) {
      const { data: produit } = await sb
        .from('produits')
        .select('stock_actuel')
        .eq('id', line.used_id)
        .single()

      if (!produit) { errors++; continue }

      const newStock = produit.stock_actuel - line.quantite_necessaire
      await sb.from('produits').update({ stock_actuel: newStock }).eq('id', line.used_id)

      const desc = line.is_substitut
        ? `${mode === 'fabrication' ? 'Fabrication' : 'Maintenance'} — ${line.used_nom} (substitut de ${line.composant_nom}) (x${line.quantite_necessaire})`
        : `${mode === 'fabrication' ? 'Fabrication' : 'Maintenance'} — ${line.composant_nom} (x${line.quantite_necessaire})`

      await sb.from('mouvements').insert({
        description: desc, type: 'Sortie', source: 'Fabrication',
        produit_id: line.used_id, quantite: -line.quantite_necessaire,
        valide_par: operateur, batch_id: batchId, mode: mode,
        notes: `${mode} — ${produits.find((p) => p.id === selectedId)?.nom ?? ''} x${qty}`,
      })
    }

    if (mode === 'fabrication') {
      const { data: finishedProd } = await sb.from('produits').select('stock_actuel').eq('id', selectedId).single()
      if (finishedProd) {
        await sb.from('produits').update({ stock_actuel: finishedProd.stock_actuel + qty }).eq('id', selectedId)
        await sb.from('mouvements').insert({
          description: `Fabrication — ${produits.find((p) => p.id === selectedId)?.nom ?? ''} (+${qty})`,
          type: 'Entrée', source: 'Fabrication', produit_id: selectedId, quantite: qty,
          valide_par: operateur, batch_id: batchId, mode: mode,
        })
      }
    }

    await sb.from('fabrication_history').insert({
      produit_id: selectedId, produit_nom: produits.find((p) => p.id === selectedId)?.nom ?? '',
      quantite: qty, mode: mode, operateur: operateur, batch_id: batchId,
    })

    if (errors > 0) {
      toast.warning(`${mode === 'fabrication' ? 'Fabrication' : 'Maintenance'} terminée avec ${errors} erreur(s)`)
    } else {
      toast.success(`${mode === 'fabrication' ? 'Fabrication' : 'Maintenance'} de ${qty}x ${produits.find((p) => p.id === selectedId)?.nom ?? ''} réussie`)
    }

    setLoading(false)
    setPreview([])
    setResolvedLines([])
    setSelectedId('')
    setQuantite('1')
    loadHistory()
  }

  // ─── Cancel ───

  async function handleCancel() {
    if (!cancelItem) return
    setCancelling(true)
    const sb = createSupabaseClient()
    const { data: batchMouvements } = await sb.from('mouvements').select('*').eq('batch_id', cancelItem.batch_id)

    if (batchMouvements) {
      for (const m of batchMouvements) {
        const { data: produit } = await sb.from('produits').select('stock_actuel').eq('id', m.produit_id).single()
        if (produit) {
          await sb.from('produits').update({ stock_actuel: produit.stock_actuel - m.quantite }).eq('id', m.produit_id)
        }
      }
      const reversalBatchId = crypto.randomUUID()
      for (const m of batchMouvements) {
        await sb.from('mouvements').insert({
          description: `Annulation — ${m.description}`,
          type: m.quantite > 0 ? 'Sortie' : 'Entrée', source: 'Fabrication',
          produit_id: m.produit_id, quantite: -m.quantite,
          valide_par: operateur || 'Rafa', batch_id: reversalBatchId, mode: 'annulation',
          notes: `Annulation de ${cancelItem.mode} du ${new Date(cancelItem.created_at).toLocaleDateString('fr-FR')}`,
        })
      }
    }

    await sb.from('fabrication_history').update({
      cancelled: true, cancelled_at: new Date().toISOString(), cancelled_by: operateur || 'Rafa',
    }).eq('id', cancelItem.id)

    toast.success('Opération annulée — stock réajusté')
    setCancelling(false)
    setCancelOpen(false)
    loadHistory()
  }

  const filteredHistory = history.filter((h) => {
    if (!historySearch.trim()) return true
    const s = normSearch(historySearch)
    return normSearch(h.produit_nom).includes(s) || normSearch(h.operateur).includes(s) || normSearch(h.mode).includes(s)
  })

  // ─── Render ───

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Fabrication / Maintenance</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="lancer">Lancer</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
        </TabsList>

        {/* ═══ Tab: Lancer ═══ */}
        <TabsContent value="lancer" className="mt-4 space-y-6">
          <div className="flex gap-2">
            <Button variant={mode === 'fabrication' ? 'default' : 'outline'} onClick={() => setMode('fabrication')}>
              <Factory className="h-4 w-4 mr-1.5" />Fabrication
            </Button>
            <Button variant={mode === 'maintenance' ? 'default' : 'outline'} onClick={() => setMode('maintenance')}>
              <Wrench className="h-4 w-4 mr-1.5" />Maintenance
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{mode === 'fabrication' ? 'Lancer une fabrication' : 'Lancer une maintenance'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Produit fini</Label>
                  <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? '')}>
                    <SelectTrigger>{selectedId ? produits.find((p) => p.id === selectedId)?.nom ?? 'Choisir' : 'Choisir un produit'}</SelectTrigger>
                    <SelectContent>{produits.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantité</Label>
                  <Input type="number" min={1} value={quantite} onChange={(e) => setQuantite(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Opérateur</Label>
                  <Select value={operateur} onValueChange={(v) => setOperateur(v ?? '')}>
                    <SelectTrigger>{operateur || 'Choisir un opérateur'}</SelectTrigger>
                    <SelectContent>{operateurs.map((o) => (<SelectItem key={o.id} value={o.nom}>{o.nom}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>

              {hasAnyRed && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  <strong>Stock insuffisant</strong> — Certains composants n&apos;ont pas de substitut disponible.
                  Ajoutez des substituts ou ajustez le stock.
                </div>
              )}

              <Button
                onClick={handleLancer}
                disabled={!selectedId || !operateur || loading || hasBlockingRed || resolvedLines.length === 0}
              >
                {loading ? 'En cours...' : 'Confirmer la ' + (mode === 'fabrication' ? 'fabrication' : 'maintenance')}
              </Button>
            </CardContent>
          </Card>

          {/* ═══ Recap table with substitut resolution ═══ */}
          {resolvedLines.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Récapitulatif</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(v) => toggleAll(!!v)}
                          title={allChecked ? 'Tout décocher' : 'Tout cocher'}
                        />
                      </TableHead>
                      <TableHead>Composant principal</TableHead>
                      <TableHead>Substitut utilisé</TableHead>
                      <TableHead className="text-right">Qté prise</TableHead>
                      <TableHead className="text-right">Stock dispo</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="w-40"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sectionedResolved.map((grp) => (
                      <Fragment key={grp.key}>
                        {showFabSections && (
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={7} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {grp.label}
                            </TableCell>
                          </TableRow>
                        )}
                        {grp.lignes.map((l) => (
                          <TableRow key={l.composant_id}>
                            <TableCell>
                              <Checkbox
                                checked={l.checked}
                                disabled={l.status === 'red'}
                                onCheckedChange={() => toggleLine(l.composant_id)}
                              />
                            </TableCell>
                            <TableCell>
                              <button type="button" className="font-medium text-blue-700 hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setDetailModalId(l.composant_id) }}>
                                {l.composant_nom}
                              </button>
                            </TableCell>
                            <TableCell>
                              {l.is_substitut ? (
                                <span className="text-orange-700">{l.used_nom}</span>
                              ) : (
                                <span className="text-muted-foreground">(composant principal)</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatQty(l.quantite_necessaire)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {/* Stock disponible de l'élément réellement consommé (#22) */}
                              <span className={l.used_stock < l.quantite_necessaire ? 'text-red-600 font-medium' : l.used_stock <= l.quantite_necessaire ? 'text-amber-600' : ''}>
                                {l.used_stock}
                              </span>
                            </TableCell>
                            <TableCell>
                              {l.status === 'green' && <span className="text-lg">&#x2705;</span>}
                              {l.status === 'orange' && <span className="text-lg">&#x26A0;&#xFE0F;</span>}
                              {l.status === 'red' && <span className="text-lg">&#x1F534;</span>}
                            </TableCell>
                            <TableCell>
                              {l.status === 'orange' && (
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openSubModal(l.composant_id, l.composant_nom)}>
                                  <Settings2 className="h-3 w-3 mr-1" />Gérer substituts
                                </Button>
                              )}
                              {l.status === 'red' && (
                                <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => openSubModal(l.composant_id, l.composant_nom)}>
                                  <Plus className="h-3 w-3 mr-1" />Ajouter un substitut
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ Tab: Historique ═══ */}
        <TabsContent value="historique" className="mt-4 space-y-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <CardContent className="pt-6">
              {filteredHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucun historique.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Mode</TableHead><TableHead>Produit</TableHead>
                      <TableHead className="text-right">Qté</TableHead><TableHead>Opérateur</TableHead>
                      <TableHead>Statut</TableHead><TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((h) => (
                      <TableRow key={h.id} className={h.cancelled ? 'opacity-50' : ''}>
                        <TableCell className="tabular-nums">{new Date(h.created_at).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>
                          <Badge className={h.mode === 'fabrication' ? 'bg-blue-100 text-blue-800 border-blue-200 text-[11px]' : 'bg-purple-100 text-purple-800 border-purple-200 text-[11px]'}>
                            {h.mode === 'fabrication' ? 'Fabrication' : 'Maintenance'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{h.produit_nom}</TableCell>
                        <TableCell className="text-right tabular-nums">{h.quantite}</TableCell>
                        <TableCell>{h.operateur}</TableCell>
                        <TableCell>
                          {h.cancelled
                            ? <Badge className="bg-red-100 text-red-800 border-red-200 text-[11px]">Annulée</Badge>
                            : <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px]">OK</Badge>}
                        </TableCell>
                        <TableCell>
                          {!h.cancelled && (
                            <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => { setCancelItem(h); setCancelOpen(true) }}>
                              <Undo2 className="h-3.5 w-3.5 mr-1" />Annuler
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab: Stats ═══ */}
        <TabsContent value="stats" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Statistiques par opérateur</CardTitle></CardHeader>
            <CardContent>
              {stats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Opérateur</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Fabrications</TableHead>
                      <TableHead className="text-right">Maintenances</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.map((s) => (
                      <TableRow key={s.operateur}>
                        <TableCell className="font-medium">{s.operateur}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.fabrications}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.maintenances}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ Dialog: Annuler ═══ */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Annuler cette opération ?</DialogTitle></DialogHeader>
          {cancelItem && (
            <div className="space-y-2 py-2 text-sm">
              <p><strong>{cancelItem.mode === 'fabrication' ? 'Fabrication' : 'Maintenance'}</strong> de <strong>{cancelItem.quantite}x {cancelItem.produit_nom}</strong></p>
              <p className="text-muted-foreground">Par {cancelItem.operateur} le {new Date(cancelItem.created_at).toLocaleDateString('fr-FR')}</p>
              <p className="text-amber-700 bg-amber-50 rounded-lg p-3 text-sm">Le stock sera automatiquement réajusté.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Non, garder</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>{cancelling ? 'Annulation...' : 'Oui, annuler'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Modal: Gestion des substituts ═══ */}
      <Dialog open={subModalOpen} onOpenChange={(open) => { if (!open) handleSubModalClose() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Substituts de &quot;{subModalComposantNom}&quot;</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {subModalSubs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun substitut défini.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Prio</TableHead>
                    <TableHead>Composant</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subModalSubs.map((s, idx) => (
                    <TableRow key={s.id}>
                      <TableCell className="tabular-nums font-medium">{s.priorite}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <button type="button" className="font-medium text-sm text-blue-700 hover:underline cursor-pointer" onClick={() => setDetailModalId(s.substitut_id)}>
                            {s.substitut_nom}
                          </button>
                          {s.substitut_statut === 'Obsolète' && (
                            <Badge className="bg-gray-200 text-gray-700 border-gray-300 text-[10px]">obsolète</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.substitut_stock}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{s.note ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-0.5 justify-end">
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => handleSubModalMove(s.id, 'up')}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === subModalSubs.length - 1} onClick={() => handleSubModalMove(s.id, 'down')}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleSubModalDelete(s.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {subModalAdding ? (
              <div className="space-y-3 border rounded-lg p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Rechercher un composant..." value={subModalAddSearch} onChange={(e) => setSubModalAddSearch(e.target.value)} className="pl-9" />
                </div>
                <div className="max-h-36 overflow-y-auto border rounded-lg">
                  {filteredSubAddComposants.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">Aucun composant disponible</p>
                  ) : (
                    filteredSubAddComposants.map((c) => (
                      <button key={c.id} type="button"
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent cursor-pointer ${subModalAddId === c.id ? 'bg-accent' : ''}`}
                        onClick={() => setSubModalAddId(c.id)}
                      >
                        <span className="font-medium">{c.nom}</span>
                        <span className="text-xs text-muted-foreground font-mono">{c.reference}</span>
                        {c.statut === 'Obsolète' && <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">obsolète</Badge>}
                      </button>
                    ))
                  )}
                </div>
                <Input placeholder="Note (optionnel)" value={subModalAddNote} onChange={(e) => setSubModalAddNote(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSubModalAdd} disabled={!subModalAddId}>Ajouter</Button>
                  <Button size="sm" variant="outline" onClick={() => setSubModalAdding(false)}>Annuler</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { setSubModalAdding(true); setSubModalAddSearch(''); setSubModalAddId('') }}>
                <Plus className="h-3.5 w-3.5 mr-1" />Ajouter un substitut
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSubModalClose}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Component detail modal ═══ */}
      <ComposantModal
        composantId={detailModalId}
        open={!!detailModalId}
        onClose={() => setDetailModalId(null)}
        onChanged={() => { if (preview.length > 0) resolveSubstituts(preview) }}
      />
    </div>
  )
}
