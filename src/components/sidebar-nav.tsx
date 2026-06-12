'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Package,
  BoxIcon,
  Factory,
  FileCheck,
  ArrowLeftRight,
  ClipboardList,
  Layers,
  Truck,
  Settings,
  LogOut,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/validation', label: 'Validation', icon: FileCheck, badgeKey: 'validation' },
  { href: '/composants', label: 'Composants', icon: Package },
  { href: '/produits-finis', label: 'Produits finis', icon: BoxIcon },
  { href: '/nomenclatures', label: 'Nomenclatures', icon: Layers },
  { href: '/fabrication', label: 'Fabrication', icon: Factory },
  { href: '/location', label: 'Location', icon: Truck },
  { href: '/mouvements', label: 'Mouvements', icon: ArrowLeftRight },
  { href: '/inventaire', label: 'Inventaire', icon: ClipboardList },
  { href: '/parametres', label: 'Paramètres', icon: Settings },
]

export function SidebarNav() {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const sb = createSupabaseClient()
    sb.from('file_validation')
      .select('id', { count: 'exact', head: true })
      .in('statut', ['À valider', 'A valider'])
      .then(({ count }) => setPendingCount(count ?? 0))
    sb.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [pathname])

  async function handleLogout() {
    const sb = createSupabaseClient()
    await sb.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 shrink-0 border-r bg-muted/30 flex flex-col">
      <div className="px-5 py-4 border-b">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_cad42.png"
          alt="CAD 42x"
          className="h-8 w-auto"
        />
        <p className="text-[11px] text-muted-foreground mt-1.5">Gestion de stock</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-[#a6cb4d]/15 text-[#7a9e2a] font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {item.badgeKey === 'validation' && pendingCount > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="border-t px-4 py-3 space-y-2">
        {userEmail && (
          <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-3.5 w-3.5 mr-2" />
          Déconnexion
        </Button>
      </div>
    </aside>
  )
}
