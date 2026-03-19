'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Pin, Lock, StickyNote, Plus } from 'lucide-react'
import { formatCurrency, formatDate, getOrderStatusLabel } from '@/lib/utils'
import { MedidasPageContent } from '@/app/(sastre)/sastre/medidas/[clientId]/medidas-page-content'
import { ClientDataTab } from '@/app/(admin)/admin/clientes/[id]/tabs/client-data-tab'
import { ClientSalesTab } from '@/app/(admin)/admin/clientes/[id]/tabs/client-sales-tab'
import { ClientTicketsTab } from '@/app/(admin)/admin/clientes/[id]/tabs/client-tickets-tab'
import { ClientAlterationsTab } from '@/app/(admin)/admin/clientes/[id]/tabs/client-alterations-tab'
import { ClientAppointmentsTab } from '@/app/(admin)/admin/clientes/[id]/tabs/client-appointments-tab'
import { addClientNote } from '@/actions/clients'
import { useAction } from '@/hooks/use-action'
import { toast } from 'sonner'

// Wrapper que fuerza el tema oscuro de shadcn en componentes admin reutilizados
function DarkTab({ children }: { children: React.ReactNode }) {
  return <div className="dark">{children}</div>
}

// ── Tab Resumen ───────────────────────────────────────────────────────────────

