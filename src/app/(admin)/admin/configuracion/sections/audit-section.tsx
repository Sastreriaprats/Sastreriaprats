'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const PAGE_SIZE = 25

const actionColors: Record<string, string> = {
  create: 'bg-green-100 text-green-700', update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700', login: 'bg-purple-100 text-purple-700',
  logout: 'bg-gray-100 text-gray-700', state_change: 'bg-amber-100 text-amber-700',
  payment: 'bg-emerald-100 text-emerald-700', refund: 'bg-orange-100 text-orange-700',
}

export function AuditSection() {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ search: '', module: 'all', action: 'all' })

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      let query = supabase.from('audit_logs').select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (filters.module !== 'all') query = query.eq('module', filters.module)
      if (filters.action !== 'all') query = query.eq('action', filters.action)
      if (filters.search) query = query.or(`user_email.ilike.%${filters.search}%,description.ilike.%${filters.search}%,entity_display.ilike.%${filters.search}%`)

      const { data, count } = await query
      if (data) setLogs(data)
      if (count !== null) setTotal(count)
    } catch (err) {
      console.error('[AuditSection] fetchLogs error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, page, filters])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const modules = ['auth', 'clients', 'orders', 'pos', 'stock', 'suppliers', 'accounting', 'config', 'calendar', 'cms', 'emails']
  const actions = ['create', 'read', 'update', 'delete', 'login', 'logout', 'pin_login', 'state_change', 'payment', 'refund', 'export', 'import', 'approve', 'reject', 'cancel']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por email, descripción..." className="pl-9"
            value={filters.search} onChange={(e) => { setFilters(p => ({ ...p, search: e.target.value })); setPage(0) }} />
        </div>
        <Select value={filters.module} onValueChange={(v) => { setFilters(p => ({ ...p, module: v })); setPage(0) }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los módulos</SelectItem>
            {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.action} onValueChange={(v) => { setFilters(p => ({ ...p, action: v })); setPage(0) }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Acción" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            {actions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Descripción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No hay registros</TableCell></TableRow>
            ) : logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.created_at)}</TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">{log.user_full_name || '-'}</p>
                    <p className="text-xs text-muted-foreground">{log.user_email}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                    {log.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{log.module}</TableCell>
                <TableCell>
                  <p className="text-sm">{log.description || log.entity_display || '-'}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} registros en total</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
