import { ArrowUp, ArrowDown } from 'lucide-react'
import { prixTrend } from '@/lib/prix'

interface PrixTrendProps {
  actuel: number | null | undefined
  precedent: number | null | undefined
}

/**
 * Flèche d'évolution du prix par rapport à la dernière modification.
 * ↑ rouge = hausse, ↓ vert = baisse, rien si stable ou pas d'historique.
 */
export function PrixTrend({ actuel, precedent }: PrixTrendProps) {
  const dir = prixTrend(actuel, precedent)
  if (dir === null || dir === 'flat') return null
  const title = `Ancien prix : ${precedent} € → ${actuel} €`
  if (dir === 'up') {
    return (
      <span className="inline-flex items-center text-red-600" title={title}>
        <ArrowUp className="h-3.5 w-3.5" />
      </span>
    )
  }
  return (
    <span className="inline-flex items-center text-emerald-600" title={title}>
      <ArrowDown className="h-3.5 w-3.5" />
    </span>
  )
}
