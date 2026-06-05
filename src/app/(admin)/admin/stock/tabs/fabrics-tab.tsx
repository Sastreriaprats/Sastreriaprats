'use client'

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, Loader2, Plus, MoreHorizontal, Eye, Pencil, PowerOff, SlidersHorizontal } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'
import { listFabrics, updateFabricAction } from '@/actions/fabrics'
import { listSuppliers } from '@/actions/suppliers'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { EditFabricDialog, type FabricRow } from '@/components/admin/edit-fabric-dialog'
import { AdjustFabricStockDialog } from '@/components/admin/adjust-fabric-stock-dialog'
import { SupplierCombobox } from '@/components/admin/supplier-combobox'

export const FabricsTab = forwardRef<{ openNewFabricDialog: () => void }>(function FabricsTab(_, ref) {
  const router = useRouter()
  const { can } = usePermissions()

  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  /** Filtro por fecha de alta (created_at). Formato 'YYYY-MM-DD' o '' = sin filtro. */
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [fabrics, setFabrics] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; nif_cif?: string | null; supplier_code?: string | null }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  /** Tejido en edición/visualización. null = dialog cerrado. */
  const [selectedFabric, setSelectedFabric] = useState<FabricRow | null>(null)
  /** Tejido cuyo stock se está ajustando. null = dialog cerrado. */
  const [adjustingFabric, setAdjustingFabric] = useState<FabricRow | null>(null)
  /** Trigger interno para refrescar el listado tras guardar en el modal. */
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const canEditFabric = can('stock.create_product') || can('products.edit')
  const canAdjustStock = can('stock.edit')

  useImperativeHandle(ref, () => ({
    openNewFabricDialog: () => router.push('/admin/stock/productos/nuevo'),
  }), [router])

  // Cargar proveedores una sola vez
  useEffect(() => {
    listSuppliers({ pageSize: 200, filters: { is_active: true } }).then((res) => {
      if (res.success && res.data) setSuppliers(res.data.data)
    })
  }, [])

  // Cargar tejidos con debounce en la búsqueda
  useEffect(() => {
    setIsLoading(true)
    const handler = setTimeout(async () => {
      const isActive = statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined
      const res = await listFabrics({
        search,
        limit: 200,
        supplierId: supplierId !== 'all' ? supplierId : undefined,
        isActive,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
      })
      if (res.success && res.data) setFabrics(res.data.data)
      setIsLoading(false)
    }, 250)
    return () => clearTimeout(handler)
  }, [search, supplierId, statusFilter, createdFrom, createdTo, refreshTrigger])

  async function toggleActive(fabric: any) {
    setTogglingId(fabric.id)
    const res = await updateFabricAction({ id: fabric.id, data: { is_active: !fabric.is_active } })
    setTogglingId(null)
    if (res.success) {
      setFabrics((prev) => prev.map((f) => f.id === fabric.id ? { ...f, is_active: !f.is_active } : f))
      toast.success(fabric.is_active ? 'Tejido desactivado' : 'Tejido activado')
    } else {
      toast.error('Error al cambiar el estado del tejido')
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, código, composición..."
            className="pl-9 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <SupplierCombobox
          suppliers={suppliers}
          value={supplierId === 'all' ? null : supplierId}
          onChange={(v) => setSupplierId(v ?? 'all')}
          allowNone
          noneLabel="Todos los proveedores"
          triggerClassName="h-8 w-[200px] text-sm"
        />



        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-8 w-[130px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>

        {/* Filtro por fecha de alta */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Alta desde</span>
          <Input
            type="date"
            value={createdFrom}
            max={createdTo || undefined}
            onChange={(e) => setCreatedFrom(e.target.value)}
            className="h-8 w-[140px] text-sm"
            aria-label="Fecha de alta desde"
          />
          <span className="text-xs text-muted-foreground">hasta</span>
          <Input
            type="date"
            value={createdTo}
            min={createdFrom || undefined}
            onChange={(e) => setCreatedTo(e.target.value)}
            className="h-8 w-[140px] text-sm"
            aria-label="Fecha de alta hasta"
          />
          {(createdFrom || createdTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => { setCreatedFrom(''); setCreatedTo('') }}
            >
              Limpiar
            </Button>
          )}
        </div>

        {can('products.create') && (
          <Button
            size="sm"
            onClick={() => router.push('/admin/stock/productos/nuevo')}
            className="gap-2 bg-prats-navy hover:bg-prats-navy-light ml-auto"
          >
            <Plus className="h-4 w-4" /> Nuevo tejido
          </Button>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">€/metro</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Fecha de alta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : fabrics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {search || supplierId !== 'all' || statusFilter !== 'all' || createdFrom || createdTo
                    ? 'No hay tejidos con los filtros aplicados.'
                    : 'No hay tejidos registrados.'}
                </TableCell>
              </TableRow>
            ) : (
              fabrics.map((f: any) => {
                const stock = Number(f.stock_meters) || 0
                const minStock = f.min_stock_meters != null ? Number(f.min_stock_meters) : null
                const stockLow = minStock !== null && stock < minStock
                return (
                  <TableRow key={f.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {f.fabric_code || '-'}
                    </TableCell>
                    <TableCell className="text-sm">{f.suppliers?.name || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {f.price_per_meter != null ? formatCurrency(f.price_per_meter) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium ${stockLow ? 'text-red-600' : ''}`}>
                        {stock.toFixed(2)} m
                      </span>
                      {stockLow && (
                        <span className="block text-xs text-red-400">mín {minStock} m</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(f.created_at)}
                    </TableCell>
                    <TableCell>
                      {f.is_active
                        ? <Badge className="text-xs bg-green-100 text-green-700">Activo</Badge>
                        : <Badge variant="secondary" className="text-xs">Inactivo</Badge>
                      }
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            {togglingId === f.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <MoreHorizontal className="h-4 w-4" />
                            }
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedFabric(f as FabricRow)}>
                            <Eye className="mr-2 h-4 w-4" /> Ver detalle
                          </DropdownMenuItem>
                          {canEditFabric && (
                            <DropdownMenuItem onClick={() => setSelectedFabric(f as FabricRow)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                          )}
                          {canAdjustStock && (
                            <DropdownMenuItem onClick={() => setAdjustingFabric(f as FabricRow)}>
                              <SlidersHorizontal className="mr-2 h-4 w-4" /> Ajustar stock
                            </DropdownMenuItem>
                          )}
                          {can('products.edit') && (
                            <DropdownMenuItem
                              onClick={() => toggleActive(f)}
                              className={f.is_active ? 'text-destructive focus:text-destructive' : ''}
                            >
                              <PowerOff className="mr-2 h-4 w-4" />
                              {f.is_active ? 'Desactivar' : 'Activar'}
                            </DropdownMenuItem>
                          )}
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

      <p className="text-xs text-muted-foreground">
        {!isLoading && `${fabrics.length} tejido${fabrics.length !== 1 ? 's' : ''}`}
      </p>

      <EditFabricDialog
        fabric={selectedFabric}
        suppliers={suppliers}
        canEdit={canEditFabric}
        onClose={() => setSelectedFabric(null)}
        onSaved={() => {
          setSelectedFabric(null)
          setRefreshTrigger((n) => n + 1)
        }}
      />

      <AdjustFabricStockDialog
        open={!!adjustingFabric}
        onOpenChange={(o) => { if (!o) setAdjustingFabric(null) }}
        fabric={adjustingFabric}
        onSuccess={() => setRefreshTrigger((n) => n + 1)}
      />
    </div>
  )
})
