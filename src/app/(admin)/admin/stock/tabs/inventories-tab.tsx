'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePageParam } from '@/hooks/use-page-param'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Plus, ChevronLeft, ChevronRight, ClipboardList, Eye, ScanBarcode } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { listInventories, createInventory } from '@/actions/inventories'
import { listPhysicalWarehouses, listSeasonsAndBrands } from '@/actions/products'
import { usePermissions } from '@/hooks/use-permissions'
import type { InventoryScope } from '@/lib/validations/inventories'

/**
 * Inventarios de tienda. Petición de Mónica (22-sep-2026): tener dónde hacer el
 * recuento y que el resultado diga «qué había y qué hemos contado».
 */

const PAGE_SIZE = 20

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  in_progress: { label: 'En curso',  className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  completed:   { label: 'Cerrado',   className: 'bg-sky-100 text-sky-800 border-sky-200' },
  cancelled:   { label: 'Anulado',   className: 'bg-slate-100 text-slate-700 border-slate-200' },
}

const SCOPE_LABELS: Record<string, string> = {
  full: 'Almacén completo',
  category: 'Por categoría',
  season: 'Por temporada',
  brand: 'Por marca',
}

type InventoryRow = {
  id: string
  reference: string | null
  status: string
  inventory_type: string | null
  season_filter: string | null
  brand_filter: string | null
  total_items_counted: number | null
  total_differences: number | null
  total_value_difference: number | string | null
  total_units_expected: number | null
  total_units_counted: number | null
  started_at: string | null
  completed_at: string | null
  applied_at: string | null
  warehouse?: { id: string; name?: string | null; code?: string | null; store?: { name?: string | null; display_name?: string | null } | null } | null
  started_by_profile?: { full_name?: string | null } | null
}

