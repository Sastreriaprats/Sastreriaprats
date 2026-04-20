'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { getAuditLogs } from '@/actions/users'
import { formatDateTime } from '@/lib/utils'

type LogRow = {
  id: string
  user_name: string
  action: string
  action_display?: string
  entity_type: string
  entity_type_display?: string
  entity_id: string | null
  entity_label: string | null
  changes: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

const ACTION_BADGES: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  login:  'bg-purple-100 text-purple-700',
  logout: 'bg-gray-100 text-gray-700',
  state_change: 'bg-amber-100 text-amber-700',
  payment: 'bg-emerald-100 text-emerald-700',
  refund: 'bg-orange-100 text-orange-700',
  export: 'bg-slate-100 text-slate-700',
  import: 'bg-slate-100 text-slate-700',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
  state_change: 'Cambio estado',
  payment: 'Pago',
  refund: 'Devolución',
  export: 'Exportar',
  import: 'Importar',
}
// Fallback si el API no envía action_display
const getActionLabel = (log: LogRow) => log.action_display ?? ACTION_LABELS[log.action] ?? log.action

const ENTITY_LABELS: Record<string, string> = {
  client: 'Cliente',
  client_measurements: 'Medidas',
  client_note: 'Nota cliente',
  order: 'Pedido',
  orders: 'Pedidos',
  product: 'Producto',
  product_variant: 'Variante',
  stock: 'Stock',
  stock_movement: 'Stock',
  user: 'Usuario',
  config: 'Configuración',
  appointment: 'Cita',
  sale: 'Venta',
  supplier: 'Proveedor',
  cms_page: 'Página CMS',
  blog_post: 'Blog',
  clients: 'Clientes',
  calendar: 'Agenda',
  tailoring_order: 'Pedido',
  fitting: 'Prueba',
  invoice: 'Factura',
}
// Fallback si el API no envía entity_type_display
const getEntityTypeLabel = (log: LogRow) => log.entity_type_display ?? ENTITY_LABELS[log.entity_type] ?? log.entity_type

