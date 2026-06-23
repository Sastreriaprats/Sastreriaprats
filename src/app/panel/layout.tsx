import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getViewerAccess } from '@/lib/ops/access'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await getViewerAccess()
  // Sin ninguna capa => 404 real (invisibilidad total, no 403).
  if (a.scopes.length === 0) notFound()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <span className="font-semibold text-slate-800">Tesorería</span>
          <nav className="flex items-center gap-1 text-sm">
            {a.scopes.includes('B') && (
              <Link href="/panel/b" className="px-3 py-1.5 rounded-md hover:bg-slate-100 text-slate-600">Efectivo</Link>
            )}
            {a.scopes.includes('C') && (
              <Link href="/panel/c" className="px-3 py-1.5 rounded-md hover:bg-slate-100 text-slate-600">Escenario</Link>
            )}
            {a.canManage && (
              <Link href="/panel/accesos" className="px-3 py-1.5 rounded-md hover:bg-slate-100 text-slate-600">Accesos</Link>
            )}
          </nav>
          <Link href="/admin/dashboard" className="ml-auto px-3 py-1.5 rounded-md hover:bg-slate-100 text-slate-400 text-sm">Volver</Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-6">{children}</main>
    </div>
  )
}