export function InventoriesTab() {
  const router = useRouter()
  const { can } = usePermissions()
  const canCount = can('stock.inventory')

  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = usePageParam('ipage', 0)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')

  const [newOpen, setNewOpen] = useState(false)
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; storeName?: string }>>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [scope, setScope] = useState<InventoryScope>('full')
  const [season, setSeason] = useState('')
  const [brand, setBrand] = useState('')
  const [notes, setNotes] = useState('')
  const [seasons, setSeasons] = useState<string[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listInventories({ status: statusFilter as any, page, pageSize: PAGE_SIZE })
      if (res.success && res.data) {
        setRows(res.data.data as InventoryRow[])
        setTotal(res.data.total)
      } else {
        setRows([])
        setTotal(0)
      }
    } catch (err) {
      console.error('Error cargando inventarios:', err)
      toast.error('Error al cargar los inventarios')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!newOpen) return
    listPhysicalWarehouses().then((res) => {
      if (res.success && res.data) setWarehouses(res.data as Array<{ id: string; name: string; storeName?: string }>)
    }).catch(() => setWarehouses([]))
    listSeasonsAndBrands().then((res) => {
      if (res.success && res.data) { setSeasons(res.data.seasons); setBrands(res.data.brands) }
    }).catch(() => { /* los filtros son opcionales */ })
  }, [newOpen])

  const handleCreate = async () => {
    if (!warehouseId) { toast.error('Elige el almacén que vas a contar'); return }
    if (scope === 'season' && !season) { toast.error('Elige la temporada'); return }
    if (scope === 'brand' && !brand) { toast.error('Elige la marca'); return }
    setCreating(true)
    try {
      const res = await createInventory({
        warehouse_id: warehouseId,
        scope,
        season: scope === 'season' ? season : null,
        brand: scope === 'brand' ? brand : null,
        notes: notes.trim() || null,
      })
      if (!res.success) { toast.error(res.error || 'No se pudo crear el inventario'); return }
      toast.success(`Inventario ${res.data.reference} listo: ${res.data.lines} referencias por contar`)
      setNewOpen(false)
      setWarehouseId(''); setScope('full'); setSeason(''); setBrand(''); setNotes('')
      router.push(`/admin/stock/inventarios/${res.data.id}`)
    } catch (err) {
      console.error('Error creando el inventario:', err)
      toast.error('Error al crear el inventario. Inténtalo de nuevo.')
    } finally {
      setCreating(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0) }}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="in_progress">En curso</SelectItem>
              <SelectItem value="completed">Cerrados</SelectItem>
              <SelectItem value="cancelled">Anulados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canCount && (
          <Button className="gap-1" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo inventario
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        El inventario congela lo que el sistema dice tener en el almacén, se cuenta con la pistola y
        al cerrarlo compara <strong>lo que había</strong> con <strong>lo contado</strong>. Puedes dejar el
        stock igual a lo contado o quedarte solo con el informe.
      </p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referencia</TableHead>
              <TableHead>Almacén</TableHead>
              <TableHead>Alcance</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-center">Había / Contado</TableHead>
              <TableHead className="text-center">No cuadran</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  <ClipboardList className="mx-auto h-6 w-6 mb-2 opacity-50" />
                  Todavía no se ha hecho ningún inventario
                </TableCell>
              </TableRow>
            ) : rows.map((r) => {
              const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.in_progress
              const diffValue = Number(r.total_value_difference ?? 0)
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/admin/stock/inventarios/${r.id}`)}>
                  <TableCell className="font-mono text-sm">{r.reference ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    <div>{r.warehouse?.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.warehouse?.store?.display_name || r.warehouse?.store?.name || ''}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {SCOPE_LABELS[r.inventory_type ?? 'full'] ?? r.inventory_type}
                    {r.season_filter ? <div className="text-xs text-muted-foreground">{r.season_filter}</div> : null}
                    {r.brand_filter ? <div className="text-xs text-muted-foreground">{r.brand_filter}</div> : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                    {r.status === 'completed' && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {r.applied_at ? 'stock ajustado' : 'solo informe'}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm">
                    {Number(r.total_units_expected ?? 0)} / {Number(r.total_units_counted ?? 0)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm">
                    {r.status === 'in_progress' ? '—' : Number(r.total_differences ?? 0)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums text-sm ${diffValue < 0 ? 'text-rose-700' : diffValue > 0 ? 'text-emerald-700' : ''}`}>
                    {r.status === 'in_progress' ? '—' : formatCurrency(diffValue)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    <div>{r.started_at ? formatDateTime(r.started_at) : '—'}</div>
                    {r.started_by_profile?.full_name && <div>{r.started_by_profile.full_name}</div>}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button asChild size="sm" variant="outline" className="gap-1">
                      <Link href={`/admin/stock/inventarios/${r.id}`}>
                        {r.status === 'in_progress' ? <ScanBarcode className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {r.status === 'in_progress' ? 'Contar' : 'Ver'}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages} · {total} inventarios</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={(v) => { if (!v && !creating) setNewOpen(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo inventario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Almacén a contar</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Selecciona almacén" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}{w.storeName ? ` (${w.storeName})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Qué vas a contar</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as InventoryScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Todo el almacén</SelectItem>
                  <SelectItem value="season">Solo una temporada</SelectItem>
                  <SelectItem value="brand">Solo una marca</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === 'season' && (
              <div className="space-y-1">
                <Label>Temporada</Label>
                <Select value={season} onValueChange={setSeason}>
                  <SelectTrigger><SelectValue placeholder="Selecciona temporada" /></SelectTrigger>
                  <SelectContent>
                    {seasons.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {scope === 'brand' && (
              <div className="space-y-1">
                <Label>Marca</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger><SelectValue placeholder="Selecciona marca" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" maxLength={500} />
            </div>
            <p className="text-xs text-muted-foreground">
              Se guarda una foto de lo que el sistema dice tener ahora mismo. A partir de ese momento
              puedes contar con la pistola; el stock no se toca hasta que cierres el inventario.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !warehouseId} className="gap-1">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
              Empezar a contar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
