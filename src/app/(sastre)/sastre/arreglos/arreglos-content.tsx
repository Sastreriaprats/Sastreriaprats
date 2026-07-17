'use client'

import { useState, useEffect } from 'react'
import { SastreHeader } from '@/app/(sastre)/components/sastre-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import {
  Plus, Search, Loader2, Scissors, ChevronLeft, ChevronRight, FileDown,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { useActiveStore } from '@/hooks/use-store'
import { createClient } from '@/lib/supabase/client'
import {
  listAlterations,
  createAlteration,
  updateAlterationStatus,
} from '@/actions/alterations'
import type { AlterationRow } from '@/types/alterations'
import { listClients } from '@/actions/clients'
import { useList } from '@/hooks/use-list'
import {
  ALTERATION_STATUS_LABELS,
  ALTERATION_STATUS_COLORS,
  type AlterationStatus,
  type AlterationType,
} from '@/types/alterations'
import { downloadAlterationPdf } from '@/lib/pdf/alteration-pdf'

const TYPE_BADGE: Record<AlterationType, string> = {
  order: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  boutique: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  external: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}

const TYPE_LABELS: Record<AlterationType, string> = {
  order: 'Pedido',
  boutique: 'Boutique',
  external: 'Externo',
}

export function ArreglosContent({ sastreName }: { sastreName: string }) {
  const { activeStoreId } = useActiveStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  const {
    data: alterations,
    total,
    totalPages,
    page,
    setPage,
    search,
    setSearch,
    isLoading,
    refresh,
  } = useList(listAlterations, {
    pageSize: 25,
    defaultSort: 'alteration_date',
    defaultOrder: 'desc',
    defaultFilters: {},
    syncUrl: true,
  })

  // Búsqueda ahora es server-side via params.search del useList.
  // listAlterations matchea contra alteration_number, description,
  // garment_type y nombre/teléfono del cliente (vía clients.search_text).
  const visible = alterations as AlterationRow[]

  const handleStatusChange = async (id: string, status: string) => {
    const res = await updateAlterationStatus({ id, status: status as AlterationStatus })
    if (res.success) {
      toast.success(`Estado actualizado a "${ALTERATION_STATUS_LABELS[status as AlterationStatus]}"`)
      refresh()
    } else {
      toast.error('error' in res ? res.error : 'Error al actualizar estado')
    }
  }

  const handleDownloadPdf = async (id: string) => {
    try {
      await downloadAlterationPdf(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar PDF')
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
                  placeholder="Buscar por cliente, número, prenda…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
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
              <p>No hay arreglos{search ? ` para "${search}"` : ''}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#c9a96e]/20 bg-white/5 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#c9a96e]/20">
                    <TableHead className="text-white/70 text-xs">Nº</TableHead>
                    <TableHead className="text-white/70 text-xs">Fecha</TableHead>
                    <TableHead className="text-white/70 text-xs">Cliente</TableHead>
                    <TableHead className="text-white/70 text-xs">Tipo</TableHead>
                    <TableHead className="text-white/70 text-xs">Prenda</TableHead>
                    <TableHead className="text-white/70 text-xs">Oficial</TableHead>
                    <TableHead className="text-white/70 text-xs">Estado</TableHead>
                    <TableHead className="text-white/70 text-xs w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(a => {
                    const officialName = a.official_name || a.official?.name || '—'
                    return (
                      <TableRow key={a.id} className="border-[#c9a96e]/10 hover:bg-white/5">
                        <TableCell className="font-mono text-white text-xs">{a.alteration_number}</TableCell>
                        <TableCell className="text-white/70 text-sm">{formatDate(a.alteration_date)}</TableCell>
                        <TableCell className="text-white font-medium text-sm">{a.clients?.full_name ?? '—'}</TableCell>
                        <TableCell>
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${TYPE_BADGE[a.alteration_type] || TYPE_BADGE.external}`}>
                            {TYPE_LABELS[a.alteration_type] || 'Externo'}
                          </span>
                        </TableCell>
                        <TableCell className="text-white/70 text-sm">{a.garment_type || '—'}</TableCell>
                        <TableCell className="text-white/60 text-sm">{officialName}</TableCell>
                        <TableCell>
                          <Select value={a.status} onValueChange={v => handleStatusChange(a.id, v)}>
                            <SelectTrigger className={`h-7 w-32 bg-transparent border text-xs ${ALTERATION_STATUS_COLORS[a.status]}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                              {(Object.keys(ALTERATION_STATUS_LABELS) as AlterationStatus[]).map((k) => (
                                <SelectItem key={k} value={k} className="text-white text-xs focus:bg-white/10 focus:text-white">
                                  {ALTERATION_STATUS_LABELS[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
                            onClick={() => handleDownloadPdf(a.id)}
                            title="Descargar PDF"
                          >
                            <FileDown className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

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
  preselectedClientName,
  preselectedClientPhone,
  preselectedOrderId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  storeId: string | null
  onCreated: () => void
  preselectedClientId?: string
  preselectedClientName?: string
  preselectedClientPhone?: string | null
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
  const [selectedClientName, setSelectedClientName] = useState(preselectedClientName ?? '')
  const [selectedClientPhone, setSelectedClientPhone] = useState<string | null>(preselectedClientPhone ?? null)

  // Order search
  const [clientOrders, setClientOrders] = useState<{ id: string; order_number: string; order_date: string; status: string }[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState(preselectedOrderId ?? '')
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Officials
  const [officials, setOfficials] = useState<{ id: string; name: string; specialty: string | null }[]>([])

  // Form
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [garmentType, setGarmentType] = useState('')
  const [alterationDate, setAlterationDate] = useState(new Date().toISOString().split('T')[0])
  const [estimatedCompletion, setEstimatedCompletion] = useState('')
  const [officialId, setOfficialId] = useState('')
  const [notes, setNotes] = useState('')

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
      if (!cancelled && res.success && res.data) {
        setClientResults((res.data.data as { id: string; full_name: string; email: string | null; phone: string | null }[]) || [])
      }
      if (!cancelled) setClientLoading(false)
    }
    search()
    return () => { cancelled = true }
  }, [debouncedSearch])

  // Sync phone from selected client
  useEffect(() => {
    if (selectedClientPhone && !phone) setPhone(selectedClientPhone)
  }, [selectedClientPhone, phone])

  // Load client orders for tab "order"
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
      if (!cancelled && data) setClientOrders(data as { id: string; order_number: string; order_date: string; status: string }[])
      if (!cancelled) setOrdersLoading(false)
    }
    loadOrders()
    return () => { cancelled = true }
  }, [selectedClientId, tab])

  // Officials (consulta directa a tabla `officials`, mismo patrón que la ficha)
  useEffect(() => {
    let cancelled = false
    async function loadOfficials() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('officials')
          .select('id, name, specialty')
          .eq('is_active', true)
          .order('name')
        if (!cancelled && data) {
          setOfficials(data as { id: string; name: string; specialty: string | null }[])
        }
      } catch (err) {
        console.error('[arreglos-content] loadOfficials', err)
      }
    }
    loadOfficials()
    return () => { cancelled = true }
  }, [])

  function resetForm() {
    setClientSearch('')
    setSelectedClientId(preselectedClientId ?? '')
    setSelectedClientName(preselectedClientName ?? '')
    setSelectedClientPhone(preselectedClientPhone ?? null)
    setSelectedOrderId(preselectedOrderId ?? '')
    setPhone(preselectedClientPhone ?? '')
    setDescription('')
    setGarmentType('')
    setAlterationDate(new Date().toISOString().split('T')[0])
    setEstimatedCompletion('')
    setOfficialId('')
    setNotes('')
  }

  function selectClient(c: { id: string; full_name: string; phone: string | null }) {
    setSelectedClientId(c.id)
    setSelectedClientName(c.full_name)
    setSelectedClientPhone(c.phone)
    if (c.phone) setPhone(c.phone)
    setClientSearch('')
    setClientResults([])
  }

  async function handleSave() {
    if (!selectedClientId) { toast.error('Selecciona un cliente'); return }
    if (!description.trim()) { toast.error('Describe el arreglo'); return }

    setIsSaving(true)
    try {
      const res = await createAlteration({
        client_id: selectedClientId,
        phone: phone.trim() || null,
        garment_type: garmentType.trim() || null,
        official_id: officialId || null,
        description: description.trim(),
        alteration_date: alterationDate,
        notes: notes.trim() || null,
        store_id: storeId || null,
        alteration_type: tab === 'order' ? 'order' : 'external',
        tailoring_order_id: tab === 'order' ? (selectedOrderId || null) : null,
        estimated_completion: estimatedCompletion || null,
      })
      if (res.success && res.data) {
        const created = res.data
        toast.success(`Arreglo ${created.alteration_number} creado`, {
          action: { label: 'PDF', onClick: () => downloadAlterationPdf(created.id) },
        })
        resetForm()
        onOpenChange(false)
        onCreated()
      } else {
        toast.error('error' in res ? res.error : 'Error al crear arreglo')
      }
    } finally {
      setIsSaving(false)
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

          {/* Client selector */}
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
              <div className="flex items-center gap-2 flex-wrap">
                <Label className={labelCls}>Cliente:</Label>
                <span className="text-white font-medium text-sm">{selectedClientName}</span>
                {!preselectedClientId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-white/50 hover:text-white h-6 px-2 text-xs"
                    onClick={() => { setSelectedClientId(''); setSelectedClientName(''); setSelectedClientPhone(null); setSelectedOrderId('') }}
                  >
                    Cambiar
                  </Button>
                )}
              </div>
            )}
          </div>

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
              </div>
            )}
            {renderCommonFields({
              phone, setPhone,
              garmentType, setGarmentType,
              description, setDescription,
              alterationDate, setAlterationDate,
              estimatedCompletion, setEstimatedCompletion,
              officialId, setOfficialId,
              notes, setNotes,
              officials,
              inputCls, labelCls, selectContentCls, selectItemCls,
            })}
          </TabsContent>

          <TabsContent value="external" className="space-y-4 mt-3">
            {renderCommonFields({
              phone, setPhone,
              garmentType, setGarmentType,
              description, setDescription,
              alterationDate, setAlterationDate,
              estimatedCompletion, setEstimatedCompletion,
              officialId, setOfficialId,
              notes, setNotes,
              officials,
              inputCls, labelCls, selectContentCls, selectItemCls,
            })}
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

