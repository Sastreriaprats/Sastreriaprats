'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, UserPlus } from 'lucide-react'
import { useList } from '@/hooks/use-list'
import { listClients } from '@/actions/clients'
import { SastreHeader } from '../../components/sastre-header'
import { CreateClientDialog } from '@/app/(admin)/admin/clientes/create-client-dialog'

function getInitials(c: Record<string, unknown>): string {
  const full = String(c.full_name || `${c.first_name || ''} ${c.last_name || ''}`).trim()
  if (!full) return '?'
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return full.slice(0, 2).toUpperCase()
}

export function ClientesPageContent({ sastreName }: { sastreName: string }) {
  const [showCreate, setShowCreate] = useState(false)
  const {
    data: clients,
    total,
    search,
    setSearch,
    isLoading,
    refresh,
  } = useList(listClients, {
    pageSize: 50,
    defaultSort: 'full_name',
    defaultOrder: 'asc',
  })

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
    >
      <SastreHeader sastreName={sastreName} sectionTitle="Clientes" backHref="/sastre" />
      <main className="flex-1 px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#c9a96e]/80 pointer-events-none" />
            <input
              type="search"
              placeholder="Buscar por nombre, email, teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-12 pl-12 pr-4 rounded-xl border border-[#c9a96e]/20 bg-[#1a2744] text-white placeholder:text-white/40 focus:outline-none focus:border-[#c9a96e]/60 transition-colors touch-manipulation"
              autoComplete="off"
            />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-white/70 text-sm">{total} clientes</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-6 h-12 rounded-xl bg-transparent border-2 border-white/60 text-white font-medium hover:bg-white/5 transition-colors touch-manipulation"
            >
              <UserPlus className="h-5 w-5" />
              Nuevo cliente
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629]"
                  style={{ opacity: 0.7 }}
                />
              ))}
            </div>
          ) : (
            <ul className="space-y-3">
              {clients.map((c: Record<string, unknown>) => (
                <li key={String(c.id)}>
                  <Link
                    href={`/sastre/clientes/${c.id}`}
                    className="block p-5 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.12)] transition-all duration-300 touch-manipulation"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center shrink-0 bg-[#0d1629]/80">
                        <span className="font-serif text-xl text-[#c9a96e] font-medium">
                          {getInitials(c)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-lg text-white truncate">
                          {String(c.full_name || `${c.first_name || ''} ${c.last_name || ''}`).trim() || 'Sin nombre'}
                        </p>
                        <p className="text-sm text-white/60 truncate">
                          {String(c.email || '—')}
                        </p>
                        {c.phone ? (
                          <p className="text-sm text-white/60 truncate">{String(c.phone)}</p>
                        ) : null}
                        <span className="inline-block mt-2 px-2.5 py-0.5 rounded-lg text-xs font-medium bg-[#c9a96e]/20 text-[#c9a96e] border border-[#c9a96e]/30">
                          Cliente
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {!isLoading && clients.length === 0 && (
            <p className="text-center text-white/60 py-12">No hay clientes que coincidan con la búsqueda.</p>
          )}
        </div>
      </main>

      <footer className="py-6 text-center shrink-0">
        <p className="text-xs text-white/20 tracking-widest">
          SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
        </p>
      </footer>

      <CreateClientDialog open={showCreate} onOpenChange={setShowCreate} onSuccess={refresh} />
    </div>
  )
}
