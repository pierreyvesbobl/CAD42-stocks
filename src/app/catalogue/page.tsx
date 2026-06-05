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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StockBadge } from '@/components/stock-badge'

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

const STATUTS = ['Tous', 'Composant', 'Produit fini', 'Location', 'Obsolète']

export default function CataloguePage() {
  const router = useRouter()
  const [produits, setProduits] = useState<Produit[]>([])
  const [familles, setFamilles] = useState<string[]>([])
  const [famille, setFamille] = useState('Toutes')
  const [statut, setStatut] = useState('Tous')

  useEffect(() => {
    const sb = createSupabaseClient()
    sb.from('familles')
      .select('nom')
      .order('nom')
      .then(({ data }) => setFamilles((data ?? []).map((f: { nom: string }) => f.nom)))
  }, [])

  useEffect(() => {
    const sb = createSupabaseClient()
    let query = sb
      .from('produits')
      .select('id, reference, nom, description, famille, statut, stock_actuel, seuil_alerte, prix_ht')
      .order('nom')

    if (famille !== 'Toutes') query = query.eq('famille', famille)
    if (statut !== 'Tous') query = query.eq('statut', statut)

    query.then(({ data }) => setProduits(data ?? []))
  }, [famille, statut])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Catalogue</h1>

      <div className="flex gap-4">
        <Select value={famille} onValueChange={(v) => setFamille(v ?? 'Toutes')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Famille" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Toutes">Toutes</SelectItem>
            {familles.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statut} onValueChange={(v) => setStatut(v ?? 'Tous')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            {STATUTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {produits.length} produit{produits.length > 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Réf interne</TableHead>
                <TableHead>Famille</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Prix HT</TableHead>
                <TableHead>Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produits.map((p) => (
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
                  <TableCell className="text-muted-foreground font-mono text-xs">{p.reference}</TableCell>
                  <TableCell>{p.famille}</TableCell>
                  <TableCell>{p.statut}</TableCell>
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
