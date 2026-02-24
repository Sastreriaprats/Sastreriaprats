'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Search, MoreHorizontal, Eye, Pencil, ChevronLeft, ChevronRight, ArrowUpDown, Image as ImageIcon, SlidersHorizontal, X,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useList } from '@/hooks/use-list'
import { usePermissions } from '@/hooks/use-permissions'
import { listProducts } from '@/actions/products'
import { formatCurrency } from '@/lib/utils'

const productTypeLabels: Record<string, string> = {
  boutique: 'Boutique', tailoring_fabric: 'Tejido', accessory: 'Complemento', service: 'Servicio',
}
const productTypeBadgeColors: Record<string, string> = {
  boutique: '', tailoring_fabric: 'bg-amber-100 text-amber-800', accessory: 'bg-blue-100 text-blue-800', service: 'bg-purple-100 text-purple-800',
}

function getProductStockSummary(product: any): { total: number; warehouses: { name: string; qty: number }[] } {
  const warehouseMap = new Map<string, { name: string; qty: number }>()
  for (const variant of product.product_variants || []) {
    for (const sl of variant.stock_levels || []) {
      const wId = sl.warehouse_id
      const wName = sl.warehouses?.name || sl.warehouses?.code || wId
      const existing = warehouseMap.get(wId)
      if (existing) {
        existing.qty += sl.quantity || 0
      } else {
        warehouseMap.set(wId, { name: wName, qty: sl.quantity || 0 })
      }
    }
  }
  const warehouses = Array.from(warehouseMap.values())
  const total = warehouses.reduce((s, w) => s + w.qty, 0)
  return { total, warehouses }
}

type StockFilterValue = 'all' | 'out' | 'low' | 'in'
type WebFilterValue = 'all' | 'yes' | 'no'

