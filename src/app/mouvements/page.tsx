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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Pencil, Trash2, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TYPES = ['Tous', 'Entrée', 'Sortie', 'Fabrication', 'Ajustement']
const EDIT_TYPES = ['Entrée', 'Sortie', 'Fabrication', 'Ajustement']
const SOURCES = ['Facture auto', 'Fabrication', 'Manuel', 'Ajustement']
const PAGE_SIZE = 20

interface Mouvement {
  id: string
  description: string
  date: string
  type: string
  quantite: number
  source: string
  ref_facture: string | null
  valide_par: string | null
  notes: string | null
  produit_id: string | null
}

export default function MouvementsPage() {
  const [mouvements, setMouvements] = useState<Mouvement[]>([])
  const [typeFilter, setTypeFilter] = useState('Tous')
  const [factureFilter, setFactureFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [editOpen, setEditOpen] = useState(false)
  const [editMouvement, setEditMouvement] = useState<Mouvement | null>(null)
  const [editForm, setEditForm] = useState({
    description: '',
    date: '',
    type: '',
    quantite: '',
    source: '',
    ref_facture: '',
    notes: '',
  })

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteMouvements, setDeleteMouvements] = useState<Mouvement[]>([])

  const loadData = useCallback(() => {
    const sb = createSupabaseClient()
    let query = sb
      .from('mouvements')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (typeFilter !== 'Tous') query = query.eq('type', typeFilter)
    if (factureFilter.trim()) query = query.ilike('ref_facture', `%${factureFilter.trim()}%`)
    if (search.trim()) query = query.ilike('description', `%${search.trim()}%`)

    query.then(({ data, count }) => {
      setMouvements((data as Mouvement[]) ?? [])
      setTotal(count ?? 0)
    })
  }, [typeFilter, factureFilter, search, page])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { setSelected(new Set()) }, [mouvements])

  // ─── Selection ───

  const allSelected = mouvements.length > 0 && mouvements.every((m) => selected.has(m.id))
  const someSelected = selected.size > 0

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(mouvements.map((m) => m.id)))
    }
  }

  // ─── Edit ───

  function openEdit(m: Mouvement) {
    setEditMouvement(m)
    setEditForm({
      description: m.description,
      date: m.date,
      type: m.type,
      quantite: String(m.quantite),
      source: m.source,
      ref_facture: m.ref_facture ?? '',
      notes: m.notes ?? '',
    })
    setEditOpen(true)
  }

  async function handleSaveEdit() {
    if (!editMouvement) return
    const sb = createSupabaseClient()
    const oldQty = editMouvement.quantite
    const newQty = parseFloat(editForm.quantite)
    const diff = newQty - oldQty

    const { error } = await sb
      .from('mouvements')
      .update({
        description: editForm.description,
        date: editForm.date,
        type: editForm.type,
        quantite: newQty,
        source: editForm.source,
        ref_facture: editForm.ref_facture || null,
        notes: editForm.notes || null,
      })
      .eq('id', editMouvement.id)

    if (error) { toast.error(error.message); return }

    if (diff !== 0 && editMouvement.produit_id) {
      const { data: produit } = await sb
        .from('produits')
        .select('stock_actuel')
        .eq('id', editMouvement.produit_id)
        .single()
      if (produit) {
        await sb
          .from('produits')
          .update({ stock_actuel: produit.stock_actuel + diff })
          .eq('id', editMouvement.produit_id)
      }
    }

    toast.success('Mouvement modifie')
    setEditOpen(false)
    loadData()
  }

  // ─── Delete (single or batch) ───

  function openDeleteSingle(m: Mouvement) {
    setDeleteMouvements([m])
    setDeleteOpen(true)
  }

  function openDeleteBatch() {
    const items = mouvements.filter((m) => selected.has(m.id))
    if (items.length === 0) return
    setDeleteMouvements(items)
    setDeleteOpen(true)
  }

  async function handleDelete() {
    if (deleteMouvements.length === 0) return
    const sb = createSupabaseClient()

    for (const m of deleteMouvements) {
      if (m.produit_id) {
        const { data: produit } = await sb
          .from('produits')
          .select('stock_actuel')
          .eq('id', m.produit_id)
          .single()
        if (produit) {
          await sb
            .from('produits')
            .update({ stock_actuel: produit.stock_actuel - m.quantite })
            .eq('id', m.produit_id)
        }
      }
    }

    const ids = deleteMouvements.map((m) => m.id)
    const { error } = await sb
      .from('mouvements')
      .delete()
      .in('id', ids)

    if (error) { toast.error(error.message); return }

    toast.success(`${deleteMouvements.length} mouvement${deleteMouvements.length > 1 ? 's' : ''} supprime${deleteMouvements.length > 1 ? 's' : ''}`)
    setDeleteOpen(false)
    setSelected(new Set())
    loadData()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-semibold tracking-tight">Mouvements</h1>

      <div className="flex gap-4">
        <Select
          value={typeFilter}
          onValueChange={(v) => { setTypeFilter(v ?? 'Tous'); setPage(0) }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="N facture..."
          value={factureFilter}
          onChange={(e) => { setFactureFilter(e.target.value); setPage(0) }}
          className="w-48"
        />

        <Input
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="w-64"
        />
      </div>

      {/* Batch action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selected.size} selectionne{selected.size > 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={openDeleteBatch}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Supprimer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Deselectionner
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{total} mouvement{total > 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantite</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Ref facture</TableHead>
                <TableHead>Par</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mouvements.map((m) => (
                <TableRow
                  key={m.id}
                  className={cn(selected.has(m.id) && 'bg-muted/50')}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(m.id)}
                      onCheckedChange={() => toggleOne(m.id)}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums">{m.date}</TableCell>
                  <TableCell>{m.type}</TableCell>
                  <TableCell className="max-w-sm truncate">{m.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.quantite}</TableCell>
                  <TableCell className="text-muted-foreground">{m.source}</TableCell>
                  <TableCell>
                    {m.ref_facture ? (
                      <button
                        className="inline-flex items-center gap-1 text-sm hover:underline text-blue-600"
                        onClick={async () => {
                          const res = await fetch(`/api/facture-pdf?ref=${encodeURIComponent(m.ref_facture!)}`)
                          if (res.ok) {
                            const { url } = await res.json()
                            window.open(url, '_blank')
                          } else {
                            toast.error('PDF non disponible pour cette facture')
                          }
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {m.ref_facture}
                      </button>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.valide_par ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => openDeleteSingle(m)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Precedent
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Suivant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Edition */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le mouvement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Quantite</Label>
                <Input type="number" value={editForm.quantite} onChange={(e) => setEditForm((f) => ({ ...f, quantite: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={editForm.type} onValueChange={(v) => setEditForm((f) => ({ ...f, type: v ?? f.type }))}>
                  <SelectTrigger>{editForm.type || 'Type'}</SelectTrigger>
                  <SelectContent>
                    {EDIT_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={editForm.source} onValueChange={(v) => setEditForm((f) => ({ ...f, source: v ?? f.source }))}>
                  <SelectTrigger>{editForm.source || 'Source'}</SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ref facture</Label>
              <Input value={editForm.ref_facture} onChange={(e) => setEditForm((f) => ({ ...f, ref_facture: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveEdit}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Suppression */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Supprimer {deleteMouvements.length} mouvement{deleteMouvements.length > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Cette action va supprimer {deleteMouvements.length > 1 ? 'ces mouvements' : 'ce mouvement'} et reverser l&apos;impact sur le stock. Irreversible.
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {deleteMouvements.map((m) => (
              <div key={m.id} className="rounded-md border p-2 text-sm flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{m.date}</span>
                <span className="flex-1 truncate">{m.description}</span>
                <span className="tabular-nums">{m.quantite}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>
              Supprimer {deleteMouvements.length > 1 ? `(${deleteMouvements.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
