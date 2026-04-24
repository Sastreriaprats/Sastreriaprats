'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Loader2, Gift, ChevronLeft, ChevronRight, Receipt, Users, TicketCheck,
  ArrowLeftRight, CircleDollarSign, CalendarX,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { listVouchers, getVouchersSummaryByClient } from '@/actions/pos'
import { getStoresList } from '@/actions/config'

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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((v) => {
                        const status = STATUS_LABELS[v.status] ?? { label: v.status, className: '' }
                        const isExpiredSoon = v.expiry_date &&
                          (v.status === 'active' || v.status === 'partially_used') &&
                          new Date(v.expiry_date).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
                        return (
                          <TableRow key={v.id}>
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
    </div>
  )
}