export function ProductsTab() {
  const router = useRouter()
  const { can } = usePermissions()

  // Filtros server-side
  const [typeFilter, setTypeFilter] = useState('all')
  const [webFilter, setWebFilter] = useState<WebFilterValue>('all')

  // Filtros client-side (sobre la página cargada)
  const [stockFilter, setStockFilter] = useState<StockFilterValue>('all')

  const {
    data: products, total, totalPages, page, setPage,
    search, setSearch, sortBy, toggleSort, isLoading, pageSize,
    setFilters,
  } = useList(listProducts, { pageSize: 25, defaultSort: 'created_at', defaultOrder: 'desc' })

  const applyType = (v: string) => {
    setTypeFilter(v)
    setFilters(prev => ({ ...prev, ...(v !== 'all' ? { product_type: v } : { product_type: undefined }) }))
  }

  const applyWeb = (v: WebFilterValue) => {
    setWebFilter(v)
    setFilters(prev => ({
      ...prev,
      ...(v === 'yes' ? { is_visible_web: true } : v === 'no' ? { is_visible_web: false } : { is_visible_web: undefined }),
    }))
  }

  const hasActiveFilters = typeFilter !== 'all' || webFilter !== 'all' || stockFilter !== 'all'

  const clearAllFilters = () => {
    applyType('all')
    applyWeb('all')
    setStockFilter('all')
  }

  // Filtro de stock client-side sobre la página cargada
  const displayedProducts = useMemo(() => {
    if (stockFilter === 'all') return products
    return products.filter((p: any) => {
      const { total: qty } = getProductStockSummary(p)
      if (stockFilter === 'out') return qty <= 0
      if (stockFilter === 'low') return qty > 0 && qty <= 5
      if (stockFilter === 'in') return qty > 0
      return true
    })
  }, [products, stockFilter])

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">{children}<ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-foreground' : 'text-muted-foreground/50'}`} /></div>
    </TableHead>
  )

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros</span>
          {hasActiveFilters && (
            <Button
              size="sm" variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground ml-auto"
              onClick={clearAllFilters}
            >
              <X className="h-3 w-3 mr-1" /> Limpiar todo
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Búsqueda */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por SKU, nombre, marca..." className="pl-8 h-8 text-sm"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Tipo */}
          <Select value={typeFilter} onValueChange={applyType}>
            <SelectTrigger className={`h-8 w-[150px] text-sm ${typeFilter !== 'all' ? 'border-prats-navy text-prats-navy font-medium' : ''}`}>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="boutique">Boutique</SelectItem>
              <SelectItem value="tailoring_fabric">Tejido</SelectItem>
              <SelectItem value="accessory">Complemento</SelectItem>
              <SelectItem value="service">Servicio</SelectItem>
            </SelectContent>
          </Select>

          {/* Stock */}
          <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as StockFilterValue)}>
            <SelectTrigger className={`h-8 w-[150px] text-sm ${stockFilter !== 'all' ? 'border-prats-navy text-prats-navy font-medium' : ''}`}>
              <SelectValue placeholder="Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los stocks</SelectItem>
              <SelectItem value="out">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />Sin stock</span>
              </SelectItem>
              <SelectItem value="low">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Stock bajo (≤5)</span>
              </SelectItem>
              <SelectItem value="in">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Con stock</span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Web */}
          <Select value={webFilter} onValueChange={(v) => applyWeb(v as WebFilterValue)}>
            <SelectTrigger className={`h-8 w-[130px] text-sm ${webFilter !== 'all' ? 'border-prats-navy text-prats-navy font-medium' : ''}`}>
              <SelectValue placeholder="Web" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Web: todos</SelectItem>
              <SelectItem value="yes">Visibles en web</SelectItem>
              <SelectItem value="no">No visibles web</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Chips de filtros activos */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5">
            {typeFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                {productTypeLabels[typeFilter] || typeFilter}
                <button onClick={() => applyType('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {stockFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                {stockFilter === 'out' ? 'Sin stock' : stockFilter === 'low' ? 'Stock bajo' : 'Con stock'}
                <button onClick={() => setStockFilter('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {webFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                {webFilter === 'yes' ? 'Visible en web' : 'No visible web'}
                <button onClick={() => applyWeb('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <SortHeader field="sku">SKU</SortHeader>
              <SortHeader field="name">Producto</SortHeader>
              <TableHead>Tipo</TableHead>
              <TableHead>Marca</TableHead>
              <SortHeader field="base_price">PVP</SortHeader>
              <SortHeader field="cost_price">Coste</SortHeader>
              <TableHead>Proveedor</TableHead>
              <TableHead>Stock / Almacén</TableHead>
              <TableHead>Web</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-10 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><div className="space-y-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
                </TableRow>
              ))
            ) : displayedProducts.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="h-40 text-center text-muted-foreground">{hasActiveFilters ? 'No hay productos con los filtros aplicados.' : 'No hay productos'}</TableCell></TableRow>
            ) : displayedProducts.map((p: any) => {
              const isFabric = p.product_type === 'tailoring_fabric'
              const { total: stockTotal, warehouses } = getProductStockSummary(p)
              return (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/admin/stock/productos/${p.id}`)}>
                  <TableCell>
                    {p.main_image_url ? (
                      <img src={p.main_image_url} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    {p.collection && <p className="text-xs text-muted-foreground">{p.collection}{p.season ? ` · ${p.season}` : ''}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${productTypeBadgeColors[p.product_type] || ''}`}>
                      {productTypeLabels[p.product_type] || p.product_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{p.brand || '-'}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(p.base_price)}{isFabric ? <span className="text-xs text-muted-foreground">/m</span> : null}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.cost_price ? formatCurrency(p.cost_price) : '-'}</TableCell>
                  <TableCell className="text-sm">{p.suppliers?.name || '-'}</TableCell>
                  <TableCell>
                    {warehouses.length === 0 ? (
                      <span className="text-xs text-red-500">Sin stock</span>
                    ) : (
                      <div className="space-y-0.5">
                        {warehouses.map((w) => (
                          <div key={w.name} className="flex items-center gap-1 text-xs">
                            <span className={`font-semibold ${w.qty <= 0 ? 'text-red-600' : ''}`}>
                              {isFabric ? `${w.qty} m` : w.qty}
                            </span>
                            <span className="text-muted-foreground">· {w.name}</span>
                          </div>
                        ))}
                        {warehouses.length > 1 && (
                          <div className="text-xs font-bold border-t pt-0.5">
                            Total: {isFabric ? `${stockTotal} m` : stockTotal}
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{p.is_visible_web ? <Badge className="text-xs bg-green-100 text-green-700">Sí</Badge> : <span className="text-xs text-muted-foreground">No</span>}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/stock/productos/${p.id}`)}><Eye className="mr-2 h-4 w-4" /> Ver ficha</DropdownMenuItem>
                        {can('products.edit') && <DropdownMenuItem onClick={() => router.push(`/admin/stock/productos/${p.id}?edit=true`)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  )
}
