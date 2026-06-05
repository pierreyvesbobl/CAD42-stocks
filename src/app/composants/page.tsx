'use client'

import { useEffect, useState, useCallback } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { StockBadge } from '@/components/stock-badge'
import { ComposantModal } from '@/components/composant-modal'
import { ProduitCreateDialog } from '@/components/produit-create-dialog'
import { normSearch } from '@/lib/utils'
import { duplicateProduit } from '@/lib/duplicate-produit'
import { Search, Plus, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface Produit {
  id: string; reference: string; nom: string; description: string | null
  famille: string; statut: string; stock_actuel: number; seuil_alerte: number; prix_ht: number
}

export default function ComposantsPage() {
  const [produits, setProduits] = useState<Produit[]>([])
  const [familles, setFamilles] = useState<string[]>([])
  const [famille, setFamille] = useState('Toutes')
  const [search, setSearch] = useState('')
  const [showObsolete, setShowObsolete] = useState(false)
  const [modalId, setModalId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [dupProduit, setDupProduit] = useState<Produit | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  async function handleConfirmDuplicate() {
    if (!dupProduit) return
    setDuplicating(true)
    try {
      const created = await duplicateProduit(dupProduit.id)
      toast.success(`"${created.nom}" créé`)
      setDupProduit(null)
      loadProduits()
      // Ouvre la fiche pour éditer la copie à la marge
      setModalId(created.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
    setDuplicating(false)
  }

  const loadProduits = useCallback(() => {
    const sb = createSupabaseClient()
    sb.from('produits')
      .select('id, reference, nom, description, famille, statut, stock_actuel, seuil_alerte, prix_ht')
      .in('statut', showObsolete ? ['Composant', 'Obsolète'] : ['Composant'])
      .order('nom')
      .then(({ data }) => setProduits(data ?? []))
  }, [showObsolete])

  useEffect(() => { loadProduits() }, [loadProduits])

  useEffect(() => {
    const sb = createSupabaseClient()
    sb.from('familles').select('nom').order('nom')
      .then(({ data }) => setFamilles((data ?? []).map((f: { nom: string }) => f.nom)))
  }, [])

  const filtered = produits.filter((p) => {
    if (famille !== 'Toutes' && p.famille !== famille) return false
    if (search.trim()) {
      const s = normSearch(search)
      return normSearch(p.nom).includes(s) || normSearch(p.reference).includes(s) || normSearch(p.description).includes(s)
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Composants</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter un composant
        </Button>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher un composant..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Select value={famille} onValueChange={(v) => setFamille(v ?? 'Toutes')}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Famille" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Toutes">Toutes</SelectItem>
            {familles.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={showObsolete} onCheckedChange={(v) => setShowObsolete(!!v)} />
          Afficher les obsolètes
        </label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} composant{filtered.length > 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Famille</TableHead>
                <TableHead>Prix HT</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setModalId(p.id)}>
                  <TableCell>
                    <div className="flex items-center gap-2 max-w-xl">
                      <span className="font-medium truncate min-w-0" title={p.nom}>{p.nom}</span>
                      {p.statut === 'Obsolète' && <Badge className="bg-gray-200 text-gray-700 border-gray-300 text-[10px] shrink-0">obsolète</Badge>}
                    </div>
                    {p.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{p.description}</div>}
                  </TableCell>
                  <TableCell>{p.famille}</TableCell>
                  <TableCell>{p.prix_ht} &euro;</TableCell>
                  <TableCell><StockBadge stockActuel={p.stock_actuel} seuilAlerte={p.seuil_alerte} /></TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Dupliquer ce composant"
                      onClick={(e) => { e.stopPropagation(); setDupProduit(p) }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ComposantModal
        composantId={modalId}
        open={!!modalId}
        onClose={() => setModalId(null)}
        onChanged={loadProduits}
      />

      <ProduitCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultStatut="Composant"
        onCreated={(p) => { loadProduits(); setModalId(p.id) }}
      />

      {/* Dialog: confirmation duplication */}
      <Dialog open={!!dupProduit} onOpenChange={(o) => { if (!o) setDupProduit(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dupliquer ce composant ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Une copie de <strong>&quot;{dupProduit?.nom}&quot;</strong> sera créée avec une nouvelle
            référence interne et un stock à 0. Les références fournisseurs et substituts
            ne sont pas copiés. Sa fiche s&apos;ouvrira pour l&apos;éditer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupProduit(null)}>Annuler</Button>
            <Button onClick={handleConfirmDuplicate} disabled={duplicating}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              {duplicating ? 'Duplication...' : 'Dupliquer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
