'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search, ChevronLeft, ChevronRight, Plus, Loader2, Shirt, MoreHorizontal,
  ExternalLink, FileDown, Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import { useList } from '@/hooks/use-list'
import { useActiveStore } from '@/hooks/use-store'
import {
  listAlterations,
  createAlteration,
  updateAlterationStatus,
} from '@/actions/alterations'
import { listClients } from '@/actions/clients'
import {
  type AlterationRow,
  type AlterationStatus,
  type AlterationType,
  ALTERATION_STATUS_LABELS,
  ALTERATION_STATUS_COLORS,
} from '@/types/alterations'
import { downloadAlterationPdf, printAlterationPdf } from '@/lib/pdf/alteration-pdf'

const TYPE_LABELS: Record<AlterationType, string> = {
  order: 'Pedido',
  boutique: 'Boutique',
  external: 'Externo',
}
const TYPE_BADGE: Record<AlterationType, string> = {
  order: 'bg-blue-100 text-blue-700 border-blue-200',
  boutique: 'bg-purple-100 text-purple-700 border-purple-200',
  external: 'bg-amber-100 text-amber-700 border-amber-200',
}

export function ArreglosListContent() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [stores, setStores] = useState<{ id: string; name: string }[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [storeFilter, setStoreFilter] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const {
    data: alterations, total, totalPages, page, setPage,
    search, setSearch, filters, setFilters, isLoading, refresh, statusCounts,
  } = useList<AlterationRow>(listAlterations, {
    pageSize: 25,
    defaultSort: 'alteration_date',
    defaultOrder: 'desc',
  })

  useEffect(() => {
    supabase.from('stores').select('id, name').order('name').then(({ data }) => setStores(data ?? []))
  }, [supabase])

  const apply = (patch: Record<string, unknown>) => setFilters((prev) => ({ ...prev, ...patch }))

  const handleStatusChange = async (id: string, status: string) => {
    const res = await updateAlterationStatus({ id, status: status as AlterationStatus })
    if (res.success) {
      toast.success(`Estado actualizado a "${ALTERATION_STATUS_LABELS[status as AlterationStatus]}"`)
      refresh()
    } else {
      toast.error('error' in res ? res.error : 'Error al actualizar estado')
    }
  }

  const handleDownload = async (id: string) => {
    try { await downloadAlterationPdf(id) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Error al generar PDF') }
  }
  const handlePrint = async (id: string) => {
    try { await printAlterationPdf(id) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Error al imprimir') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Arreglos</h1>
          <p className="text-muted-foreground">{total} arreglos</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nuevo arreglo
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nº, cliente, prenda…" className="pl-9" autoComplete="off"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); apply({ status: v === 'all' ? undefined : v }) }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(Object.keys(ALTERATION_STATUS_LABELS) as AlterationStatus[]).map((k) => (
              <SelectItem key={k} value={k}>{ALTERATION_STATUS_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); apply({ alteration_type: v === 'all' ? undefined : v }) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="order">Pedido</SelectItem>
            <SelectItem value="boutique">Boutique</SelectItem>
            <SelectItem value="external">Externo</SelectItem>
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

      {/* Resumen por estado */}
      {statusCounts && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ALTERATION_STATUS_LABELS) as AlterationStatus[]).map((k) => (
            <Badge key={k} variant="outline" className={`${ALTERATION_STATUS_COLORS[k]} font-normal`}>
              {ALTERATION_STATUS_LABELS[k]}: {statusCounts[k] ?? 0}
            </Badge>
          ))}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Prenda</TableHead>
              <TableHead>Oficial</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : alterations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                  <Shirt className="mx-auto h-10 w-10 mb-3 opacity-30" />
                  No hay arreglos{search ? ` para "${search}"` : ''}
                </TableCell>
              </TableRow>
            ) : (
              alterations.map((a) => {
                const officialName = a.official_name || a.official?.name || '—'
                return (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/arreglos/${a.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      <Link href={`/admin/arreglos/${a.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {a.alteration_number}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(a.alteration_date)}</TableCell>
                    <TableCell className="text-sm font-medium">{a.clients?.full_name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_BADGE[a.alteration_type] ?? TYPE_BADGE.external}>
                        {TYPE_LABELS[a.alteration_type] ?? 'Externo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{a.garment_type || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{officialName}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={a.status} onValueChange={(v) => handleStatusChange(a.id, v)}>
                        <SelectTrigger className={`h-8 w-36 text-xs ${ALTERATION_STATUS_COLORS[a.status]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ALTERATION_STATUS_LABELS) as AlterationStatus[]).map((k) => (
                            <SelectItem key={k} value={k} className="text-xs">{ALTERATION_STATUS_LABELS[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/arreglos/${a.id}`}>
                              <ExternalLink className="mr-2 h-4 w-4" /> Ver detalle
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownload(a.id)}>
                            <FileDown className="mr-2 h-4 w-4" /> Descargar PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrint(a.id)}>
                            <Printer className="mr-2 h-4 w-4" /> Imprimir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
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

      <NewAlterationDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
  )
}

// ─── Dialog: Nuevo arreglo (con buscador de cliente) ─────────────────────────

function NewAlterationDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const { activeStoreId } = useActiveStore()
  const [tab, setTab] = useState<'order' | 'external'>('external')
  const [saving, setSaving] = useState(false)

  // Cliente
  const [clientSearch, setClientSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; full_name: string; email: string | null; phone: string | null }[]>([])
  const [clientLoading, setClientLoading] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')

  // Pedido (tab order)
  const [orders, setOrders] = useState<{ id: string; order_number: string; order_date: string; status: string }[]>([])
  const [orderId, setOrderId] = useState('')
  const [ordersLoading, setOrdersLoading] = useState(false)

  const [officials, setOfficials] = useState<{ id: string; name: string }[]>([])

  // Form
  const [phone, setPhone] = useState('')
  const [garmentType, setGarmentType] = useState('')
  const [description, setDescription] = useState('')
  const [alterationDate, setAlterationDate] = useState(new Date().toISOString().split('T')[0])
  const [estimated, setEstimated] = useState('')
  const [officialId, setOfficialId] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(clientSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  useEffect(() => {
    if (!debounced) { setClientResults([]); return }
    let cancelled = false
    ;(async () => {
      setClientLoading(true)
      const res = await listClients({ search: debounced, pageSize: 20, sortBy: 'full_name', sortOrder: 'asc' })
      if (!cancelled && res.success && res.data) {
        setClientResults((res.data.data as { id: string; full_name: string; email: string | null; phone: string | null }[]) || [])
      }
      if (!cancelled) setClientLoading(false)
    })()
    return () => { cancelled = true }
  }, [debounced])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('officials').select('id, name').eq('is_active', true).order('name')
        if (!cancelled && data) setOfficials(data as { id: string; name: string }[])
      } catch (err) { console.error('[NewAlterationDialog] officials', err) }
    })()
    return () => { cancelled = true }
  }, [open])

  // Cargar pedidos del cliente seleccionado para el tab "order"
  useEffect(() => {
    if (!clientId || tab !== 'order') { setOrders([]); return }
    let cancelled = false
    ;(async () => {
      setOrdersLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('tailoring_orders')
        .select('id, order_number, order_date, status')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (!cancelled && data) setOrders(data as { id: string; order_number: string; order_date: string; status: string }[])
      if (!cancelled) setOrdersLoading(false)
    })()
    return () => { cancelled = true }
  }, [clientId, tab])

  function reset() {
    setTab('external')
    setClientSearch(''); setDebounced(''); setClientResults([])
    setClientId(''); setClientName('')
    setOrders([]); setOrderId('')
    setPhone(''); setGarmentType(''); setDescription('')
    setAlterationDate(new Date().toISOString().split('T')[0])
    setEstimated(''); setOfficialId(''); setNotes('')
  }

  function selectClient(c: { id: string; full_name: string; phone: string | null }) {
    setClientId(c.id)
    setClientName(c.full_name)
    if (c.phone) setPhone(c.phone)
    setClientSearch(''); setClientResults([])
  }

  async function handleSave() {
    if (!clientId) { toast.error('Selecciona un cliente'); return }
    if (!description.trim()) { toast.error('Describe el arreglo'); return }
    setSaving(true)
    try {
      const res = await createAlteration({
        client_id: clientId,
        phone: phone.trim() || null,
        garment_type: garmentType.trim() || null,
        official_id: officialId || null,
        description: description.trim(),
        alteration_date: alterationDate,
        notes: notes.trim() || null,
        store_id: activeStoreId || null,
        alteration_type: tab === 'order' ? 'order' : 'external',
        tailoring_order_id: tab === 'order' ? (orderId || null) : null,
        estimated_completion: estimated || null,
      })
      if (res.success && res.data) {
        const created = res.data
        toast.success(`Arreglo ${created.alteration_number} creado`, {
          action: { label: 'Descargar PDF', onClick: () => downloadAlterationPdf(created.id) },
        })
        reset()
        onOpenChange(false)
        onCreated()
      } else {
        toast.error('error' in res ? res.error : 'Error al crear arreglo')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shirt className="h-5 w-5" /> Nuevo arreglo</DialogTitle>
          <DialogDescription className="sr-only">Registrar un nuevo arreglo para un cliente.</DialogDescription>
        </DialogHeader>

        {/* Tipo */}
        <div className="flex gap-2">
          <Button type="button" variant={tab === 'external' ? 'default' : 'outline'} size="sm" onClick={() => setTab('external')}>
            Prenda externa
          </Button>
          <Button type="button" variant={tab === 'order' ? 'default' : 'outline'} size="sm" onClick={() => setTab('order')}>
            Sobre pedido
          </Button>
        </div>

        {/* Cliente */}
        {!clientId ? (
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email, teléfono…"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
            {clientLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {clientResults.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border divide-y">
                {clientResults.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => selectClient(c)}>
                      <span className="font-medium">{c.full_name}</span>
                      {c.email && <span className="text-muted-foreground ml-2 text-xs">{c.email}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Label>Cliente:</Label>
            <span className="font-medium text-sm">{clientName}</span>
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
              onClick={() => { setClientId(''); setClientName(''); setOrderId('') }}>
              Cambiar
            </Button>
          </div>
        )}

        {/* Pedido (solo tab order) */}
        {tab === 'order' && clientId && (
          <div className="space-y-1">
            <Label>Pedido</Label>
            {ordersLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : orders.length === 0 ? (
              <p className="text-muted-foreground text-xs">Este cliente no tiene pedidos de sastrería.</p>
            ) : (
              <Select value={orderId || 'none'} onValueChange={(v) => setOrderId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar pedido" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin pedido —</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.order_number} — {formatDate(o.order_date)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Campos comunes */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Teléfono</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" />
          </div>
          <div className="space-y-1">
            <Label>Tipo de prenda</Label>
            <Input value={garmentType} onChange={(e) => setGarmentType(e.target.value)} placeholder="Pantalón, americana…" />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Arreglos *</Label>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe los arreglos a realizar…" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Fecha</Label>
            <Input type="date" value={alterationDate} onChange={(e) => setAlterationDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fecha estimada</Label>
            <Input type="date" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Oficial</Label>
            <Select value={officialId || 'none'} onValueChange={(v) => setOfficialId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin asignar —</SelectItem>
                {officials.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label>Observaciones internas</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No aparecen en la ficha del cliente" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !clientId || !description.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Crear arreglo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
