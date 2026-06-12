'use client'

import { useEffect, useState, useCallback } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Search, Undo2, Truck, Undo, PackagePlus } from 'lucide-react'
import { ComposantModal } from '@/components/composant-modal'
import { normSearch } from '@/lib/utils'

// ─── Types ───

interface ProduitLocatif {
  id: string; reference: string; nom: string
  stock_loc_neuf: number         // neuf (parc dédié, distinct du stock vendable)
  stock_loc_retour: number       // retour (occasion)
  stock_loc_en_location: number  // en location (dehors)
}
interface Operateur { id: string; nom: string; email: string | null }

type Mode = 'ajout' | 'mise' | 'retour'

interface LocHistory {
  id: string; produit_id: string; produit_nom: string; quantite: number
  type: string // 'ajout' | 'mise' | 'retour'
  qty_neuf: number; qty_retour: number
  operateur: string; batch_id: string
  cancelled: boolean; cancelled_at: string | null; cancelled_by: string | null
  created_at: string
}

interface OperateurStats { operateur: string; total: number; mises: number; retours: number }

// ─── Page ───

export default function LocationPage() {
  const [tab, setTab] = useState('operation')
  const [mode, setMode] = useState<Mode>('mise')
  const [produits, setProduits] = useState<ProduitLocatif[]>([])
  const [operateurs, setOperateurs] = useState<Operateur[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [quantite, setQuantite] = useState('1')
  const [operateur, setOperateur] = useState('')
  const [loading, setLoading] = useState(false)

  // History
  const [history, setHistory] = useState<LocHistory[]>([])
  const [historySearch, setHistorySearch] = useState('')

  // Cancel dialog
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelItem, setCancelItem] = useState<LocHistory | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Stats
  const [stats, setStats] = useState<OperateurStats[]>([])

  // Component detail modal
  const [detailModalId, setDetailModalId] = useState<string | null>(null)

  const loadProduits = useCallback(() => {
    const sb = createSupabaseClient()
    sb.from('produits')
      .select('id, reference, nom, stock_loc_neuf, stock_loc_retour, stock_loc_en_location')
      .eq('statut', 'Produit fini')
      .order('nom')
      .then(({ data }) => setProduits((data as ProduitLocatif[]) ?? []))
  }, [])

  const loadHistory = useCallback(() => {
    const sb = createSupabaseClient()
    sb.from('location_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setHistory((data as LocHistory[]) ?? []))
  }, [])

  useEffect(() => {
    const sb = createSupabaseClient()
    loadProduits()
    sb.from('operateurs').select('id, nom, email').order('nom')
      .then(({ data }) => {
        const ops = (data ?? []) as Operateur[]
        setOperateurs(ops)
        if (ops.length > 0 && !operateur) setOperateur(ops[0].nom)
      })
    loadHistory()
  }, [loadProduits, loadHistory])

  // Stats (les ajouts au parc ne comptent pas comme activité de location)
  useEffect(() => {
    const map = new Map<string, OperateurStats>()
    for (const h of history) {
      if (h.cancelled || h.type === 'ajout') continue
      if (!map.has(h.operateur)) map.set(h.operateur, { operateur: h.operateur, total: 0, mises: 0, retours: 0 })
      const s = map.get(h.operateur)!
      s.total++
      if (h.type === 'mise') s.mises++; else s.retours++
    }
    setStats(Array.from(map.values()).sort((a, b) => b.total - a.total))
  }, [history])

  // ─── Aperçu de l'opération ───

  const selected = produits.find((p) => p.id === selectedId) ?? null
  const qty = parseInt(quantite, 10) || 0

  // Le parc n'affiche que les produits ayant effectivement des unités locatives.
  const parc = produits.filter((p) => p.stock_loc_neuf + p.stock_loc_retour + p.stock_loc_en_location > 0)

  // Priorité de sortie : retour d'abord, puis neuf.
  const prendreRetour = selected ? Math.min(qty, selected.stock_loc_retour) : 0
  const prendreNeuf = qty - prendreRetour
  const disponibleMise = selected ? selected.stock_loc_retour + selected.stock_loc_neuf : 0
  const disponibleRetour = selected ? selected.stock_loc_en_location : 0

  const blocked = !selected || qty < 1 || (
    mode === 'mise' ? qty > disponibleMise
    : mode === 'retour' ? qty > disponibleRetour
    : false // 'ajout' : aucune contrainte
  )

  // ─── Lancer l'opération ───

  async function handleLancer() {
    if (!selectedId || !operateur || !selected) return
    if (qty < 1) { toast.error('Quantité invalide.'); return }

    setLoading(true)
    const sb = createSupabaseClient()
    const batchId = crypto.randomUUID()

    // Relecture fraîche des buckets locatifs
    const { data: fresh } = await sb.from('produits')
      .select('stock_loc_neuf, stock_loc_retour, stock_loc_en_location')
      .eq('id', selectedId).single()
    if (!fresh) { toast.error('Produit introuvable.'); setLoading(false); return }

    if (mode === 'ajout') {
      await sb.from('produits').update({
        stock_loc_neuf: fresh.stock_loc_neuf + qty,
      }).eq('id', selectedId)

      await sb.from('location_history').insert({
        produit_id: selectedId, produit_nom: selected.nom, quantite: qty,
        type: 'ajout', qty_neuf: qty, qty_retour: 0,
        operateur, batch_id: batchId,
      })
      toast.success(`${qty}x ${selected.nom} ajouté(s) au parc`)
    } else if (mode === 'mise') {
      const available = fresh.stock_loc_retour + fresh.stock_loc_neuf
      if (qty > available) {
        toast.error(`Pas assez d'unités disponibles (dispo : ${available}).`)
        setLoading(false)
        return
      }
      const fromRetour = Math.min(qty, fresh.stock_loc_retour)
      const fromNeuf = qty - fromRetour

      await sb.from('produits').update({
        stock_loc_neuf: fresh.stock_loc_neuf - fromNeuf,
        stock_loc_retour: fresh.stock_loc_retour - fromRetour,
        stock_loc_en_location: fresh.stock_loc_en_location + qty,
      }).eq('id', selectedId)

      await sb.from('location_history').insert({
        produit_id: selectedId, produit_nom: selected.nom, quantite: qty,
        type: 'mise', qty_neuf: fromNeuf, qty_retour: fromRetour,
        operateur, batch_id: batchId,
      })
      toast.success(`${qty}x ${selected.nom} mis en location`)
    } else {
      if (qty > fresh.stock_loc_en_location) {
        toast.error(`Seulement ${fresh.stock_loc_en_location} unité(s) en location.`)
        setLoading(false)
        return
      }
      await sb.from('produits').update({
        stock_loc_en_location: fresh.stock_loc_en_location - qty,
        stock_loc_retour: fresh.stock_loc_retour + qty,
      }).eq('id', selectedId)

      await sb.from('location_history').insert({
        produit_id: selectedId, produit_nom: selected.nom, quantite: qty,
        type: 'retour', qty_neuf: 0, qty_retour: 0,
        operateur, batch_id: batchId,
      })
      toast.success(`${qty}x ${selected.nom} revenu de location`)
    }

    setLoading(false)
    setSelectedId('')
    setQuantite('1')
    loadProduits()
    loadHistory()
  }

  // ─── Annulation ───

  async function handleCancel() {
    if (!cancelItem) return
    setCancelling(true)
    const sb = createSupabaseClient()

    const { data: fresh } = await sb.from('produits')
      .select('stock_loc_neuf, stock_loc_retour, stock_loc_en_location')
      .eq('id', cancelItem.produit_id).single()

    if (fresh) {
      if (cancelItem.type === 'ajout') {
        await sb.from('produits').update({
          stock_loc_neuf: fresh.stock_loc_neuf - cancelItem.quantite,
        }).eq('id', cancelItem.produit_id)
      } else if (cancelItem.type === 'mise') {
        await sb.from('produits').update({
          stock_loc_neuf: fresh.stock_loc_neuf + cancelItem.qty_neuf,
          stock_loc_retour: fresh.stock_loc_retour + cancelItem.qty_retour,
          stock_loc_en_location: fresh.stock_loc_en_location - cancelItem.quantite,
        }).eq('id', cancelItem.produit_id)
      } else {
        await sb.from('produits').update({
          stock_loc_en_location: fresh.stock_loc_en_location + cancelItem.quantite,
          stock_loc_retour: fresh.stock_loc_retour - cancelItem.quantite,
        }).eq('id', cancelItem.produit_id)
      }
    }

    await sb.from('location_history').update({
      cancelled: true, cancelled_at: new Date().toISOString(), cancelled_by: operateur || 'Rafa',
    }).eq('id', cancelItem.id)

    toast.success('Opération annulée — parc réajusté')
    setCancelling(false)
    setCancelOpen(false)
    loadProduits()
    loadHistory()
  }

  const filteredHistory = history.filter((h) => {
    if (!historySearch.trim()) return true
    const s = normSearch(historySearch)
    return normSearch(h.produit_nom).includes(s) || normSearch(h.operateur).includes(s)
  })

  function typeBadge(type: string) {
    if (type === 'ajout') return <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[11px]">Ajout parc</Badge>
    if (type === 'mise') return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[11px]">Mise en location</Badge>
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px]">Retour</Badge>
  }

  const modeTitle = mode === 'ajout' ? 'Ajouter au parc locatif' : mode === 'mise' ? 'Mettre en location' : 'Enregistrer un retour'
  const modeButtonLabel = mode === 'ajout' ? 'Confirmer l’ajout au parc' : mode === 'mise' ? 'Confirmer la mise en location' : 'Confirmer le retour'

  // ─── Render ───

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Location</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="operation">Opération</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
        </TabsList>

        {/* ═══ Tab: Opération ═══ */}
        <TabsContent value="operation" className="mt-4 space-y-6">
          <div className="flex gap-2 flex-wrap">
            <Button variant={mode === 'ajout' ? 'default' : 'outline'} onClick={() => setMode('ajout')}>
              <PackagePlus className="h-4 w-4 mr-1.5" />Ajouter au parc
            </Button>
            <Button variant={mode === 'mise' ? 'default' : 'outline'} onClick={() => setMode('mise')}>
              <Truck className="h-4 w-4 mr-1.5" />Mise en location
            </Button>
            <Button variant={mode === 'retour' ? 'default' : 'outline'} onClick={() => setMode('retour')}>
              <Undo className="h-4 w-4 mr-1.5" />Retour
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{modeTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {produits.length === 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  Aucun produit fini. Créez d&apos;abord un produit fini pour pouvoir le mettre au parc locatif.
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Matériel</Label>
                  <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? '')}>
                    <SelectTrigger>{selectedId ? produits.find((p) => p.id === selectedId)?.nom ?? 'Choisir' : 'Choisir un matériel'}</SelectTrigger>
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

              {/* Aperçu du parc pour le produit sélectionné */}
              {selected && (
                <div className="rounded-lg border p-3 space-y-2 text-sm">
                  <div className="flex gap-4 flex-wrap">
                    <span><span className="text-muted-foreground">Neuf :</span> <strong className="tabular-nums">{selected.stock_loc_neuf}</strong></span>
                    <span><span className="text-muted-foreground">Retour :</span> <strong className="tabular-nums">{selected.stock_loc_retour}</strong></span>
                    <span><span className="text-muted-foreground">En location :</span> <strong className="tabular-nums">{selected.stock_loc_en_location}</strong></span>
                    <span><span className="text-muted-foreground">Total parc :</span> <strong className="tabular-nums">{selected.stock_loc_neuf + selected.stock_loc_retour + selected.stock_loc_en_location}</strong></span>
                  </div>
                  {qty >= 1 && mode === 'ajout' && (
                    <p className="text-muted-foreground">Ajoute <strong>{qty}</strong> unité(s) neuve(s) au parc.</p>
                  )}
                  {qty >= 1 && !blocked && mode === 'mise' && (
                    <p className="text-muted-foreground">
                      Sortie de <strong>{qty}</strong> : {prendreRetour} depuis retour, {prendreNeuf} depuis neuf.
                    </p>
                  )}
                  {qty >= 1 && blocked && mode === 'mise' && (
                    <p className="text-red-700 bg-red-50 rounded-md p-2">
                      Pas assez d&apos;unités disponibles (dispo : {disponibleMise}).
                    </p>
                  )}
                  {qty >= 1 && blocked && mode === 'retour' && (
                    <p className="text-red-700 bg-red-50 rounded-md p-2">
                      Seulement {disponibleRetour} unité(s) en location.
                    </p>
                  )}
                </div>
              )}

              <Button onClick={handleLancer} disabled={blocked || loading || !operateur}>
                {loading ? 'En cours...' : modeButtonLabel}
              </Button>
            </CardContent>
          </Card>

          {/* ═══ Parc locatif ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Parc locatif
                {parc.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({parc.length} matériel{parc.length > 1 ? 's' : ''})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parc.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun matériel dans le parc. Sélectionnez un produit fini et utilisez « Ajouter au parc ».
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matériel</TableHead>
                      <TableHead className="text-right">Neuf</TableHead>
                      <TableHead className="text-right">Retour</TableHead>
                      <TableHead className="text-right">En location</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parc.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <button type="button" className="font-medium text-blue-700 hover:underline cursor-pointer" onClick={() => setDetailModalId(p.id)}>
                            {p.nom}
                          </button>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.stock_loc_neuf}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.stock_loc_retour}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{p.stock_loc_en_location}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.stock_loc_neuf + p.stock_loc_retour + p.stock_loc_en_location}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
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
                      <TableHead>Date</TableHead><TableHead>Opération</TableHead><TableHead>Matériel</TableHead>
                      <TableHead className="text-right">Qté</TableHead><TableHead>Opérateur</TableHead>
                      <TableHead>Statut</TableHead><TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((h) => (
                      <TableRow key={h.id} className={h.cancelled ? 'opacity-50' : ''}>
                        <TableCell className="tabular-nums">{new Date(h.created_at).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>{typeBadge(h.type)}</TableCell>
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
                      <TableHead className="text-right">Mises en location</TableHead>
                      <TableHead className="text-right">Retours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.map((s) => (
                      <TableRow key={s.operateur}>
                        <TableCell className="font-medium">{s.operateur}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.mises}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.retours}</TableCell>
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
              <p><strong>{cancelItem.type === 'ajout' ? 'Ajout au parc' : cancelItem.type === 'mise' ? 'Mise en location' : 'Retour'}</strong> de <strong>{cancelItem.quantite}x {cancelItem.produit_nom}</strong></p>
              <p className="text-muted-foreground">Par {cancelItem.operateur} le {new Date(cancelItem.created_at).toLocaleDateString('fr-FR')}</p>
              <p className="text-amber-700 bg-amber-50 rounded-lg p-3 text-sm">Le parc locatif sera automatiquement réajusté.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Non, garder</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>{cancelling ? 'Annulation...' : 'Oui, annuler'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Component detail modal ═══ */}
      <ComposantModal
        composantId={detailModalId}
        open={!!detailModalId}
        onClose={() => setDetailModalId(null)}
        onChanged={loadProduits}
      />
    </div>
  )
}
