'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UserPlus, ArrowLeft, Loader2 } from 'lucide-react'
import { listClients } from '@/actions/clients'
import { createClientAction } from '@/actions/clients'
import { useAction } from '@/hooks/use-action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NuevaVentaSteps } from '../nueva-venta-steps'
import { toast } from 'sonner'

function getInitials(c: Record<string, unknown>): string {
  const full = String(c.full_name || `${c.first_name || ''} ${c.last_name || ''}`).trim()
  if (!full) return '?'
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return full.slice(0, 2).toUpperCase()
}

function getDisplayName(c: Record<string, unknown>): string {
  return String(c.full_name || `${c.first_name || ''} ${c.last_name || ''}`).trim() || 'Sin nombre'
}

export function NewVentaClienteClient({ tipo }: { tipo: string }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [clients, setClients] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'existente' | 'nuevo'>('existente')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  const fetchClients = useCallback(async () => {
    if (!tipo) return
    setLoading(true)
    try {
      const res = await listClients({
        search: debouncedSearch || undefined,
        pageSize: 100,
        sortBy: 'full_name',
        sortOrder: 'asc',
      })
      const list = res?.success && res.data?.data ? res.data.data : []
      setClients(list)
    } catch {
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [tipo, debouncedSearch])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const handleSelectExisting = (clientId: string) => {
    router.push(`/sastre/nueva-venta/medidas?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}`)
  }

  const [newForm, setNewForm] = useState({ first_name: '', last_name: '', phone: '', email: '' })
  const { execute: createClient, isLoading: isCreating } = useAction(createClientAction, {
    onSuccess: (data) => {
      const clientId = (data as { id?: string })?.id
      if (clientId) {
        toast.success('Cliente creado correctamente')
        router.push(`/sastre/nueva-venta/medidas?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}&nuevo=true`)
      }
    },
    onError: (err) => toast.error(typeof err === 'string' ? err : (err as Error)?.message ?? 'Error al crear el cliente'),
  })

  const handleCreateAndContinue = () => {
    if (!newForm.first_name.trim() || !newForm.last_name.trim()) {
      toast.error('Nombre y apellidos son obligatorios')
      return
    }
    createClient({
      first_name: newForm.first_name.trim(),
      last_name: newForm.last_name.trim(),
      phone: newForm.phone.trim() || null,
      email: newForm.email.trim() || null,
      source: 'sastre',
    })
  }

  if (!tipo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Falta el tipo de pedido. Vuelve al inicio.</p>
        <Button className="min-h-[48px] bg-white/[0.06] border border-white/15 text-white/70 font-medium hover:bg-white/10 hover:text-white transition-all" onClick={() => router.push('/sastre/nueva-venta')}>
          Ir al inicio
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
        <NuevaVentaSteps currentStep={2} tipo={tipo} />

        <h1 className="text-2xl font-serif text-white">Nueva venta — Cliente</h1>

        <Button
          type="button"
          variant="outline"
          className="min-h-[48px] gap-2 !border-[#c9a96e]/50 !bg-[#1a2744] text-[#c9a96e] hover:!bg-[#1e2d4a] hover:!border-[#c9a96e]/70"
          onClick={() => router.push('/sastre/nueva-venta')}
        >
          <ArrowLeft className="h-5 w-5" />
          Volver
        </Button>

        <div className="flex gap-2 border-b border-[#c9a96e]/20 pb-4">
          <button
            type="button"
            onClick={() => setView('existente')}
            className={`min-h-[48px] px-4 rounded-xl font-medium transition-colors touch-manipulation ${
              view === 'existente'
                ? 'bg-[#c9a96e]/20 border-2 border-[#c9a96e]/60 text-[#c9a96e]'
                : 'bg-transparent border border-[#c9a96e]/30 text-white/70 hover:bg-white/5'
            }`}
          >
            Cliente existente
          </button>
          <button
            type="button"
            onClick={() => setView('nuevo')}
            className={`min-h-[48px] px-4 rounded-xl font-medium transition-colors touch-manipulation ${
              view === 'nuevo'
                ? 'bg-[#c9a96e]/20 border-2 border-[#c9a96e]/60 text-[#c9a96e]'
                : 'bg-transparent border border-[#c9a96e]/30 text-white/70 hover:bg-white/5'
            }`}
          >
            Nuevo cliente
          </button>
        </div>

        {view === 'existente' && (
          <>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#c9a96e]/80 pointer-events-none" />
              <input
                type="search"
                placeholder="Buscar por nombre, email, teléfono..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[48px] pl-12 pr-4 rounded-xl border border-[#c9a96e]/20 bg-[#1a2744] text-white placeholder:text-white/40 focus:outline-none focus:border-[#c9a96e]/60 transition-colors touch-manipulation"
                autoComplete="off"
              />
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-white/60">
                <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                <span>Cargando clientes...</span>
              </div>
            )}

            {!loading && (
              <>
                <p className="text-white/50 text-sm">
                  {debouncedSearch
                    ? `Mostrando ${clients.length} resultados.`
                    : `Total: ${clients.length} clientes (orden alfabético). Escribe para filtrar.`}
                </p>
                <ul className="space-y-3">
                  {clients.length === 0 ? (
                    <li className="text-white/60 py-8 text-center rounded-xl border border-[#c9a96e]/20 bg-[#1a2744]/50">
                      {debouncedSearch ? 'No hay clientes que coincidan con la búsqueda.' : 'No hay clientes dados de alta.'}
                    </li>
                  ) : (
                    clients.map((c: Record<string, unknown>) => (
                      <li
                        key={String(c.id)}
                        className="p-5 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="w-12 h-12 rounded-full border border-[#c9a96e]/40 flex items-center justify-center shrink-0 bg-[#0d1629]/80">
                            <span className="font-serif text-lg text-[#c9a96e] font-medium">{getInitials(c)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-serif text-white truncate">{getDisplayName(c)}</p>
                            <p className="text-sm text-white/60 truncate">{String(c.email || '—')}</p>
                            {c.phone != null && c.phone !== '' ? (
                              <p className="text-sm text-white/60 truncate">{String(c.phone)}</p>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          type="button"
                          className="min-h-[48px] shrink-0 bg-[#c9a96e]/20 border border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/30"
                          onClick={() => handleSelectExisting(String(c.id))}
                        >
                          Seleccionar
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </>
        )}

        {view === 'nuevo' && (
          <div className="rounded-2xl border border-[#c9a96e]/20 bg-[#1a2744]/80 p-6 space-y-4">
            <h2 className="text-lg font-serif text-[#c9a96e]">Datos del nuevo cliente</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/80">Nombre *</Label>
                <Input
                  className="min-h-[48px] bg-[#0d1629] border-[#c9a96e]/20 text-white"
                  value={newForm.first_name}
                  onChange={(e) => setNewForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="Nombre"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Apellidos *</Label>
                <Input
                  className="min-h-[48px] bg-[#0d1629] border-[#c9a96e]/20 text-white"
                  value={newForm.last_name}
                  onChange={(e) => setNewForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="Apellidos"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/80">Teléfono</Label>
                <Input
                  className="min-h-[48px] bg-[#0d1629] border-[#c9a96e]/20 text-white"
                  value={newForm.phone}
                  onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Teléfono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Email</Label>
                <Input
                  type="email"
                  className="min-h-[48px] bg-[#0d1629] border-[#c9a96e]/20 text-white"
                  value={newForm.email}
                  onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="Email"
                />
              </div>
            </div>
            <Button
              type="button"
              className="w-full min-h-[48px] bg-[#c9a96e]/20 border border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/30"
              onClick={handleCreateAndContinue}
              disabled={isCreating || !newForm.first_name.trim() || !newForm.last_name.trim()}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Creando...
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5 mr-2" />
                  Crear y continuar
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
