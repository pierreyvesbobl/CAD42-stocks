import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StockBadgeProps {
  stockActuel: number
  seuilAlerte: number
}

export function StockBadge({ stockActuel, seuilAlerte }: StockBadgeProps) {
  if (stockActuel < 0) {
    return (
      <Badge variant="destructive" className="font-mono text-xs">
        {stockActuel}
      </Badge>
    )
  }
  if (seuilAlerte > 0 && stockActuel <= seuilAlerte) {
    return (
      <Badge
        className={cn(
          'font-mono text-xs',
          'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200'
        )}
      >
        {stockActuel}
      </Badge>
    )
  }
  return (
    <Badge
      className={cn(
        'font-mono text-xs',
        'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200'
      )}
    >
      {stockActuel}
    </Badge>
  )
}
