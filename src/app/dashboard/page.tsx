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
import { StockBadge } from '@/components/stock-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface KPIs {
  sousSeuilRefs: number
  sousSeuilQty: number
  enAttente: number
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

const KPI_CONFIG = [
  {
    key: 'enAttente' as const,
    title: 'En attente validation',
    subtitle: 'lignes de facture',
    icon: Clock,
    color: 'text-blue-600',
    href: '/validation',
  },
  {
    key: 'sousSeuilRefs' as const,
    title: "Sous seuil d'alerte",
    subtitle: 'références distinctes',
    icon: AlertTriangle,
    color: 'text-amber-600',
    href: null,
  },
]

const ALERTES_PREVIEW = 10

export default function DashboardPage() {
  const router = useRouter()
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [alertes, setAlertes] = useState<AlerteRow[]>([])
  const [showAllAlertes, setShowAllAlertes] = useState(false)

  useEffect(() => {
    const sb = createSupabaseClient()

    async function load() {
      const [seuilRes, attenteRes, alerteRes, allBas] =
        await Promise.all([
          sb.from('v_stock_bas').select('id', { count: 'exact', head: true }),
          sb
            .from('file_validation')
            .select('id', { count: 'exact', head: true })
            .in('statut', ['À valider', 'A valider']),
          sb
            .from('v_stock_bas')
            .select('*')
            .order('marge', { ascending: true }),
          sb.from('v_stock_bas').select('marge'),
        ])

      const cumulMarge = ((allBas.data as { marge: number }[] | null) ?? [])
        .reduce((acc, r) => acc + Math.max(0, -r.marge), 0)

      setKpis({
        sousSeuilRefs: seuilRes.count ?? 0,
        sousSeuilQty: cumulMarge,
        enAttente: attenteRes.count ?? 0,
      })
      setAlertes((alerteRes.data as AlerteRow[]) ?? [])
    }

    load()
  }, [])

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vue d&apos;ensemble de l&apos;état du stock
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {KPI_CONFIG.map(({ key, title, subtitle, icon: Icon, color, href }) => (
          <Card
            key={key}
            className={href ? 'cursor-pointer hover:border-[#a6cb4d]/50 transition-colors' : ''}
            onClick={href ? () => router.push(href) : undefined}
          >
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
                <>
                  <p className={`text-3xl font-bold tabular-nums ${color}`}>
                    {kpis[key]}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {subtitle}
                    {key === 'sousSeuilRefs' && kpis.sousSeuilQty > 0 && (
                      <> · {kpis.sousSeuilQty} unité{kpis.sousSeuilQty > 1 ? 's' : ''} manquante{kpis.sousSeuilQty > 1 ? 's' : ''} cumulées</>
                    )}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Alertes stock
            {alertes.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                ({alertes.length} référence{alertes.length > 1 ? 's' : ''})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune alerte de stock.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Réf interne</TableHead>
                    <TableHead>Famille</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Seuil</TableHead>
                    <TableHead className="text-right">Marge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllAlertes ? alertes : alertes.slice(0, ALERTES_PREVIEW)).map((a) => (
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
              {alertes.length > ALERTES_PREVIEW && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllAlertes((v) => !v)}
                  >
                    {showAllAlertes ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5 mr-1" />
                        Réduire
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5 mr-1" />
                        Voir tout ({alertes.length - ALERTES_PREVIEW} de plus)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
