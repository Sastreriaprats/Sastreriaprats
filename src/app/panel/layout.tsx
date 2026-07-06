import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Landmark } from 'lucide-react'
import { getViewerAccess } from '@/lib/ops/access'
import { PanelNav } from './panel-nav'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await getViewerAccess()
  // Sin ninguna capa => 404 real (invisibilidad total, no 403).
  if (a.scopes.length === 0) notFound()

  return (
    <div className="min-h-screen bg-slate-100/70">
      <header className="border-b-2 border-prats-gold bg-prats-navy text-white">
        <div className="mx-auto flex max-w-6xl items-stretch gap-8 px-6">
          <div className="flex items-center gap-3 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-prats-gold/40 bg-white/5">
              <Landmark className="h-4.5 w-4.5 text-prats-gold" />
            </span>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-wide">Tesorería</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Sastrería Prats</p>
            </div>
          </div>
          <PanelNav showB={a.scopes.includes('B')} showC={a.scopes.includes('C')} canManage={a.canManage} />
          <Link
            href="/admin/dashboard"
            className="ml-auto flex items-center gap-1.5 self-center rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
