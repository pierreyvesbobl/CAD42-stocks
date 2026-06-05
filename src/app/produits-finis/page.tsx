'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { StockBadge } from '@/components/stock-badge'
import { ProduitCreateDialog } from '@/components/produit-create-dialog'
import { normSearch } from '@/lib/utils'
import { duplicateProduit } from '@/lib/duplicate-produit'
import { Search, Plus, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface Produit {
  id: string
  reference: string
  nom: string
  description: string | null
  famille: string
  statut: string
  stock_actuel: number
  seuil_alerte: number
  prix_ht: number
}

export default function ProduitsFinisPage() {
  const router = useRouter()
  const [produits, setProduits] = useState<Produit[]>([])
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  function loadProduits() {
    const sb = createSupabaseClient()
    sb.from('produits')
      .select('id, reference, nom, description, famille, statut, stock_actuel, seuil_alerte, prix_ht')
      .eq('statut', 'Produit fini')
      .order('nom')
      .then(({ data }) => setProduits(data ?? []))
  }

  useEffect(() => { loadProduits() }, [])

  const [dupProduit, setDupProduit] = useState<Produit | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  // Duplique le produit fini ET sa nomenclature, puis ouvre la fiche copie.
  async function handleConfirmDuplicate() {
    if (!dupProduit) return
    setDuplicating(true)
    try {
      const created = await duplicateProduit(dupProduit.id, { withBom: true })
      toast.success(`"${created.nom}" créé (BOM copiée)`)
      router.push(`/catalogue/${created.id}`)
    } catch (e) {
      toast.error((e as Error).message)
      setDuplicating(false)
    }
  }

  const filtered = produits.filter((p) => {
    if (search.trim()) {
      const s = normSearch(search)
      return (
        normSearch(p.nom).includes(s) ||
        normSearch(p.reference).includes(s) ||
        normSearch(p.description).includes(s)
      )
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produits finis</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter un produit fini
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un produit fini..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {filtered.length} produit{filtered.length > 1 ? 's' : ''} fini{filtered.length > 1 ? 's' : ''}
          </CardTitle>
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
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/catalogue/${p.id}`)}
                >
                  <TableCell>
                    <div className="font-medium max-w-xl truncate" title={p.nom}>{p.nom}</div>
                    {p.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">{p.description}</div>
                    )}
                  </TableCell>
                  <TableCell>{p.famille}</TableCell>
                  <TableCell>{p.prix_ht} &euro;</TableCell>
                  <TableCell>
                    <StockBadge
                      stockActuel={p.stock_actuel}
                      seuilAlerte={p.seuil_alerte}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Dupliquer ce produit fini (avec sa BOM)"
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

      <ProduitCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultStatut="Produit fini"
        onCreated={() => loadProduits()}
      />

      {/* Dialog: confirmation duplication */}
      <Dialog open={!!dupProduit} onOpenChange={(o) => { if (!o) setDupProduit(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dupliquer ce produit fini ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Une copie de <strong>&quot;{dupProduit?.nom}&quot;</strong> sera créée avec une nouvelle
            référence interne, un stock à 0 et <strong>sa nomenclature copiée</strong>.
            Sa fiche s&apos;ouvrira pour l&apos;éditer.
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
