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
import { StockBadge } from '@/components/stock-badge'
import { Search } from 'lucide-react'

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

  useEffect(() => {
    const sb = createSupabaseClient()
    sb.from('produits')
      .select('id, reference, nom, description, famille, statut, stock_actuel, seuil_alerte, prix_ht')
      .eq('statut', 'Produit fini')
      .order('nom')
      .then(({ data }) => setProduits(data ?? []))
  }, [])

  const filtered = produits.filter((p) => {
    if (search.trim()) {
      const s = search.toLowerCase()
      return (
        p.nom.toLowerCase().includes(s) ||
        p.reference.toLowerCase().includes(s) ||
        (p.description ?? '').toLowerCase().includes(s)
      )
    }
    return true
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Produits finis</h1>

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
                    <div className="font-medium">{p.nom}</div>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
