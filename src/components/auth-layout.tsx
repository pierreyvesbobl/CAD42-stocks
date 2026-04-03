'use client'

import { usePathname } from 'next/navigation'
import { SidebarNav } from '@/components/sidebar-nav'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="h-full flex">
      <SidebarNav />
      <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
    </div>
  )
}
