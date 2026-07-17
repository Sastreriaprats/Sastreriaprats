'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Loader2, RefreshCw, Eye, Pencil, Search, X,
} from 'lucide-react'
import { getOnlineOrdersList, type OnlineOrderRow } from '@/actions/online-orders'
import { formatCurrency, formatDateTime, normalizeSearchTerm } from '@/lib/utils'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente',
  paid: 'Pagado',
  processing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

const STATUS_BADGE: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-700 border-amber-200',
  paid: 'bg-green-100 text-green-700 border-green-200',
  processing: 'bg-blue-100 text-blue-700 border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  refunded: 'bg-gray-100 text-gray-700 border-gray-200',
}

export function OnlineOrdersList() {
  const router = useRouter()
  const [orders, setOrders] = useState<OnlineOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await getOnlineOrdersList({ limit: 100 })
    if (res.success && res.data) setOrders(res.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (search.trim()) {
        // Multi-palabra sin acentos (AND por token)
        const tokens = normalizeSearchTerm(search).split(/\s+/).filter(Boolean)
        const hay = normalizeSearchTerm([
          o.order_number,
          o.client_name ?? '',
          o.client_email ?? '',
        ].join(' '))
        if (!tokens.every((t) => hay.includes(t))) return false
      }
      return true
    })
  }, [orders, statusFilter, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length }
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [orders])

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Pedidos online</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nº pedido, cliente, email…"
              className="pl-8 h-8 w-64 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-48 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados ({counts.all ?? 0})</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label} ({counts[k] ?? 0})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-prats-navy" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {orders.length === 0
              ? 'No hay pedidos online todavía.'
              : 'Ningún pedido coincide con los filtros.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Prendas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/tienda-online/pedidos/${o.id}`)}
                >
                  <TableCell>
                    <Link
                      href={`/admin/tienda-online/pedidos/${o.id}`}
                      className="font-mono text-sm text-prats-navy hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {o.order_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {o.client_name || o.client_email ? (
                      <div className="text-sm">
                        {o.client_name && <div className="font-medium">{o.client_name}</div>}
                        {o.client_email && (
                          <div className="text-xs text-muted-foreground">{o.client_email}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[o.status] ?? ''}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">{o.lines_count}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(o.total)}</TableCell>
                  <TableCell>
                    <PaymentMethodBadge method={o.payment_method ?? undefined} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {formatDateTime(o.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2"
                        title="Ver pedido"
                        onClick={() => router.push(`/admin/tienda-online/pedidos/${o.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Ver
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2"
                        title="Editar pedido"
                        onClick={() => router.push(`/admin/tienda-online/pedidos/${o.id}?edit=1`)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
