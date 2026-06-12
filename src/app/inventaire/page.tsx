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
import { Badge } from '@/components/ui/badge'
import { cn, normSearch } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle, AlertTriangle, Search } from 'lucide-react'

interface Produit {
  id: string
  reference: string
  nom: string
  famille: string
  statut: string
  stock_actuel: number
}

interface LigneInventaire {
  produit: Produit
  stock_constate: string
  checked: boolean
}

const FAMILLES_DEFAULT = ['Toutes', 'RTK', 'Kit', 'Gateway', 'Accessoire', 'Autre']
const FILTRES_ECART = ['Tous', 'Avec écart', 'Vérifiés', 'Non vérifiés']
const STATUTS_FILTRE = ['Tous', 'Composant', 'Produit fini', 'Obsolète']

export default function InventairePage() {
  const [lignes, setLignes] = useState<LigneInventaire[]>([])
  const [famille, setFamille] = useState('Toutes')
  const [statut, setStatut] = useState('Tous')
  const [filtreEcart, setFiltreEcart] = useState('Tous')
  const [search, setSearch] = useState('')
  const [operateur, setOperateur] = useState('Rafa')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [famillesList, setFamillesList] = useState<string[]>(['RTK', 'Kit', 'Gateway', 'Accessoire', 'Autre'])

  const loadProduits = useCallback(() => {
    const sb = createSupabaseClient()
    sb.from('produits')
      .select('id, reference, nom, famille, statut, stock_actuel')
      .order('nom')
      .then(({ data }) => {
        setLignes(
          (data ?? []).map((p) => ({
            produit: p as Produit,
            stock_constate: '',
            checked: false,
          }))
        )
      })
  }, [])

  useEffect(() => { loadProduits() }, [loadProduits])

  useEffect(() => {
    const sb = createSupabaseClient()
    sb.from('familles')
      .select('nom')
      .order('nom')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFamillesList((data as { nom: string }[]).map((f) => f.nom))
        }
      })
  }, [])

  function updateLigne(id: string, stock: string) {
    setLignes((prev) =>
      prev.map((l) =>
        l.produit.id === id
          ? { ...l, stock_constate: stock, checked: stock !== '' }
          : l
      )
    )
  }

  // Stats
  const totalProduits = lignes.length
  const verifies = lignes.filter((l) => l.checked).length
  const avecEcart = lignes.filter((l) => {
    if (!l.checked) return false
    const constate = parseInt(l.stock_constate, 10)
    return !isNaN(constate) && constate !== l.produit.stock_actuel
  }).length

  // Filtered view
  const filtered = lignes.filter((l) => {
    if (famille !== 'Toutes' && l.produit.famille !== famille) return false
    if (statut !== 'Tous' && l.produit.statut !== statut) return false
    if (search.trim()) {
      const s = normSearch(search)
      if (
        !normSearch(l.produit.nom).includes(s) &&
        !normSearch(l.produit.reference).includes(s)
      )
        return false
    }
    if (filtreEcart === 'Avec écart') {
      if (!l.checked) return false
      const constate = parseInt(l.stock_constate, 10)
      return !isNaN(constate) && constate !== l.produit.stock_actuel
    }
    if (filtreEcart === 'Vérifiés') return l.checked
    if (filtreEcart === 'Non vérifiés') return !l.checked
    return true
  })

  // Lines to apply (only those with actual changes)
  const lignesToApply = lignes.filter((l) => {
    if (!l.checked) return false
    const constate = parseInt(l.stock_constate, 10)
    return !isNaN(constate) && constate !== l.produit.stock_actuel
  })

  async function handleApply() {
    if (lignesToApply.length === 0) {
      toast.info('Aucun écart à appliquer')
      setConfirmOpen(false)
      return
    }

    setApplying(true)
    const sb = createSupabaseClient()
    let success = 0
    let errors = 0

    for (const l of lignesToApply) {
      const constate = parseInt(l.stock_constate, 10)
      const diff = constate - l.produit.stock_actuel

      const { error: e1 } = await sb
        .from('produits')
        .update({ stock_actuel: constate })
        .eq('id', l.produit.id)

      if (e1) {
        errors++
        continue
      }

      await sb.from('mouvements').insert({
        description: `Inventaire — ${l.produit.nom}`,
        type: 'Ajustement',
        source: 'Ajustement',
        produit_id: l.produit.id,
        quantite: diff,
        valide_par: operateur,
        notes: `Inventaire: système ${l.produit.stock_actuel} → constaté ${constate} (écart ${diff > 0 ? '+' : ''}${diff})`,
      })

      success++
    }

    setApplying(false)
    setConfirmOpen(false)

    if (errors > 0) {
      toast.warning(`${success} ajustement(s) appliqué(s), ${errors} erreur(s)`)
    } else {
      toast.success(`${success} ajustement(s) appliqué(s)`)
    }

    loadProduits()
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventaire</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saisissez le stock constaté pour chaque produit
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {verifies}/{totalProduits} vérifiés
            </span>
            {avecEcart > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                {avecEcart} écart{avecEcart > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={lignesToApply.length === 0}
          >
            Appliquer les écarts ({lignesToApply.length})
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un produit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statut} onValueChange={(v) => setStatut(v ?? 'Tous')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            {STATUTS_FILTRE.map((s) => (
              <SelectItem key={s} value={s}>{s === 'Tous' ? 'Tous statuts' : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={famille} onValueChange={(v) => setFamille(v ?? 'Toutes')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Famille" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Toutes">Toutes</SelectItem>
            {famillesList.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtreEcart} onValueChange={(v) => setFiltreEcart(v ?? 'Tous')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filtre" />
          </SelectTrigger>
          <SelectContent>
            {FILTRES_ECART.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} produit{filtered.length > 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produit</TableHead>
                <TableHead>Réf interne</TableHead>
                <TableHead>Famille</TableHead>
                <TableHead className="text-right">Stock système</TableHead>
                <TableHead className="text-right w-32">Stock constaté</TableHead>
                <TableHead className="text-right w-24">Écart</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => {
                const constate = parseInt(l.stock_constate, 10)
                const hasValue = l.stock_constate !== '' && !isNaN(constate)
                const ecart = hasValue ? constate - l.produit.stock_actuel : null

                return (
                  <TableRow
                    key={l.produit.id}
                    className={cn(
                      hasValue && ecart === 0 && 'bg-emerald-50/50',
                      hasValue && ecart !== 0 && 'bg-amber-50/50'
                    )}
                  >
                    <TableCell className="font-medium max-w-xl truncate" title={l.produit.nom}>{l.produit.nom}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {l.produit.reference}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.produit.famille}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.produit.stock_actuel}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={l.stock_constate}
                        onChange={(e) => updateLigne(l.produit.id, e.target.value)}
                        className="w-24 ml-auto text-right tabular-nums h-8"
                        placeholder="—"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {hasValue && (
                        <span className="flex items-center justify-end gap-1.5">
                          {ecart === 0 ? (
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <>
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <span
                                className={cn(
                                  'tabular-nums font-medium',
                                  ecart! > 0 ? 'text-emerald-700' : 'text-red-600'
                                )}
                              >
                                {ecart! > 0 ? '+' : ''}{ecart}
                              </span>
                            </>
                          )}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appliquer l&apos;inventaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {lignesToApply.length} produit{lignesToApply.length > 1 ? 's' : ''} avec écart
              {lignesToApply.length > 1 ? 's' : ''} vont être ajusté{lignesToApply.length > 1 ? 's' : ''}.
            </p>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {lignesToApply.map((l) => {
                const constate = parseInt(l.stock_constate, 10)
                const ecart = constate - l.produit.stock_actuel
                return (
                  <div
                    key={l.produit.id}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span className="truncate flex-1">{l.produit.nom}</span>
                    <span className="tabular-nums text-muted-foreground mx-3">
                      {l.produit.stock_actuel} → {constate}
                    </span>
                    <span
                      className={cn(
                        'tabular-nums font-medium',
                        ecart > 0 ? 'text-emerald-700' : 'text-red-600'
                      )}
                    >
                      {ecart > 0 ? '+' : ''}{ecart}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="space-y-1.5 pt-2">
              <label className="text-sm font-medium">Opérateur</label>
              <Input
                value={operateur}
                onChange={(e) => setOperateur(e.target.value)}
                className="w-48"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleApply} disabled={applying}>
              {applying ? 'Application...' : `Appliquer (${lignesToApply.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