function SastreResumenTab({ client }: { client: Record<string, unknown> }) {
  const tallas = client.standard_sizes as Record<string, string> | null
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2 text-sm">
        <p className="text-xs font-semibold text-[#c9a96e] uppercase tracking-wide mb-3">Datos personales</p>
        {!!client.email && <p><span className="text-white/40">Email:</span> <span className="text-white/80">{String(client.email)}</span></p>}
        {!!client.phone && <p><span className="text-white/40">Teléfono:</span> <span className="text-white/80">{String(client.phone)}</span></p>}
        {!!client.date_of_birth && <p><span className="text-white/40">Nacimiento:</span> <span className="text-white/80">{formatDate(String(client.date_of_birth))}</span></p>}
        {!!client.document_number && <p><span className="text-white/40">{String(client.document_type ?? 'Documento')}:</span> <span className="text-white/80">{String(client.document_number)}</span></p>}
        {!!client.address && <p><span className="text-white/40">Dirección:</span> <span className="text-white/80">{String(client.address)}{client.city ? `, ${client.city}` : ''}{client.postal_code ? ` ${client.postal_code}` : ''}</span></p>}
        {!!client.nationality && <p><span className="text-white/40">Nacionalidad:</span> <span className="text-white/80">{String(client.nationality)}</span></p>}
        <p><span className="text-white/40">Alta:</span> <span className="text-white/80">{formatDate(String(client.created_at))}</span></p>
        {!!client.source && <p><span className="text-white/40">Origen:</span> <span className="text-white/80">{String(client.source)}</span></p>}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2 text-sm">
        <p className="text-xs font-semibold text-[#c9a96e] uppercase tracking-wide mb-3">Preferencias y tallas</p>
        {tallas && Object.keys(tallas).length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(tallas).map(([key, val]) => (
              <p key={key}><span className="text-white/40 capitalize">{key}:</span> <span className="text-white/80">{val}</span></p>
            ))}
          </div>
        ) : <p className="text-white/30">Sin tallas registradas</p>}
        {!!client.tags && (client.tags as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            {(client.tags as string[]).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/10">{tag}</span>
            ))}
          </div>
        )}
        {!!client.internal_notes && (
          <div className="mt-3 p-3 rounded-lg bg-white/[0.04] text-xs text-white/60 border border-white/10">
            {String(client.internal_notes)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab Pedidos ───────────────────────────────────────────────────────────────

function SastrePedidosTab({ clientId }: { clientId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [orders, setOrders] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase
          .from('tailoring_orders')
          .select('id, order_number, order_date, total, total_pending, status')
          .eq('client_id', clientId)
          .order('order_date', { ascending: false })
          .limit(100)
        if (!cancelled && data) setOrders(data)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, clientId])

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>

  if (orders.length === 0) return (
    <div className="text-center py-12 text-white/40 text-sm">No hay pedidos para este cliente.</div>
  )

  const BADGE: Record<string, string> = {
    created: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    in_production: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    fitting: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    adjustments: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    finished: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    delivered: 'bg-green-500/20 text-green-300 border-green-500/30',
    incident: 'bg-red-500/20 text-red-300 border-red-500/30',
    cancelled: 'bg-red-700/30 text-red-400 border-red-700/40',
    in_workshop: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    pending_first_fitting: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wide">
            <th className="text-left px-4 py-3 font-medium">Nº</th>
            <th className="text-left px-4 py-3 font-medium">Fecha</th>
            <th className="text-right px-4 py-3 font-medium">Total</th>
            <th className="text-right px-4 py-3 font-medium">Pendiente</th>
            <th className="text-left px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {orders.map((o: any) => (
            <tr key={o.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03]">
              <td className="px-4 py-3 text-white font-medium">{o.order_number}</td>
              <td className="px-4 py-3 text-white/70">{formatDate(o.order_date)}</td>
              <td className="px-4 py-3 text-white text-right">{formatCurrency(o.total)}</td>
              <td className="px-4 py-3 text-right">
                <span className={(o.total_pending ?? 0) > 0 ? 'text-amber-400 font-medium' : 'text-green-400'}>
                  {formatCurrency(o.total_pending ?? 0)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${BADGE[o.status] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
                  {getOrderStatusLabel(o.status)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button type="button" onClick={() => router.push(`/sastre/pedidos/${o.id}`)} className="text-[#c9a96e] text-xs hover:underline">
                  Ver →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Tab Notas ─────────────────────────────────────────────────────────────────

const NOTE_TYPE_LABELS: Record<string, string> = {
  general: 'General', preference: 'Preferencia', complaint: 'Queja',
  compliment: 'Elogio', fitting: 'Prueba', payment: 'Pago',
  incident: 'Incidencia', follow_up: 'Seguimiento', boutique_alteration: 'Arreglo boutique',
}

function SastreNotasTab({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [notes, setNotes] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ note_type: 'general', title: '', content: '' })

  const fetchNotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)
      if (data) setNotes(data)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, clientId])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  const { execute: submitNote, isLoading: isSaving } = useAction(addClientNote, {
    successMessage: 'Nota añadida',
    onSuccess: () => {
      setShowForm(false)
      setForm({ note_type: 'general', title: '', content: '' })
      fetchNotes()
    },
    onError: (err) => toast.error(typeof err === 'string' ? err : 'Error al guardar'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-sm">{notes.length} nota{notes.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium px-3 py-1.5 rounded-lg hover:bg-[#c9a96e]/25 transition-all"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva nota
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/50 text-xs block mb-1">Tipo</label>
              <select
                value={form.note_type}
                onChange={(e) => setForm(p => ({ ...p, note_type: e.target.value }))}
                className="w-full bg-white/[0.07] text-white border border-white/15 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#c9a96e]/50 [&>option]:bg-[#0d1629] [&>option]:text-white"
              >
                {Object.entries(NOTE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/50 text-xs block mb-1">Título (opcional)</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                className="w-full bg-white/[0.07] text-white border border-white/15 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#c9a96e]/50 placeholder:text-white/30"
                placeholder="Título..."
              />
            </div>
          </div>
          <div>
            <label className="text-white/50 text-xs block mb-1">Contenido *</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
              rows={3}
              className="w-full bg-white/[0.07] text-white border border-white/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c9a96e]/50 placeholder:text-white/30 resize-none"
              placeholder="Contenido de la nota..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-white/50 text-xs px-3 py-1.5 rounded-lg hover:text-white transition-colors">Cancelar</button>
            <button
              type="button"
              onClick={() => submitNote({ ...form, client_id: clientId })}
              disabled={isSaving || !form.content}
              className="text-xs bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium px-4 py-1.5 rounded-lg hover:bg-[#c9a96e]/25 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <StickyNote className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">No hay notas para este cliente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note: any) => (
            <div key={note.id} className={`rounded-xl border px-4 py-3 ${note.is_pinned ? 'border-[#c9a96e]/30 bg-[#c9a96e]/5' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/10">
                    {NOTE_TYPE_LABELS[note.note_type] ?? note.note_type}
                  </span>
                  {note.is_pinned && <Pin className="h-3 w-3 text-[#c9a96e]" />}
                  {note.is_private && <Lock className="h-3 w-3 text-white/40" />}
                  {note.title && <span className="text-white text-sm font-medium">{note.title}</span>}
                </div>
                <span className="text-xs text-white/30 shrink-0">{formatDate(note.created_at)}</span>
              </div>
              <p className="text-sm text-white/80 mt-2">{note.content}</p>
              <p className="text-xs text-white/30 mt-1">Por: {note.created_by_name ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  client: Record<string, unknown>
  sastreName: string
  totalSpent: number
  totalPending: number
  orderCount: number
}

const TABS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'datos', label: 'Datos' },
  { value: 'medidas', label: 'Medidas' },
  { value: 'camiseria', label: 'Camisería' },
  { value: 'notas', label: 'Notas' },
  { value: 'pedidos', label: 'Pedidos' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'tickets', label: 'Tickets' },
  { value: 'arreglos', label: 'Arreglos' },
  { value: 'citas', label: 'Citas' },
] as const

export function SastreClienteDetailContent({ client, sastreName, totalSpent, totalPending, orderCount }: Props) {
  const clientId = String(client.id)
  const fullName = String(client.full_name || `${client.first_name || ''} ${client.last_name || ''}`).trim() || 'Sin nombre'
  const averageTicket = Number(client.average_ticket ?? 0)
  const purchaseCount = Number(client.purchase_count ?? 0)
  const discountPct = Number(client.discount_percentage ?? 0)

  const CATEGORY_BADGE: Record<string, string> = {
    vip: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    premium: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    gold: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    ambassador: 'bg-[#c9a96e]/20 text-[#c9a96e] border-[#c9a96e]/30',
    standard: 'bg-white/10 text-white/50 border-white/10',
  }
  const cat = String(client.category ?? 'standard')

  const kpis = [
    { label: 'Total gastado', value: formatCurrency(totalSpent), color: 'text-white' },
    { label: 'Pendiente cobro', value: formatCurrency(totalPending), color: totalPending > 0 ? 'text-amber-400' : 'text-green-400' },
    { label: 'Ticket medio', value: formatCurrency(averageTicket), color: 'text-white' },
    { label: 'Nº compras', value: String(purchaseCount), color: 'text-white' },
    { label: 'Descuento', value: `${discountPct}%`, color: 'text-white' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Cabecera */}
      <div className="rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] p-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl border border-[#c9a96e]/30 bg-[#0d1629]/60 flex items-center justify-center shrink-0">
            <span className="font-serif text-2xl text-[#c9a96e]">{fullName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-xl text-white">{fullName}</h1>
              {!!client.category && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_BADGE[cat] ?? CATEGORY_BADGE.standard}`}>
                  {cat.toUpperCase()}
                </span>
              )}
              {!!client.client_code && (
                <span className="font-mono text-xs text-white/30">{String(client.client_code)}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-white/60">
              {!!client.email && <span>{String(client.email)}</span>}
              {!!client.phone && <span>{String(client.phone)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
            <p className="text-xs text-white/40 uppercase tracking-wide leading-tight">{label}</p>
            <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="resumen">
        <TabsList className="bg-white/[0.06] border border-white/10 h-auto p-1 gap-0.5 flex-wrap">
          {TABS.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="data-[state=active]:bg-[#c9a96e] data-[state=active]:text-[#0a1020] data-[state=active]:shadow-none text-white/60 px-3 py-1.5 text-sm rounded-md transition-all"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-5">
          <TabsContent value="resumen">
            <SastreResumenTab client={client} />
          </TabsContent>

          <TabsContent value="datos">
            <DarkTab>
              <ClientDataTab client={client} />
            </DarkTab>
          </TabsContent>

          <TabsContent value="medidas">
            <MedidasPageContent
              clientId={clientId}
              clientName={fullName}
              sastreName={sastreName}
              hideTabs={['Camisería']}
              embedScroll
            />
          </TabsContent>

          <TabsContent value="camiseria">
            <MedidasPageContent
              clientId={clientId}
              clientName={fullName}
              sastreName={sastreName}
              hideTabs={['Americana', 'Pantalón', 'Chaleco', 'Frac', 'Abrigo']}
              embedScroll
            />
          </TabsContent>

          <TabsContent value="notas">
            <SastreNotasTab clientId={clientId} />
          </TabsContent>

          <TabsContent value="pedidos">
            <SastrePedidosTab clientId={clientId} />
          </TabsContent>

          <TabsContent value="ventas">
            <DarkTab>
              <ClientSalesTab clientId={clientId} />
            </DarkTab>
          </TabsContent>

          <TabsContent value="tickets">
            <DarkTab>
              <ClientTicketsTab clientId={clientId} />
            </DarkTab>
          </TabsContent>

          <TabsContent value="arreglos">
            <DarkTab>
              <ClientAlterationsTab clientId={clientId} />
            </DarkTab>
          </TabsContent>

          <TabsContent value="citas">
            <DarkTab>
              <ClientAppointmentsTab clientId={clientId} />
            </DarkTab>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