interface CommonFieldsProps {
  phone: string; setPhone: (v: string) => void
  garmentType: string; setGarmentType: (v: string) => void
  description: string; setDescription: (v: string) => void
  alterationDate: string; setAlterationDate: (v: string) => void
  estimatedCompletion: string; setEstimatedCompletion: (v: string) => void
  officialId: string; setOfficialId: (v: string) => void
  notes: string; setNotes: (v: string) => void
  officials: { id: string; name: string; specialty: string | null }[]
  inputCls: string; labelCls: string; selectContentCls: string; selectItemCls: string
}

function renderCommonFields(p: CommonFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className={p.labelCls}>Teléfono</Label>
          <Input value={p.phone} onChange={(e) => p.setPhone(e.target.value)} className={p.inputCls} placeholder="—" />
        </div>
        <div className="space-y-1.5">
          <Label className={p.labelCls}>Tipo de prenda</Label>
          <Input value={p.garmentType} onChange={(e) => p.setGarmentType(e.target.value)} className={p.inputCls} placeholder="Pantalón, americana…" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className={p.labelCls}>Arreglos *</Label>
        <Textarea rows={4} value={p.description} onChange={(e) => p.setDescription(e.target.value)} className={p.inputCls} placeholder="Describe los arreglos…" />
      </div>

      <div className="space-y-1.5">
        <Label className={p.labelCls}>Fecha</Label>
        <Input type="date" value={p.alterationDate} onChange={(e) => p.setAlterationDate(e.target.value)} className={p.inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className={p.labelCls}>Fecha estimada</Label>
          <DatePickerPopover value={p.estimatedCompletion} onChange={p.setEstimatedCompletion} containerClassName={p.inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label className={p.labelCls}>Oficial</Label>
          <Select value={p.officialId || '__none__'} onValueChange={(v) => p.setOfficialId(v === '__none__' ? '' : v)}>
            <SelectTrigger className={p.inputCls}><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent className={p.selectContentCls}>
              <SelectItem value="__none__" className={p.selectItemCls}>— Sin asignar</SelectItem>
              {p.officials.map((o) => (
                <SelectItem key={o.id} value={o.id} className={p.selectItemCls}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className={p.labelCls}>Observaciones internas</Label>
        <Textarea rows={2} value={p.notes} onChange={(e) => p.setNotes(e.target.value)} className={p.inputCls} placeholder="Opcional" />
      </div>
    </>
  )
}

export { NewAlterationDialog }
