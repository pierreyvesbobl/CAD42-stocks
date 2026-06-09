import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BomCost } from '@/lib/prix'

interface BomCoutBadgeProps {
  cost: BomCost
}

/**
 * Badge du coût d'un produit fini calculé depuis sa nomenclature.
 * Vert = tous les composants ont un prix, jaune = au moins un sans prix.
 */
export function BomCoutBadge({ cost }: BomCoutBadgeProps) {
  const montant = cost.cout.toFixed(2)
  if (cost.complet) {
    return (
      <Badge className={cn('font-mono text-xs', 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200')}>
        {montant} €
      </Badge>
    )
  }
  return (
    <Badge
      className={cn('font-mono text-xs', 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200')}
      title={`${cost.nbSansPrix} composant(s) sans prix`}
    >
      ≥ {montant} € · {cost.nbSansPrix} sans prix
    </Badge>
  )
}
