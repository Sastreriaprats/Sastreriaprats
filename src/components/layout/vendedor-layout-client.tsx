'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { VendedorSidebar } from '@/components/layout/vendedor-sidebar'
import { VendedorHeader } from '@/components/layout/vendedor-header'

export function VendedorLayoutClient({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <div className="hidden lg:block">
        <VendedorSidebar collapsed={collapsed} />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <VendedorHeader collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
