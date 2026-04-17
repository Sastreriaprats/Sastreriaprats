'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { SastreHeader } from '@/app/(sastre)/components/sastre-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import {
  Plus, Search, Loader2, Scissors, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { useActiveStore } from '@/hooks/use-store'
import { createClient } from '@/lib/supabase/client'
import { listAlterations, createAlteration, updateAlterationStatus, type AlterationRow } from '@/actions/alterations'
import { listClients } from '@/actions/clients'
import { useList } from '@/hooks/use-list'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Completado',
  delivered: 'Entregado',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  in_progress: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  delivered: 'bg-green-500/20 text-green-300 border-green-500/30',
}

const TYPE_BADGE: Record<string, string> = {
  order: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  boutique: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  external: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}

const TYPE_LABELS: Record<string, string> = {
  order: 'Pedido',
  boutique: 'Boutique',
  external: 'Externo',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ArreglosContent({ sastreName }: { sastreName: string }) {
  const { activeStoreId } = useActiveStore()
  const [localSearch, setLocalSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const {
    data: alterations,
    total,
    totalPages,
    page,
    setPage,
    isLoading,
    refresh,
  } = useList(listAlterations, {
    pageSize: 25,
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    defaultFilters: {},
  })

  // Re-fetch when filters change
  // Client-side filtering
  const visible = useMemo(() => {
    let result = alterations as AlterationRow[]
    if (localSearch) {
      const q = localSearch.toLowerCase()
      result = result.filter(a =>
        a.description?.toLowerCase().includes(q) ||
        a.clients?.full_name?.toLowerCase().includes(q) ||
        a.garment_type?.toLowerCase().includes(q) ||
        a.alteration_type?.toLowerCase().includes(q) ||
        STATUS_LABELS[a.status]?.toLowerCase().includes(q) ||
        TYPE_LABELS[a.alteration_type]?.toLowerCase().includes(q)
      )
    }
    return result
  }, [alterations, localSearch])

  const handleStatusChange = async (id: string, status: string) => {
    const res = await updateAlterationStatus({ id, status: status as 'pending' | 'in_progress' | 'completed' | 'delivered' })
    if (res.success) {
      toast.success(`Estado actualizado a "${STATUS_LABELS[status]}"`)
      refresh()
    } else {
      toast.error(res.error ?? 'Error al actualizar estado')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SastreHeader sastreName={sastreName} sectionTitle="Arreglos" />

      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white">Arreglos</h1>
              <p className="text-white/60 text-sm mt-0.5">{total} arreglos</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  placeholder="Buscar por cliente, descripción o tipo..."
                  value={localSearch}
                  onChange={e => setLocalSearch(e.target.value)}
                  className="pl-8 w-72 h-9 bg-white/10 border-[#c9a96e]/30 text-white placeholder:text-white/40"
                />
              </div>
              <Button
                className="bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] hover:bg-[#c9a96e]/25"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" /> Nuevo arreglo
              </Button>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16 text-white/50 border border-[#c9a96e]/20 rounded-xl bg-white/5">
              <Scissors className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p>No hay arreglos{localSearch ? ` para "${localSearch}"` : ''}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#c9a96e]/20 bg-white/5 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#c9a96e]/20">
                    <TableHead className="text-white/70 text-xs">Fecha</TableHead>
                    <TableHead className="text-white/70 text-xs">Cliente</TableHead>
                    <TableHead className="text-white/70 text-xs">Tipo</TableHead>
                    <TableHead className="text-white/70 text-xs">Prenda</TableHead>
                    <TableHead className="text-white/70 text-xs">Descripción</TableHead>
                    <TableHead className="text-white/70 text-xs">Asignado</TableHead>
                    <TableHead className="text-white/70 text-xs">Estado</TableHead>
                    <TableHead className="text-white/70 text-xs text-right">Coste</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(a => (
                    <TableRow key={a.id} className="border-[#c9a96e]/10 hover:bg-white/5">
                      <TableCell className="text-white/70 text-sm">{formatDate(a.created_at)}</TableCell>
                      <TableCell className="text-white font-medium text-sm">{a.clients?.full_name ?? '—'}</TableCell>
                      <TableCell>
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${TYPE_BADGE[a.alteration_type] || TYPE_BADGE.external}`}>
                          {TYPE_LABELS[a.alteration_type] || 'Externo'}
                        </span>
                      </TableCell>
                      <TableCell className="text-white/70 text-sm">{a.garment_type || '—'}</TableCell>
                      <TableCell className="text-white/80 text-sm max-w-[200px] truncate">{a.description}</TableCell>
                      <TableCell className="text-white/60 text-sm">{a.assigned_to_profile?.full_name ?? '—'}</TableCell>
                      <TableCell>
                        <Select value={a.status} onValueChange={v => handleStatusChange(a.id, v)}>
                          <SelectTrigger className="h-7 w-28 bg-transparent border-white/10 text-xs text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k} className="text-white text-xs focus:bg-white/10 focus:text-white">{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right text-white font-medium text-sm tabular-nums">
                        {a.has_cost ? formatCurrency(a.cost) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/50">Página {page} de {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Dialog: Nuevo arreglo */}
      <NewAlterationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        storeId={activeStoreId}
        onCreated={refresh}
      />
    </div>
  )
}

// ─── New Alteration Dialog ───────────────────────────────────────────────────

function NewAlterationDialog({
  open,
  onOpenChange,
  storeId,
  onCreated,
  preselectedClientId,
  preselectedOrderId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  storeId: string | null
  onCreated: () => void
  preselectedClientId?: string
  preselectedOrderId?: string
}) {
  const [tab, setTab] = useState<'order' | 'external'>(preselectedOrderId ? 'order' : 'external')
  const [isSaving, setIsSaving] = useState(false)

  // Client search
  const [clientSearch, setClientSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; full_name: string; email: string | null; phone: string | null }[]>([])
  const [clientLoading, setClientLoading] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId ?? '')
  const [selectedClientName, setSelectedClientName] = useState('')

  // Order search (for tab "order")
  const [clientOrders, setClientOrders] = useState<{ id: string; order_number: string; order_date: string; status: string }[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState(preselectedOrderId ?? '')
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Officials
  const [officials, setOfficials] = useState<{ id: string; name: string }[]>([])

  // Form fields
  const [description, setDescription] = useState('')
  const [orderLines, setOrderLines] = useState<any[]>([])
  const [selectedLineId, setSelectedLineId] = useState('')
  const [garmentType, setGarmentType] = useState('')
  const [garmentDescription, setGarmentDescription] = useState('')
  const [alterationDetails, setAlterationDetails] = useState('')
  const [hasCost, setHasCost] = useState(false)
  const [cost, setCost] = useState('')
  const [isIncluded, setIsIncluded] = useState(false)
  const [estimatedCompletion, setEstimatedCompletion] = useState('')
  const [assignedTo, setAssignedTo] = useState('')

  // Debounce client search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(clientSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  // Fetch clients
  useEffect(() => {
    if (!debouncedSearch) { setClientResults([]); return }
    let cancelled = false
    async function search() {
      setClientLoading(true)
      const res = await listClients({ search: debouncedSearch, pageSize: 20, sortBy: 'full_name', sortOrder: 'asc' })
      if (!cancelled && res.success) {
        setClientResults((res.data.data as { id: string; full_name: string; email: string | null; phone: string | null }[]) || [])
      }
      if (!cancelled) setClientLoading(false)
    }
    search()
    return () => { cancelled = true }
  }, [debouncedSearch])

  // Load client orders when client selected (tab order)
  useEffect(() => {
    if (!selectedClientId || tab !== 'order') { setClientOrders([]); return }
    let cancelled = false
    async function loadOrders() {
      setOrdersLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('tailoring_orders')
        .select('id, order_number, order_date, status')
        .eq('client_id', selectedClientId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (!cancelled && data) setClientOrders(data)
      if (!cancelled) setOrdersLoading(false)
    }
    loadOrders()
    return () => { cancelled = true }
  }, [selectedClientId, tab])

  // Load order lines when order selected
  useEffect(() => {
    if (!selectedOrderId) { setOrderLines([]); setSelectedLineId(''); return }
    let cancelled = false
    async function loadLines() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tailoring_order_lines')
        .select('id, configuration, garment_types(name)')
        .eq('tailoring_order_id', selectedOrderId)
        .eq('line_type', 'artesanal')
        .order('created_at')
      if (!cancelled) {
        setOrderLines(data || [])
        setSelectedLineId('')
      }
    }
    loadLines()
    return () => { cancelled = true }
  }, [selectedOrderId])

  // Load officials
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('officials').select('id, name').eq('is_active', true).order('name')
      if (!cancelled && data) setOfficials(data as { id: string; name: string }[])
    }
    load()
    return () => { cancelled = true }
  }, [])

  function resetForm() {
    setClientSearch('')
    setSelectedClientId(preselectedClientId ?? '')
    setSelectedClientName('')
    setSelectedOrderId(preselectedOrderId ?? '')
    setOrderLines([])
    setSelectedLineId('')
    setDescription('')
    setGarmentType('')
    setGarmentDescription('')
    setAlterationDetails('')
    setHasCost(false)
    setCost('')
    setIsIncluded(false)
    setEstimatedCompletion('')
    setAssignedTo('')
  }

  function selectClient(c: { id: string; full_name: string }) {
    setSelectedClientId(c.id)
    setSelectedClientName(c.full_name)
    setClientSearch('')
    setClientResults([])
  }

  async function handleSave() {
    if (!selectedClientId) { toast.error('Selecciona un cliente'); return }
    if (!description.trim()) { toast.error('Describe el arreglo'); return }
    if (tab === 'external' && !hasCost && !cost) {
      // external doesn't strictly require cost, but we allow it
    }

    setIsSaving(true)
    const res = await createAlteration({
      client_id: selectedClientId,
      alteration_type: tab === 'order' ? 'order' : 'external',
      tailoring_order_id: tab === 'order' ? selectedOrderId || undefined : undefined,
      description: description.trim(),
      garment_type: garmentType.trim() || undefined,
      garment_description: garmentDescription.trim() || undefined,
      alteration_details: alterationDetails.trim() || undefined,
      has_cost: hasCost,
      cost: hasCost ? parseFloat(cost) || 0 : 0,
      is_included: isIncluded,
      estimated_completion: estimatedCompletion || undefined,
      assigned_to: assignedTo || undefined,
      store_id: storeId || undefined,
    })
    setIsSaving(false)

    if (res.success) {
      toast.success('Arreglo creado')
      resetForm()
      onOpenChange(false)
      onCreated()
    } else {
      toast.error(res.error ?? 'Error al crear arreglo')
    }
  }

  const inputCls = 'bg-white/[0.07] border-white/20 text-white placeholder:text-white/30'
  const labelCls = 'text-white/80 text-sm'
  const selectContentCls = 'bg-[#0d1629] border border-white/20 text-white'
  const selectItemCls = 'text-white focus:bg-white/10 focus:text-white'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="max-w-lg bg-[#0d1629] border border-white/20 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Nuevo arreglo</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as 'order' | 'external')} className="mt-2">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTab('order')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                tab === 'order'
                  ? 'bg-[#1e3a5f] border-[#c9a96e]/40 text-white'
                  : 'bg-[#1e3a5f] border-white/20 text-white hover:border-white/40'
              }`}
            >
              Sobre pedido
            </button>
            <button
              type="button"
              onClick={() => setTab('external')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                tab === 'external'
                  ? 'bg-[#1e3a5f] border-[#c9a96e]/40 text-white'
                  : 'bg-[#1e3a5f] border-white/20 text-white hover:border-white/40'
              }`}
            >
              Prenda externa
            </button>
          </div>

          {/* ── Common: Client selector ── */}
          <div className="mt-4 space-y-3">
            {!selectedClientId ? (
              <div className="space-y-2">
                <Label className={labelCls}>Cliente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <Input
                    placeholder="Buscar por nombre, email, teléfono..."
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className={`pl-9 ${inputCls}`}
                    autoComplete="off"
                  />
                </div>
                {clientLoading && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
                {clientResults.length > 0 && (
                  <ul className="space-y-1 max-h-40 overflow-y-auto border border-white/10 rounded-lg p-1">
                    {clientResults.map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 rounded hover:bg-white/10 text-sm text-white"
                          onClick={() => selectClient(c)}
                        >
                          <span className="font-medium">{c.full_name}</span>
                          {c.email && <span className="text-white/50 ml-2 text-xs">{c.email}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Label className={labelCls}>Cliente:</Label>
                <span className="text-white font-medium text-sm">{selectedClientName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-white/50 hover:text-white h-6 px-2 text-xs"
                  onClick={() => { setSelectedClientId(''); setSelectedClientName(''); setSelectedOrderId('') }}
                >
                  Cambiar
                </Button>
              </div>
            )}
          </div>

          {/* ── Tab: Sobre pedido ── */}
          <TabsContent value="order" className="space-y-4 mt-3">
            {selectedClientId && (
              <div className="space-y-1.5">
                <Label className={labelCls}>Pedido</Label>
                {ordersLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                ) : clientOrders.length === 0 ? (
                  <p className="text-white/40 text-xs">Este cliente no tiene pedidos de sastrería.</p>
                ) : (
                  <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                    <SelectTrigger className={inputCls}>
                      <SelectValue placeholder="Seleccionar pedido" />
                    </SelectTrigger>
                    <SelectContent className={selectContentCls}>
                      {clientOrders.map(o => (
                        <SelectItem key={o.id} value={o.id} className={selectItemCls}>
                          {o.order_number} — {formatDate(o.order_date)} ({o.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedOrderId && orderLines.length > 0 && (
                  <div className="mt-2">
                    <Label className={labelCls}>Prenda</Label>
                    <select
                      value={selectedLineId}
                      onChange={(e) => {
                        setSelectedLineId(e.target.value)
                        const line = orderLines.find((l: any) => l.id === e.target.value)
                        if (line) {
                          setGarmentType(line.configuration?.prendaLabel || line.garment_types?.name || '')
                        }
                      }}
                      className="w-full mt-1 h-10 px-3 rounded-lg bg-white/[0.07] border border-white/20 text-white text-sm [&>option]:bg-[#0d1629] [&>option]:text-white"
                    >
                      <option value="">— Seleccionar prenda —</option>
                      {orderLines.map((line: any) => (
                        <option key={line.id} value={line.id}>
                          {line.configuration?.prendaLabel || line.garment_types?.name || 'Prenda'}
                          {line.configuration?.oficial ? ` (Oficial: ${line.configuration.oficial})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedOrderId && !ordersLoading && orderLines.length === 0 && (
                  <p className="text-white/40 text-xs mt-1">Este pedido no tiene prendas de sastrería.</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className={labelCls}>Descripción del arreglo</Label>
              <Textarea
                placeholder="Ej: Acortar bajo pantalón 2cm, ajustar cintura americana..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <Label className={labelCls}>Detalles adicionales <span className="text-white/40 font-normal">(opcional)</span></Label>
              <Textarea
                placeholder="Detalles técnicos, medidas específicas..."
                value={alterationDetails}
                onChange={e => setAlterationDetails(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasCost}
                  onChange={e => setHasCost(e.target.checked)}
                  className="rounded border-white/20 bg-white/[0.07] text-[#c9a96e]"
                />
                <span className="text-sm text-white/80">Tiene coste</span>
              </label>
              {hasCost && (
                <>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={cost}
                    onChange={e => setCost(e.target.value)}
                    className={`w-28 ${inputCls}`}
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={e => setIsIncluded(e.target.checked)}
                      className="rounded border-white/20 bg-white/[0.07] text-[#c9a96e]"
                    />
                    <span className="text-xs text-white/60">Incluido en precio</span>
                  </label>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className={labelCls}>Fecha estimada</Label>
                <DatePickerPopover
                  value={estimatedCompletion}
                  onChange={setEstimatedCompletion}
                  containerClassName={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Asignar a (oficial)</Label>
                <Select value={assignedTo || '__none__'} onValueChange={v => setAssignedTo(v === '__none__' ? '' : v)}>
                  <SelectTrigger className={inputCls}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="__none__" className={selectItemCls}>— Sin asignar</SelectItem>
                    {officials.map(o => (
                      <SelectItem key={o.id} value={o.id} className={selectItemCls}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Prenda externa ── */}
          <TabsContent value="external" className="space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className={labelCls}>Tipo de prenda</Label>
                <Input
                  placeholder="Pantalón, Vestido, Abrigo..."
                  value={garmentType}
                  onChange={e => setGarmentType(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Descripción prenda <span className="text-white/40 font-normal">(opc.)</span></Label>
                <Input
                  placeholder="Pantalón azul marino..."
                  value={garmentDescription}
                  onChange={e => setGarmentDescription(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={labelCls}>Descripción del arreglo</Label>
              <Textarea
                placeholder="Acortar bajo 3cm, estrechar cintura 2cm..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <Label className={labelCls}>Detalles adicionales <span className="text-white/40 font-normal">(opcional)</span></Label>
              <Textarea
                placeholder="Detalles técnicos, medidas..."
                value={alterationDetails}
                onChange={e => setAlterationDetails(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <Label className={labelCls}>Precio del arreglo</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={cost}
                onChange={e => { setCost(e.target.value); setHasCost(true) }}
                className={`w-40 ${inputCls}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className={labelCls}>Fecha estimada</Label>
                <DatePickerPopover
                  value={estimatedCompletion}
                  onChange={setEstimatedCompletion}
                  containerClassName={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Asignar a (oficial)</Label>
                <Select value={assignedTo || '__none__'} onValueChange={v => setAssignedTo(v === '__none__' ? '' : v)}>
                  <SelectTrigger className={inputCls}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="__none__" className={selectItemCls}>— Sin asignar</SelectItem>
                    {officials.map(o => (
                      <SelectItem key={o.id} value={o.id} className={selectItemCls}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button
            className="bg-white/[0.06] border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => { resetForm(); onOpenChange(false) }}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            className="bg-[#c9a96e] text-[#0a1020] font-semibold hover:bg-[#c9a96e]/90"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear arreglo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Export for reuse in order detail
export { NewAlterationDialog }
