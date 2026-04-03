'use client'

import { useEffect, useState } from 'react'
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
import { StockBadge } from '@/components/stock-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle,
  ShieldAlert,
  Clock,
  Activity,
} from 'lucide-react'

interface KPIs {
  stockNegatif: number
  sousSeuil: number
  enAttente: number
  mouvementsDuJour: number
}

interface AlerteRow {
  id: string
  reference: string
  nom: string
  famille: string
  statut: string
  stock_actuel: number
  seuil_alerte: number
  marge: number
}

interface MouvementRow {
  id: string
  description: string
  date: string
  type: string
  quantite: number
  source: string
}

const KPI_CONFIG = [
  { key: 'stockNegatif' as const, title: 'Stock negatif', icon: ShieldAlert, color: 'text-red-600' },
  { key: 'sousSeuil' as const, title: "Sous seuil d'alerte", icon: AlertTriangle, color: 'text-amber-600' },
  { key: 'enAttente' as const, title: 'En attente validation', icon: Clock, color: 'text-blue-600' },
  { key: 'mouvementsDuJour' as const, title: 'Mouvements du jour', icon: Activity, color: 'text-foreground' },
]

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [alertes, setAlertes] = useState<AlerteRow[]>([])
  const [mouvements, setMouvements] = useState<MouvementRow[]>([])

  useEffect(() => {
    const sb = createSupabaseClient()

    async function load() {
      const [negRes, seuilRes, attenteRes, mouvJourRes, alerteRes, mouvRes] =
        await Promise.all([
          sb
            .from('produits')
            .select('id', { count: 'exact', head: true })
            .lt('stock_actuel', 0),
          sb.from('v_stock_bas').select('id', { count: 'exact', head: true }),
          sb
            .from('file_validation')
            .select('id', { count: 'exact', head: true })
            .in('statut', ['À valider', 'A valider']),
          sb
            .from('mouvements')
            .select('id', { count: 'exact', head: true })
            .eq('date', new Date().toISOString().split('T')[0]),
          sb
            .from('v_stock_bas')
            .select('*')
            .order('marge', { ascending: true })
            .limit(10),
          sb
            .from('mouvements')
            .select('id, description, date, type, quantite, source')
            .order('created_at', { ascending: false })
            .limit(10),
        ])

      setKpis({
        stockNegatif: negRes.count ?? 0,
        sousSeuil: seuilRes.count ?? 0,
        enAttente: attenteRes.count ?? 0,
        mouvementsDuJour: mouvJourRes.count ?? 0,
      })
      setAlertes((alerteRes.data as AlerteRow[]) ?? [])
      setMouvements((mouvRes.data as MouvementRow[]) ?? [])
    }

    load()
  }, [])

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vue d&apos;ensemble de l&apos;etat du stock
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CONFIG.map(({ key, title, icon: Icon, color }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              {kpis === null ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className={`text-3xl font-bold tabular-nums ${color}`}>
                  {kpis[key]}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertes stock</CardTitle>
        </CardHeader>
        <CardContent>
          {alertes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune alerte de stock.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Ref interne</TableHead>
                  <TableHead>Famille</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Seuil</TableHead>
                  <TableHead className="text-right">Marge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.nom}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{a.reference}</TableCell>
                    <TableCell className="text-muted-foreground">{a.famille}</TableCell>
                    <TableCell className="text-right">
                      <StockBadge
                        stockActuel={a.stock_actuel}
                        seuilAlerte={a.seuil_alerte}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.seuil_alerte}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.marge}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Derniers mouvements</CardTitle>
        </CardHeader>
        <CardContent>
          {mouvements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mouvement.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Quantite</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mouvements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="tabular-nums">{m.date}</TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {m.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.quantite}</TableCell>
                    <TableCell className="text-muted-foreground">{m.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
