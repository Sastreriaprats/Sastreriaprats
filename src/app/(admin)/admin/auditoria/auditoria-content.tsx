'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  changes: Record<string, unknown> | null
  created_at: string
}

const ACTION_BADGES: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  login:  'bg-purple-100 text-purple-700',
  logout: 'bg-gray-100 text-gray-700',
}

const ENTITY_LABELS: Record<string, string> = {
  client: 'Cliente', order: 'Pedido', product: 'Producto',
  stock_movement: 'Stock', user: 'Usuario', config: 'Configuración',
  appointment: 'Cita', sale: 'Venta', supplier: 'Proveedor',
  cms_page: 'Página CMS', blog_post: 'Blog',
}

export function AuditoriaContent() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [filterAction, setFilterAction] = useState('all')
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterUser, setFilterUser] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getAuditLogs({
      page,
      action: filterAction !== 'all' ? filterAction : undefined,
      entityType: filterEntity !== 'all' ? filterEntity : undefined,
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo ? filterDateTo + 'T23:59:59Z' : undefined,
    })
    if (res.data) { setLogs(res.data); setCount(res.count ?? 0) }
    setLoading(false)
  }, [page, filterAction, filterEntity, filterDateFrom, filterDateTo])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(count / 50)

  const renderChanges = (changes: Record<string, unknown> | null) => {
    if (!changes) return <span className="text-muted-foreground">—</span>
    return (
      <div className="space-y-1">
        {Object.entries(changes).map(([field, val]) => {
          const v = val as { old: unknown; new: unknown }
          return (
            <div key={field} className="text-xs">
              <span className="font-medium text-muted-foreground">{field}:</span>{' '}
              <span className="line-through text-red-600">{String(v?.old ?? '—')}</span>
              {' → '}
              <span className="text-green-600">{String(v?.new ?? '—')}</span>
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
          <h1 className="text-2xl font-bold tracking-tight">Auditoría</h1>
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
                <SelectItem value="update">Modificar</SelectItem>
                <SelectItem value="delete">Eliminar</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEntity} onValueChange={v => { setFilterEntity(v); setPage(1) }}>
              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Entidad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Desde..."
              type="date"
              value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); setPage(1) }}
              className="w-40 h-8 text-sm"
            />
            <Input
              placeholder="Hasta..."
              type="date"
              value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); setPage(1) }}
              className="w-40 h-8 text-sm"
            />
            <Button variant="ghost" size="sm" onClick={() => { setFilterAction('all'); setFilterEntity('all'); setFilterDateFrom(''); setFilterDateTo(''); setPage(1) }}>
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
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
                  <>
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.created_at)}</TableCell>
                      <TableCell className="text-sm font-medium">{log.user_name}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_BADGES[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                          {log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{ENTITY_LABELS[log.entity_type] ?? log.entity_type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.entity_label ?? log.entity_id ?? '—'}</TableCell>
                      <TableCell>
                        {log.changes ? (expandedId === log.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                      </TableCell>
                    </TableRow>
                    {expandedId === log.id && log.changes && (
                      <TableRow key={`${log.id}-expand`} className="bg-muted/30">
                        <TableCell colSpan={6} className="py-3 px-6">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Cambios:</p>
                          {renderChanges(log.changes)}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
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
