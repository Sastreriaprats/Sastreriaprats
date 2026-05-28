'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useList } from '@/hooks/use-list'
import { listReturns, type ReturnRow } from '@/actions/returns'
import { formatCurrency, formatDate } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = { voucher: 'Vale', exchange: 'Cambio', cash: 'Efectivo' }
const VOUCHER_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700', used: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700', partially_used: 'bg-amber-100 text-amber-700', expired: 'bg-gray-100 text-gray-500',
}
const VOUCHER_LABEL: Record<string, string> = {
  active: 'Activo', used: 'Usado', cancelled: 'Cancelado', partially_used: 'Usado parcial', expired: 'Caducado',
}

export function ReturnsListContent() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [stores, setStores] = useState<{ id: string; name: string }[]>([])
  const [typeFilter, setTypeFilter] = useState('all')
  const [storeFilter, setStoreFilter] = useState('all')
  const [voucherFilter, setVoucherFilter] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data: returns, total, totalPages, page, setPage, search, setSearch, filters, setFilters, isLoading, pageSize } =
    useList<ReturnRow>(listReturns, { pageSize: 25, defaultSort: 'created_at', defaultOrder: 'desc' })

  useEffect(() => {
    supabase.from('stores').select('id, name').order('name').then(({ data }) => setStores(data ?? []))
  }, [supabase])

  const apply = (patch: Record<string, unknown>) => setFilters((prev) => ({ ...prev, ...patch }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Devoluciones</h1>
        <p className="text-muted-foreground">{total} devoluciones</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por ticket, cliente o motivo…" className="pl-9" autoComplete="off"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); apply({ return_type: v === 'all' ? undefined : v }) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="voucher">Vale</SelectItem>
            <SelectItem value="exchange">Cambio</SelectItem>
          </SelectContent>
        </Select>
        <Select value={voucherFilter} onValueChange={(v) => { setVoucherFilter(v); apply({ voucher_status: v === 'all' ? undefined : v }) }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado del vale" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Estado del vale</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="partially_used">Usado parcial</SelectItem>
            <SelectItem value="used">Usado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        {stores.length > 1 && (
          <Select value={storeFilter} onValueChange={(v) => { setStoreFilter(v); apply({ store_id: v === 'all' ? undefined : v }) }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Tienda" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las tiendas</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1">
          <Input type="date" className="w-[150px]" value={from} onChange={(e) => { setFrom(e.target.value); apply({ from: e.target.value || undefined }) }} />
          <span className="text-muted-foreground text-sm">→</span>
          <Input type="date" className="w-[150px]" value={to} onChange={(e) => { setTo(e.target.value); apply({ to: e.target.value || undefined }) }} />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Estado vale</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Tienda</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : returns.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Sin devoluciones</TableCell></TableRow>
            ) : (
              returns.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/admin/devoluciones/${r.id}`)}>
                  <TableCell className="whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.ticket_number ?? '—'}</TableCell>
                  <TableCell>{r.client_name ?? '—'}</TableCell>
                  <TableCell>{TYPE_LABEL[r.return_type] ?? r.return_type}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(r.total_returned)}</TableCell>
                  <TableCell>
                    {r.return_type === 'voucher' && r.voucher_status ? (
                      <Badge className={`text-xs ${VOUCHER_BADGE[r.voucher_status] ?? ''}`}>{VOUCHER_LABEL[r.voucher_status] ?? r.voucher_status}</Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell>{r.processed_by_name ?? '—'}</TableCell>
                  <TableCell>{r.store_name ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Página {page} de {totalPages} · {total} en total</p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  )
}
