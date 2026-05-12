'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Loader2, Gift, ChevronLeft, ChevronRight, Receipt, Users, TicketCheck,
  ArrowLeftRight, CircleDollarSign, CalendarX, MoreHorizontal, UserCog, Ban, CalendarClock, X, Printer, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { listVouchers, getVouchersSummaryByClient } from '@/actions/pos'
import { getStoresList } from '@/actions/config'
import { listClients } from '@/actions/clients'
import {
  cancelVoucherAction, reassignVoucherClientAction, updateVoucherExpiryAction, createAdminVoucher,
} from '@/actions/vouchers'
import { downloadVoucherPdf } from '@/lib/pdf/voucher-pdf'

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Activo', className: 'bg-green-100 text-green-700 border-green-200' },
  partially_used: { label: 'Parcialmente usado', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  used: { label: 'Usado', className: 'bg-slate-200 text-slate-700 border-slate-300' },
  expired: { label: 'Caducado', className: 'bg-red-100 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelado', className: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
}

const KIND_LABELS: Record<string, string> = {
  return: 'Devolución',
  residual: 'Residual',
  gift_card: 'Tarjeta regalo',
}

type Store = { id: string; name: string }

export function VouchersContent() {
  const [tab, setTab] = useState<'list' | 'clients'>('list')
  const [stores, setStores] = useState<Store[]>([])

  // ---- Listado detallado ----
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [totals, setTotals] = useState({ originalAmount: 0, remainingAmount: 0 })
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filtros
  const [clientSearch, setClientSearch] = useState('')
  const [codeSearch, setCodeSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // ---- Resumen por cliente ----
  const [clientsSummary, setClientsSummary] = useState<any[]>([])
  const [loadingClients, setLoadingClients] = useState(false)

  // ---- Acciones por fila ----
  const [actionTarget, setActionTarget] = useState<any | null>(null)
  const [actionMode, setActionMode] = useState<'reassign' | 'cancel' | 'expiry' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Reasignar cliente
  const [clientSearchInput, setClientSearchInput] = useState('')
  const [clientSearchResults, setClientSearchResults] = useState<any[]>([])
  const [clientSearchLoading, setClientSearchLoading] = useState(false)
  const clientSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Anular vale
  const [cancelReason, setCancelReason] = useState('')

  // Cambiar caducidad
  const [newExpiryDate, setNewExpiryDate] = useState('')

  // ---- Crear vale (nuevo) ----
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createAmount, setCreateAmount] = useState('')
  const [createKind, setCreateKind] = useState<'gift_card' | 'return'>('gift_card')
  const [createExpiryDays, setCreateExpiryDays] = useState('365')
  const [createNotes, setCreateNotes] = useState('')
  const [createStoreId, setCreateStoreId] = useState<string>('none')
  const [createClient, setCreateClient] = useState<{ id: string; full_name?: string; client_code?: string } | null>(null)
  const [createClientInput, setCreateClientInput] = useState('')
  const [createClientResults, setCreateClientResults] = useState<any[]>([])
  const [createClientLoading, setCreateClientLoading] = useState(false)
  const createClientTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [createdVoucher, setCreatedVoucher] = useState<{ id: string; code: string; amount: number; clientName: string | null; storeName: string | null; issuedDate: string; expiryDate: string; notes: string | null } | null>(null)

  useEffect(() => {
    getStoresList().then(res => {
      if (res.data) setStores(res.data.map(s => ({ id: s.id, name: s.name })))
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listVouchers({
        page,
        pageSize,
        clientSearch: clientSearch.trim() || undefined,
        codeSearch: codeSearch.trim() || undefined,
        status: statusFilter,
        voucherKind: kindFilter,
        storeId: storeFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      if (result.success && result.data) {
        setData(result.data.data ?? [])
        setTotal(result.data.total ?? 0)
        setTotalPages(result.data.totalPages ?? 0)
        setTotals(result.data.totals ?? { originalAmount: 0, remainingAmount: 0 })
      }
    } catch (e) {
      console.error('[VouchersContent] load:', e)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, clientSearch, codeSearch, statusFilter, kindFilter, storeFilter, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const loadClients = useCallback(async () => {
    setLoadingClients(true)
    try {
      const result = await getVouchersSummaryByClient({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        storeId: storeFilter,
        limit: 200,
      })
      if (result.success && result.data) {
        setClientsSummary(result.data.data ?? [])
      }
    } catch (e) {
      console.error('[VouchersContent] loadClients:', e)
    } finally {
      setLoadingClients(false)
    }
  }, [dateFrom, dateTo, storeFilter])

  useEffect(() => {
    if (tab === 'clients') loadClients()
  }, [tab, loadClients])

  const resetFilters = () => {
    setClientSearch('')
    setCodeSearch('')
    setStatusFilter('all')
    setKindFilter('all')
    setStoreFilter('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  // Agregados rápidos sobre la página cargada (para las tarjetas superiores
  // en modo listado, pero usando los totales reales del back)
  const activeCount = data.filter(v => v.status === 'active' || v.status === 'partially_used').length

  // ── Acciones por fila ────────────────────────────────────────────────────
  const openReassign = (voucher: any) => {
    setActionTarget(voucher)
    setActionMode('reassign')
    setClientSearchInput(voucher.client_name ?? '')
    setClientSearchResults([])
  }
  const openCancel = (voucher: any) => {
    setActionTarget(voucher)
    setActionMode('cancel')
    setCancelReason('')
  }
  const openExpiry = (voucher: any) => {
    setActionTarget(voucher)
    setActionMode('expiry')
    setNewExpiryDate(voucher.expiry_date ?? '')
  }
  const closeAction = () => {
    if (actionLoading) return
    setActionTarget(null)
    setActionMode(null)
    setClientSearchInput('')
    setClientSearchResults([])
    setCancelReason('')
    setNewExpiryDate('')
  }

  // Buscador de clientes con debounce
  useEffect(() => {
    if (actionMode !== 'reassign') return
    if (clientSearchTimer.current) clearTimeout(clientSearchTimer.current)
    const term = clientSearchInput.trim()
    if (term.length < 2) { setClientSearchResults([]); return }
    clientSearchTimer.current = setTimeout(async () => {
      setClientSearchLoading(true)
      const res = await listClients({ page: 1, pageSize: 10, search: term, sortBy: 'full_name', sortOrder: 'asc' })
      setClientSearchLoading(false)
      if (res.success && res.data) setClientSearchResults(res.data.data ?? [])
    }, 250)
    return () => { if (clientSearchTimer.current) clearTimeout(clientSearchTimer.current) }
  }, [clientSearchInput, actionMode])

  const handleReassignTo = async (clientId: string | null) => {
    if (!actionTarget) return
    setActionLoading(true)
    const res = await reassignVoucherClientAction({ voucherId: actionTarget.id, clientId })
    setActionLoading(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al reasignar cliente')
      return
    }
    toast.success(clientId ? 'Cliente reasignado' : 'Cliente desasignado')
    closeAction()
    load()
  }

  const handleCancel = async () => {
    if (!actionTarget) return
    setActionLoading(true)
    const res = await cancelVoucherAction({ voucherId: actionTarget.id, reason: cancelReason.trim() || null })
    setActionLoading(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al anular el vale')
      return
    }
    toast.success(`Vale ${actionTarget.code} anulado`)
    closeAction()
    load()
  }

  const handlePrintVoucher = async (voucher: any) => {
    try {
      await downloadVoucherPdf({
        code: voucher.code,
        kind: voucher.voucher_kind,
        amount: Number(voucher.remaining_amount ?? voucher.original_amount ?? 0),
        clientName: voucher.client_name ?? null,
        issuedDate: voucher.issued_date,
        expiryDate: voucher.expiry_date ?? null,
        storeName: voucher.store_name ?? null,
        notes: voucher.notes ?? null,
      })
    } catch (err: any) {
      toast.error(err?.message || 'Error al generar el PDF del vale')
    }
  }

  // Buscador de clientes (Nuevo vale) con debounce
  useEffect(() => {
    if (!createOpen) return
    if (createClient) return // ya seleccionado
    if (createClientTimer.current) clearTimeout(createClientTimer.current)
    const term = createClientInput.trim()
    if (term.length < 2) { setCreateClientResults([]); return }
    createClientTimer.current = setTimeout(async () => {
      setCreateClientLoading(true)
      const res = await listClients({ page: 1, pageSize: 10, search: term, sortBy: 'full_name', sortOrder: 'asc' })
      setCreateClientLoading(false)
      if (res.success && res.data) setCreateClientResults(res.data.data ?? [])
    }, 250)
    return () => { if (createClientTimer.current) clearTimeout(createClientTimer.current) }
  }, [createClientInput, createOpen, createClient])

  const resetCreateForm = () => {
    setCreateAmount('')
    setCreateKind('gift_card')
    setCreateExpiryDays('365')
    setCreateNotes('')
    setCreateStoreId('none')
    setCreateClient(null)
    setCreateClientInput('')
    setCreateClientResults([])
  }

  const handleCreateVoucher = async () => {
    const amount = Number(createAmount)
    if (!amount || amount <= 0) {
      toast.error('Introduce un importe mayor que 0')
      return
    }
    const expiryDays = Number(createExpiryDays) || 365
    setCreateLoading(true)
    const res = await createAdminVoucher({
      amount,
      clientId: createClient?.id ?? null,
      voucherKind: createKind,
      expiryDays,
      notes: createNotes.trim() || undefined,
      storeId: createStoreId !== 'none' ? createStoreId : undefined,
    })
    setCreateLoading(false)
    if (!res.success || !res.data) {
      toast.error('error' in res ? res.error : 'Error al crear el vale')
      return
    }
    const v = res.data
    toast.success(`Vale ${v.code} creado por ${formatCurrency(amount)}`)
    setCreatedVoucher({
      id: v.id,
      code: v.code,
      amount,
      clientName: createClient?.full_name ?? null,
      storeName: createStoreId !== 'none' ? (stores.find(s => s.id === createStoreId)?.name ?? null) : null,
      issuedDate: v.issued_date,
      expiryDate: v.expiry_date,
      notes: createNotes.trim() || null,
    })
    setCreateOpen(false)
    resetCreateForm()
    load()
  }

  const handlePrintCreated = async () => {
    if (!createdVoucher) return
    try {
      await downloadVoucherPdf({
        code: createdVoucher.code,
        kind: 'gift_card',
        amount: createdVoucher.amount,
        clientName: createdVoucher.clientName,
        issuedDate: createdVoucher.issuedDate,
        expiryDate: createdVoucher.expiryDate,
        storeName: createdVoucher.storeName,
        notes: createdVoucher.notes,
      })
    } catch (err: any) {
      toast.error(err?.message || 'Error al generar el PDF del vale')
    }
  }

  const handleUpdateExpiry = async () => {
    if (!actionTarget) return
    if (!newExpiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(newExpiryDate)) {
      toast.error('Selecciona una fecha válida')
      return
    }
    setActionLoading(true)
    const res = await updateVoucherExpiryAction({ voucherId: actionTarget.id, expiryDate: newExpiryDate })
    setActionLoading(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al actualizar caducidad')
      return
    }
    toast.success('Caducidad actualizada')
    closeAction()
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-7 w-7" />
            Vales
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control de vales emitidos desde caja: devoluciones, residuales y tarjetas regalo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="gap-1" onClick={() => { resetCreateForm(); setCreateOpen(true) }}>
            <Plus className="h-4 w-4" />
            Nuevo vale
          </Button>
          <Link href="/admin/tickets">
            <Button variant="outline" size="sm" className="gap-1">
              <Receipt className="h-4 w-4" />
              Ver tickets
            </Button>
          </Link>
        </div>
      </div>

      {/* Tarjetas de totales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Vales emitidos</p>
                <p className="text-2xl font-bold mt-1">{total}</p>
              </div>
              <TicketCheck className="h-8 w-8 text-slate-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Importe emitido</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totals.originalAmount)}</p>
              </div>
              <CircleDollarSign className="h-8 w-8 text-slate-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo pendiente</p>
                <p className="text-2xl font-bold mt-1 text-green-700">{formatCurrency(totals.remainingAmount)}</p>
              </div>
              <Gift className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">En página · activos</p>
                <p className="text-2xl font-bold mt-1">{activeCount}</p>
              </div>
              <ArrowLeftRight className="h-8 w-8 text-slate-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'list' | 'clients')}>
        <TabsList>
          <TabsTrigger value="list" className="gap-1">
            <TicketCheck className="h-4 w-4" /> Listado
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-1">
            <Users className="h-4 w-4" /> Por cliente
          </TabsTrigger>
        </TabsList>

        {/* --------- PESTAÑA: LISTADO --------- */}
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Cliente</label>
                <Input
                  placeholder="Nombre o código..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-48"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Código vale</label>
                <Input
                  placeholder="ABC123..."
                  value={codeSearch}
                  onChange={(e) => setCodeSearch(e.target.value)}
                  className="w-40 uppercase"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Estado</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="partially_used">Parcialmente usados</SelectItem>
                    <SelectItem value="used">Usados</SelectItem>
                    <SelectItem value="expired">Caducados</SelectItem>
                    <SelectItem value="cancelled">Cancelados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="return">Devolución</SelectItem>
                    <SelectItem value="residual">Residual</SelectItem>
                    <SelectItem value="gift_card">Tarjeta regalo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Tienda</label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {stores.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Desde</label>
                <DatePickerPopover
                  containerClassName="w-40"
                  value={dateFrom}
                  onChange={(d) => setDateFrom(d)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Hasta</label>
                <DatePickerPopover
                  containerClassName="w-40"
                  value={dateTo}
                  onChange={(d) => setDateTo(d)}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" onClick={() => { setPage(1); load() }}>Buscar</Button>
                <Button variant="ghost" onClick={resetFilters}>Limpiar</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : data.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Gift className="mx-auto h-12 w-12 mb-4 opacity-30" />
                  <p>No hay vales con los filtros indicados.</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Emitido</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Caduca</TableHead>
                        <TableHead>Origen</TableHead>
                        <TableHead>Tienda</TableHead>
                        <TableHead>Emitido por</TableHead>
                        <TableHead className="text-right w-12">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((v) => {
                        const status = STATUS_LABELS[v.status] ?? { label: v.status, className: '' }
                        const isExpiredSoon = v.expiry_date &&
                          (v.status === 'active' || v.status === 'partially_used') &&
                          new Date(v.expiry_date).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
                        const isCancelled = v.status === 'cancelled'
                        const isUsed = v.status === 'used'
                        const canCancel = v.status === 'active' || v.status === 'partially_used'
                        const canChangeExpiry = !isCancelled && !isUsed
                        const canReassign = !isCancelled
                        return (
                          <TableRow key={v.id} className={cn(isCancelled && 'opacity-60')}>
                            <TableCell className="font-mono text-sm">{v.code}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(v.issued_date)}</TableCell>
                            <TableCell>
                              {v.client_name ? (
                                <span className="text-sm">
                                  {v.client_name}
                                  {v.client_code ? <span className="text-muted-foreground"> ({v.client_code})</span> : null}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">Sin cliente</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {KIND_LABELS[v.voucher_kind] ?? v.voucher_kind}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(v.original_amount)}</TableCell>
                            <TableCell className="text-right font-semibold text-green-700">
                              {formatCurrency(v.remaining_amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={status.className}>{status.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <span className={`text-sm ${isExpiredSoon ? 'text-amber-700 font-medium flex items-center gap-1' : 'text-muted-foreground'}`}>
                                {isExpiredSoon && <CalendarX className="h-3 w-3" />}
                                {v.expiry_date ? formatDate(v.expiry_date) : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {v.origin_ticket_number ? (
                                <span className="font-mono">#{v.origin_ticket_number}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{v.store_name ?? '—'}</TableCell>
                            <TableCell className="text-sm text-slate-600">{v.issued_by_name ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handlePrintVoucher(v)}>
                                    <Printer className="mr-2 h-4 w-4" /> Imprimir vale
                                  </DropdownMenuItem>
                                  {(canReassign || canChangeExpiry || canCancel) && <DropdownMenuSeparator />}
                                  {canReassign && (
                                    <DropdownMenuItem onClick={() => openReassign(v)}>
                                      <UserCog className="mr-2 h-4 w-4" /> Reasignar cliente
                                    </DropdownMenuItem>
                                  )}
                                  {canChangeExpiry && (
                                    <DropdownMenuItem onClick={() => openExpiry(v)}>
                                      <CalendarClock className="mr-2 h-4 w-4" /> Cambiar caducidad
                                    </DropdownMenuItem>
                                  )}
                                  {canCancel && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => openCancel(v)}
                                        className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                      >
                                        <Ban className="mr-2 h-4 w-4" /> Anular vale
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <p className="text-sm text-muted-foreground">
                        {total} vale{total !== 1 ? 's' : ''} · Página {page} de {totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --------- PESTAÑA: POR CLIENTE --------- */}
        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Tienda</label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {stores.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Emitidos desde</label>
                <DatePickerPopover
                  containerClassName="w-40"
                  value={dateFrom}
                  onChange={(d) => setDateFrom(d)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Hasta</label>
                <DatePickerPopover
                  containerClassName="w-40"
                  value={dateTo}
                  onChange={(d) => setDateTo(d)}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => loadClients()}>Actualizar</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loadingClients ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : clientsSummary.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="mx-auto h-12 w-12 mb-4 opacity-30" />
                  <p>No hay vales asociados a clientes en este periodo.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-center">Total vales</TableHead>
                      <TableHead className="text-center">Activos</TableHead>
                      <TableHead className="text-center">Usados</TableHead>
                      <TableHead className="text-center">Caducados</TableHead>
                      <TableHead className="text-right">Importe emitido</TableHead>
                      <TableHead className="text-right">Saldo disponible</TableHead>
                      <TableHead>Último vale</TableHead>
                      <TableHead className="w-[140px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientsSummary.map((row) => (
                      <TableRow key={row.client_id}>
                        <TableCell>
                          <Link
                            href={`/admin/clientes/${row.client_id}`}
                            className="hover:underline font-medium"
                          >
                            {row.client_name}
                          </Link>
                          {row.client_code && (
                            <span className="text-muted-foreground text-xs ml-1">({row.client_code})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold">{row.total_count}</TableCell>
                        <TableCell className="text-center">
                          {row.active_count > 0 ? (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                              {row.active_count}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">{row.used_count}</TableCell>
                        <TableCell className="text-center">
                          {row.expired_count > 0 ? (
                            <span className="text-red-600">{row.expired_count}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(row.original_amount)}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">
                          {formatCurrency(row.remaining_amount)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.last_issued_date ? formatDate(row.last_issued_date) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setClientSearch(row.client_code || row.client_name)
                              setTab('list')
                              setPage(1)
                            }}
                          >
                            Ver vales
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: reasignar cliente ── */}
      <Dialog open={actionMode === 'reassign'} onOpenChange={(open) => { if (!open) closeAction() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reasignar cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Vale <span className="font-mono font-medium">{actionTarget?.code}</span>.
              {actionTarget?.client_name ? (
                <> Cliente actual: <strong>{actionTarget.client_name}</strong>.</>
              ) : (
                <> Sin cliente asignado.</>
              )}
            </p>
            <div className="space-y-1">
              <Label>Buscar cliente</Label>
              <div className="relative">
                <Input
                  value={clientSearchInput}
                  onChange={(e) => setClientSearchInput(e.target.value)}
                  placeholder="Nombre, email o NIF…"
                  autoFocus
                />
                {clientSearchLoading && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {clientSearchInput.trim().length >= 2 && (
                <div className="border rounded max-h-56 overflow-y-auto">
                  {clientSearchResults.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">
                      {clientSearchLoading ? 'Buscando…' : 'Sin resultados'}
                    </p>
                  ) : (
                    clientSearchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleReassignTo(c.id)}
                        disabled={actionLoading}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0 disabled:opacity-50"
                      >
                        <span className="font-medium">{c.full_name ?? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() ?? 'Sin nombre'}</span>
                        {c.email && <span className="text-muted-foreground ml-2">{c.email}</span>}
                        {c.document_number && <span className="text-muted-foreground ml-2 font-mono text-xs">{c.document_number}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {actionTarget?.client_id ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReassignTo(null)}
                disabled={actionLoading}
                className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
              >
                <X className="h-4 w-4 mr-1" /> Quitar cliente
              </Button>
            ) : <span />}
            <Button variant="ghost" onClick={closeAction} disabled={actionLoading}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: anular vale ── */}
      <AlertDialog open={actionMode === 'cancel'} onOpenChange={(open) => { if (!open) closeAction() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Ban className="h-5 w-5" /> ¿Anular el vale {actionTarget?.code}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  El vale quedará marcado como <strong>cancelado</strong> y no podrá canjearse.
                  El saldo restante <strong>{formatCurrency(actionTarget?.remaining_amount ?? 0)}</strong> se perderá.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="cancel-reason">Motivo de anulación (opcional)</Label>
                  <Textarea
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={3}
                    placeholder="Ej: vale duplicado, error al emitir…"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>No, volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); handleCancel() }}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sí, anular vale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Dialog: cambiar caducidad ── */}
      <Dialog open={actionMode === 'expiry'} onOpenChange={(open) => { if (!open) closeAction() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar caducidad</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Vale <span className="font-mono font-medium">{actionTarget?.code}</span>.
              Caducidad actual: <strong>{actionTarget?.expiry_date ? formatDate(actionTarget.expiry_date) : '—'}</strong>.
            </p>
            <div className="space-y-1">
              <Label>Nueva fecha de caducidad</Label>
              <DatePickerPopover value={newExpiryDate} onChange={setNewExpiryDate} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction} disabled={actionLoading}>Cancelar</Button>
            <Button onClick={handleUpdateExpiry} disabled={actionLoading || !newExpiryDate}>
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar caducidad
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: crear nuevo vale ── */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open && !createLoading) { setCreateOpen(false); resetCreateForm() } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" /> Nuevo vale
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Importe (€) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={createAmount}
                  onChange={(e) => setCreateAmount(e.target.value)}
                  placeholder="0,00"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={createKind} onValueChange={(v) => setCreateKind(v as 'gift_card' | 'return')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gift_card">Tarjeta regalo</SelectItem>
                    <SelectItem value="return">Vale de devolución</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Cliente (opcional)</Label>
              {createClient ? (
                <div className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{createClient.full_name ?? 'Sin nombre'}</span>
                    {createClient.client_code && (
                      <span className="text-muted-foreground ml-2">({createClient.client_code})</span>
                    )}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => { setCreateClient(null); setCreateClientInput('') }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Input
                      value={createClientInput}
                      onChange={(e) => setCreateClientInput(e.target.value)}
                      placeholder="Nombre, email o NIF…"
                    />
                    {createClientLoading && (
                      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {createClientInput.trim().length >= 2 && createClientResults.length > 0 && (
                    <div className="border rounded max-h-44 overflow-y-auto">
                      {createClientResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setCreateClient({ id: c.id, full_name: c.full_name, client_code: c.client_code }); setCreateClientInput(''); setCreateClientResults([]) }}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0"
                        >
                          <span className="font-medium">{c.full_name ?? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() ?? 'Sin nombre'}</span>
                          {c.email && <span className="text-muted-foreground ml-2">{c.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Caducidad (días)</Label>
                <Input
                  type="number"
                  min="1"
                  value={createExpiryDays}
                  onChange={(e) => setCreateExpiryDays(e.target.value)}
                />
              </div>
              {stores.length > 1 && (
                <div className="space-y-1">
                  <Label>Tienda emisora</Label>
                  <Select value={createStoreId} onValueChange={setCreateStoreId}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sin asignar —</SelectItem>
                      {stores.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Notas (opcional)</Label>
              <Textarea
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                rows={2}
                placeholder="Motivo, referencia, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm() }} disabled={createLoading}>Cancelar</Button>
            <Button onClick={handleCreateVoucher} disabled={createLoading || !createAmount}>
              {createLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crear vale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: vale recién creado · imprimir ── */}
      <Dialog open={!!createdVoucher} onOpenChange={(open) => { if (!open) setCreatedVoucher(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <Gift className="h-5 w-5" /> Vale creado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Código: <span className="font-mono font-semibold">{createdVoucher?.code}</span>
            </p>
            <p>
              Importe: <span className="font-semibold">{createdVoucher ? formatCurrency(createdVoucher.amount) : ''}</span>
            </p>
            {createdVoucher?.clientName && (
              <p>Cliente: <span className="font-medium">{createdVoucher.clientName}</span></p>
            )}
            <p className="text-muted-foreground">
              Caduca: {createdVoucher ? formatDate(createdVoucher.expiryDate) : ''}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedVoucher(null)}>Cerrar</Button>
            <Button onClick={handlePrintCreated} className="gap-1">
              <Printer className="h-4 w-4" /> Imprimir vale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
