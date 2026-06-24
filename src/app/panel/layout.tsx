import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { getViewerAccess } from '@/lib/ops/access'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await getViewerAccess()
  // Sin ninguna capa => 404 real (invisibilidad total, no 403).
  if (a.scopes.length === 0) notFound()

  const link = (href: string, label: string) => (
    <Link href={href} className="rounded-lg px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white">
      {label}
    </Link>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-prats-navy text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-2 font-semibold tracking-wide">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
              <Wallet className="h-4 w-4" />
            </span>
            Tesorería
          </div>
          <nav className="flex items-center gap-1">
            {a.scopes.includes('B') && link('/panel/b', 'Efectivo')}
            {a.scopes.includes('C') && link('/panel/c', 'Escenario')}
            {a.canManage && link('/panel/accesos', 'Accesos')}
          </nav>
          <Link href="/admin/dashboard" className="ml-auto rounded-lg px-3 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            Volver
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  )
}