export function AuditoriaContent() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [filterAction, setFilterAction] = useState('all')
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterUser, setFilterUser] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await getAuditLogs({
      page,
      action: filterAction !== 'all' ? filterAction : undefined,
      entityType: filterEntity !== 'all' ? filterEntity : undefined,
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo ? filterDateTo + 'T23:59:59Z' : undefined,
    })
    if (res.error) setLoadError(res.error)
    else if (res.data) { setLogs(res.data); setCount(res.count ?? 0) }
    setLoading(false)
  }, [page, filterAction, filterEntity, filterDateFrom, filterDateTo])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(count / 50)

  const FIELD_LABELS: Record<string, string> = {
    // Clientes
    first_name: 'Nombre',
    last_name: 'Apellidos',
    full_name: 'Nombre completo',
    email: 'Email',
    phone: 'Teléfono',
    document_number: 'DNI / NIF',
    address: 'Dirección',
    city: 'Ciudad',
    postal_code: 'Código postal',
    province: 'Provincia',
    country: 'País',
    birthdate: 'Fecha de nacimiento',
    notes: 'Notas',
    category: 'Categoría',
    client_type: 'Tipo de cliente',
    is_active: 'Activo',
    tags: 'Etiquetas',
    home_store_id: 'Tienda',
    assigned_salesperson_id: 'Vendedor asignado',
    // Productos / variantes / stock
    name: 'Nombre',
    sku: 'SKU',
    variant_sku: 'SKU variante',
    barcode: 'Código de barras',
    base_price: 'Precio base',
    price_with_tax: 'Precio con IVA',
    price_override: 'Precio',
    cost_price: 'Precio coste',
    cost_price_override: 'Precio coste',
    tax_rate_pct: 'IVA %',
    tax_rate: 'IVA %',
    size: 'Talla',
    color: 'Color',
    quantity: 'Cantidad',
    cantidad: 'Cantidad',
    stock: 'Stock',
    category_id: 'Categoría',
    supplier_id: 'Proveedor',
    description: 'Descripción',
    product_type: 'Tipo producto',
    collection: 'Colección',
    season: 'Temporada',
    // Pedidos / estados
    estado: 'Estado',
    status: 'Estado',
    linea_id: 'Línea',
    notas: 'Notas',
    motivo: 'Motivo',
    delta: 'Delta',
    tipo_movimiento: 'Tipo movimiento',
    sku_variante: 'SKU variante',
    almacén: 'Almacén',
    // Roles
    permisos_agregados: 'Permisos añadidos',
    permisos_eliminados: 'Permisos eliminados',
    total_permisos: 'Total permisos',
    agregados: 'Añadidos',
    eliminados: 'Eliminados',
    // Ventas / TPV
    sale: 'Venta',
    lines: 'Líneas',
    payments: 'Pagos',
    sale_type: 'Tipo de venta',
    is_tax_free: 'Exenta de IVA',
    discount_code: 'Código descuento',
    discount_percentage: 'Descuento',
    discount_amount: 'Importe descuento',
    unit_price: 'Precio unitario',
    line_total: 'Total línea',
    subtotal: 'Subtotal',
    tax_amount: 'Importe IVA',
    total: 'Total',
    payment_method: 'Método de pago',
    amount: 'Importe',
    reference: 'Referencia',
    ticket_number: 'Nº ticket',
    // Cajas
    opening_amount: 'Fondo inicial',
    counted_cash: 'Efectivo contado',
    closing_notes: 'Notas de cierre',
  }

  // IDs/UUIDs técnicos que no aportan valor visual al admin
  const HIDDEN_FIELDS = new Set([
    'id', 'store_id', 'client_id', 'salesperson_id', 'cash_session_id',
    'sale_id', 'product_variant_id', 'variant_id', 'product_id',
    'tailoring_order_id', 'warehouse_id', 'user_id', 'profile_id',
    'created_by', 'updated_by', 'supplier_id',
  ])

  const PAYMENT_METHODS_ES: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
    voucher: 'Vale', bizum: 'Bizum', cheque: 'Cheque',
    financing: 'Financiación', mixed: 'Mixto', other: 'Otro',
  }

  const SALE_TYPES_ES: Record<string, string> = {
    boutique: 'Boutique', tailor: 'Sastrería', tailoring: 'Sastrería',
    alteration: 'Arreglo', mixed: 'Mixta', online: 'Tienda online',
  }

  const PRICE_FIELDS = new Set([
    'unit_price', 'line_total', 'total', 'subtotal', 'amount',
    'tax_amount', 'discount_amount', 'base_price', 'price_with_tax',
    'price_override', 'cost_price', 'cost_price_override',
    'opening_amount', 'counted_cash', 'expected_cash', 'cash_difference',
  ])

  const labelize = (field: string) =>
    FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  // Formatea un primitivo según el nombre del campo (precio, %, método de pago, etc.)
  const formatPrimitive = (field: string, val: unknown): string => {
    if (val === null || val === undefined || val === '') return '—'
    if (typeof val === 'boolean') return val ? 'Sí' : 'No'
    if (field === 'payment_method' && typeof val === 'string') return PAYMENT_METHODS_ES[val] ?? val
    if (field === 'sale_type' && typeof val === 'string') return SALE_TYPES_ES[val] ?? val
    if (PRICE_FIELDS.has(field)) {
      const n = Number(val)
      if (!Number.isNaN(n)) return `${n.toFixed(2)} €`
    }
    if (field === 'discount_percentage' || field === 'tax_rate' || field === 'tax_rate_pct') {
      const n = Number(val)
      if (!Number.isNaN(n)) return `${n}%`
    }
    return String(val)
  }

  const isPrimitive = (val: unknown) =>
    val === null || val === undefined || (typeof val !== 'object')

  // Renderiza recursivamente un valor (primitivo, objeto o array) como JSX legible.
  // Para objetos muestra filas "Label: valor". Para arrays de objetos muestra bloques numerados.
  const renderValue = (val: unknown, field = ''): React.ReactNode => {
    if (val === null || val === undefined || val === '') return <span className="text-muted-foreground">—</span>
    if (isPrimitive(val)) return <span>{formatPrimitive(field, val)}</span>
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="text-muted-foreground">—</span>
      const allPrimitive = val.every(isPrimitive)
      if (allPrimitive) return <span>{val.map(v => formatPrimitive(field, v)).join(', ')}</span>
      return (
        <div className="space-y-1.5">
          {val.map((item, i) => (
            <div key={i} className="rounded border border-muted bg-background/60 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">#{i + 1}</p>
              {renderValue(item)}
            </div>
          ))}
        </div>
      )
    }
    // objeto
    const entries = Object.entries(val as Record<string, unknown>)
      .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && v !== null && v !== undefined && v !== '')
    if (entries.length === 0) return <span className="text-muted-foreground">—</span>
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="text-xs flex flex-wrap gap-1">
            <span className="font-medium text-muted-foreground">{labelize(k)}:</span>
            {isPrimitive(v)
              ? <span>{formatPrimitive(k, v)}</span>
              : <div className="w-full pl-2 mt-0.5">{renderValue(v, k)}</div>}
          </div>
        ))}
      </div>
    )
  }

  const isComplex = (v: unknown) => v !== null && typeof v === 'object'

  const renderChanges = (changes: Record<string, unknown> | null) => {
    if (!changes) return <span className="text-muted-foreground">—</span>
    return (
      <div className="space-y-2">
        {Object.entries(changes).map(([field, val]) => {
          const v = val as { old: unknown; new: unknown }
          const hasOld = v?.old !== undefined && v?.old !== null && v?.old !== ''
          const hasNew = v?.new !== undefined && v?.new !== null && v?.new !== ''
          const complex = isComplex(v?.old) || isComplex(v?.new)

          if (complex) {
            return (
              <div key={field} className="rounded-md border border-muted bg-muted/30 p-2">
                <p className="text-xs font-semibold mb-1">{labelize(field)}</p>
                {hasOld && (
                  <div className="text-xs mb-1">
                    <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-0.5">Anterior</span>
                    <div>{renderValue(v.old, field)}</div>
                  </div>
                )}
                {hasNew && (
                  <div className="text-xs">
                    <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-green-700 mb-0.5">
                      {hasOld ? 'Nuevo' : 'Valor'}
                    </span>
                    <div>{renderValue(v.new, field)}</div>
                  </div>
                )}
              </div>
            )
          }

          const oldStr = formatPrimitive(field, v?.old)
          const newStr = formatPrimitive(field, v?.new)
          return (
            <div key={field} className="text-xs flex flex-wrap items-center gap-1">
              <span className="font-medium text-muted-foreground">{labelize(field)}:</span>
              {hasOld && !hasNew ? (
                <span className="line-through text-red-600">{oldStr}</span>
              ) : !hasOld && hasNew ? (
                <span className="text-green-700">{newStr}</span>
              ) : (
                <>
                  <span className="line-through text-red-600">{oldStr}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-green-700">{newStr}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Seguimiento</h1>
          <p className="text-muted-foreground">Registro completo de actividad — {count} eventos</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
                <Select value={filterAction} onValueChange={v => { setFilterAction(v); setPage(1) }}>
              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Acción" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                <SelectItem value="create">Crear</SelectItem>
                <SelectItem value="update">Editar</SelectItem>
                <SelectItem value="delete">Eliminar</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEntity} onValueChange={v => { setFilterEntity(v); setPage(1) }}>
              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Entidad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <DatePickerPopover
              containerClassName="w-40"
              value={filterDateFrom}
              onChange={date => { setFilterDateFrom(date); setPage(1) }}
            />
            <DatePickerPopover
              containerClassName="w-40"
              value={filterDateTo}
              onChange={date => { setFilterDateTo(date); setPage(1) }}
            />
            <Button variant="ghost" size="sm" onClick={() => { setFilterAction('all'); setFilterEntity('all'); setFilterDateFrom(''); setFilterDateTo(''); setPage(1) }}>
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-destructive text-sm">{loadError}</p>
              <Button variant="outline" size="sm" onClick={load}>Reintentar</Button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-prats-navy" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">Sin registros de auditoría</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Fecha/Hora</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="w-24">Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <React.Fragment key={log.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.created_at)}</TableCell>
                      <TableCell className="text-sm font-medium">{log.user_name}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_BADGES[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                          {getActionLabel(log)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{getEntityTypeLabel(log)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.entity_label ?? log.entity_id ?? '—'}</TableCell>
                      <TableCell>
                        {log.changes || log.metadata ? (expandedId === log.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                      </TableCell>
                    </TableRow>
                    {expandedId === log.id && (log.changes || log.metadata) && (
                      <TableRow key={`${log.id}-expand`} className="bg-muted/30">
                        <TableCell colSpan={6} className="py-3 px-6">
                          {log.changes && (
                            <>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Cambios:</p>
                              {renderChanges(log.changes)}
                            </>
                          )}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className={log.changes ? 'mt-3' : ''}>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Información adicional:</p>
                              <div className="space-y-1">
                                {Object.entries(log.metadata).map(([k, v]) => (
                                  <div key={k} className="text-xs">
                                    <span className="font-medium text-muted-foreground">{labelize(k)}:</span>
                                    {isPrimitive(v)
                                      ? <span className="ml-1">{formatPrimitive(k, v)}</span>
                                      : <div className="mt-0.5 pl-2">{renderValue(v, k)}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
