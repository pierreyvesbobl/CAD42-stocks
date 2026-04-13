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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { ComposantModal } from '@/components/composant-modal'

const TYPES = ['Tous', 'Entree', 'Sortie', 'Fabrication', 'Ajustement']
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
  batch_id: string | null
  mode: string | null
}

interface GroupedEntry {
  type: 'single' | 'batch'
  batch_id: string | null
  mode: string | null
  mouvements: Mouvement[]
  // Summary fields for batch
  date: string
  description: string
  totalQuantite: number
  operateur: string | null
}

export default function MouvementsPage() {
  const [mouvements, setMouvements] = useState<Mouvement[]>([])
  const [typeFilter, setTypeFilter] = useState('Tous')
  const [factureFilter, setFactureFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [detailModalId, setDetailModalId] = useState<string | null>(null)

  const loadData = useCallback(() => {
    const sb = createSupabaseClient()
    let query = sb
      .from('mouvements')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (typeFilter !== 'Tous') {
      if (typeFilter === 'Entree') query = query.eq('type', 'Entrée')
      else if (typeFilter === 'Fabrication') query = query.eq('source', 'Fabrication')
      else query = query.eq('type', typeFilter)
    }
    if (factureFilter.trim()) query = query.ilike('ref_facture', `%${factureFilter.trim()}%`)
    if (search.trim()) query = query.ilike('description', `%${search.trim()}%`)

    query.then(({ data, count }) => {
      setMouvements((data as Mouvement[]) ?? [])
      setTotal(count ?? 0)
    })
  }, [typeFilter, factureFilter, search, page])

  useEffect(() => { loadData() }, [loadData])

  // Group movements by batch_id
  const grouped: GroupedEntry[] = (() => {
    const entries: GroupedEntry[] = []
    const batchMap = new Map<string, Mouvement[]>()
    const singles: Mouvement[] = []

    for (const m of mouvements) {
      if (m.batch_id) {
        if (!batchMap.has(m.batch_id)) batchMap.set(m.batch_id, [])
        batchMap.get(m.batch_id)!.push(m)
      } else {
        singles.push(m)
      }
    }

    // Process in order of appearance (maintain date sort)
    const processed = new Set<string>()
    for (const m of mouvements) {
      if (m.batch_id && !processed.has(m.batch_id)) {
        processed.add(m.batch_id)
        const batchMovements = batchMap.get(m.batch_id)!
        const mode = batchMovements[0]?.mode ?? null

        // Build summary description
        const productNames = [...new Set(batchMovements.map((bm) => {
          const parts = bm.description.split(' — ')
          return parts.length > 1 ? parts[1] : bm.description
        }))]
        const modeLabel = mode === 'annulation' ? 'Annulation' : mode === 'maintenance' ? 'Maintenance' : 'Fabrication'

        entries.push({
          type: 'batch',
          batch_id: m.batch_id,
          mode,
          mouvements: batchMovements,
          date: batchMovements[0].date,
          description: `${modeLabel} — ${batchMovements.length} mouvements`,
          totalQuantite: batchMovements.reduce((sum, bm) => sum + Math.abs(bm.quantite), 0),
          operateur: batchMovements[0].valide_par,
        })
      } else if (!m.batch_id) {
        entries.push({
          type: 'single',
          batch_id: null,
          mode: null,
          mouvements: [m],
          date: m.date,
          description: m.description,
          totalQuantite: m.quantite,
          operateur: m.valide_par,
        })
      }
    }

    return entries
  })()

  function toggleBatch(batchId: string) {
    setExpandedBatches((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  function modeBadge(mode: string | null) {
    switch (mode) {
      case 'fabrication':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[11px]">Fabrication</Badge>
      case 'maintenance':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[11px]">Maintenance</Badge>
      case 'annulation':
        return <Badge className="bg-red-100 text-red-800 border-red-200 text-[11px]">Annulation</Badge>
      default:
        return null
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-semibold tracking-tight">Mouvements</h1>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="pl-9"
          />
        </div>

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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{total} mouvement{total > 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantite</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Ref facture</TableHead>
                <TableHead>Par</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((entry, idx) => {
                if (entry.type === 'batch' && entry.batch_id) {
                  const isExpanded = expandedBatches.has(entry.batch_id)
                  return (
                    <>
                      <TableRow
                        key={`batch-${entry.batch_id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleBatch(entry.batch_id!)}
                      >
                        <TableCell>
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="tabular-nums">{entry.date}</TableCell>
                        <TableCell>{modeBadge(entry.mode)}</TableCell>
                        <TableCell className="max-w-sm">
                          <span className="font-medium">{entry.description}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry.mouvements.length} mvt
                        </TableCell>
                        <TableCell className="text-muted-foreground">Fabrication</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell className="text-muted-foreground">{entry.operateur ?? '—'}</TableCell>
                      </TableRow>
                      {isExpanded && entry.mouvements.map((m) => (
                        <TableRow key={m.id} className="bg-muted/20">
                          <TableCell></TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{m.date}</TableCell>
                          <TableCell className="text-muted-foreground">{m.type}</TableCell>
                          <TableCell className="max-w-sm truncate text-muted-foreground">{m.description}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.quantite}</TableCell>
                          <TableCell className="text-muted-foreground">{m.source}</TableCell>
                          <TableCell>
                            {m.ref_facture ? (
                              <button
                                className="inline-flex items-center gap-1 text-sm hover:underline text-blue-600"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  const res = await fetch(`/api/facture-pdf?ref=${encodeURIComponent(m.ref_facture!)}`)
                                  if (res.ok) {
                                    const { url } = await res.json()
                                    window.open(url, '_blank')
                                  } else {
                                    toast.error('PDF non disponible')
                                  }
                                }}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {m.ref_facture}
                              </button>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{m.valide_par ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </>
                  )
                }

                // Single movement
                const m = entry.mouvements[0]
                return (
                  <TableRow key={m.id}>
                    <TableCell></TableCell>
                    <TableCell className="tabular-nums">{m.date}</TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell className="max-w-sm truncate">
                      {m.produit_id ? (
                        <button type="button" className="text-blue-700 hover:underline cursor-pointer" onClick={() => setDetailModalId(m.produit_id)}>
                          {m.description}
                        </button>
                      ) : m.description}
                    </TableCell>
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
                              toast.error('PDF non disponible')
                            }
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {m.ref_facture}
                        </button>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.valide_par ?? '—'}</TableCell>
                  </TableRow>
                )
              })}
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

      <ComposantModal
        composantId={detailModalId}
        open={!!detailModalId}
        onClose={() => setDetailModalId(null)}
        onChanged={loadData}
      />
    </div>
  )
}
