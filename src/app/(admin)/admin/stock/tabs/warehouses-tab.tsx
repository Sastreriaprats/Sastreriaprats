'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { listPhysicalWarehouses, listStockByWarehouse } from '@/actions/products'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, Warehouse, Image as ImageIcon, X, SlidersHorizontal } from 'lucide-react'

const productTypeLabels: Record<string, string> = {
  boutique: 'Boutique', tailoring_fabric: 'Tejido', accessory: 'Complemento', service: 'Servicio',
}

type WarehouseInfo = { id: string; name: string; code: string; storeName: string }
type StockRow = {
  product_id: string; product_name: string; product_sku: string; product_type: string
  main_image_url: string | null; supplier_name: string | null
  variant_sku: string; size: string | null; color: string | null
  quantity: number; reserved: number; available: number
}

type StockFilterValue = 'all' | 'out' | 'low' | 'in'

interface WarehousesTabProps {
  outOfStockFilter?: boolean
  onClearOutOfStockFilter?: () => void
}

export function WarehousesTab({ outOfStockFilter = false, onClearOutOfStockFilter }: WarehousesTabProps) {
  const router = useRouter()

  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<StockRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(true)

  // Filtros de columna
  const [stockFilter, setStockFilter] = useState<StockFilterValue>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [colorFilter, setColorFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')

  // Sincronizar prop externo con el filtro interno de stock
  useEffect(() => {
    if (outOfStockFilter) setStockFilter('out')
  }, [outOfStockFilter])

  useEffect(() => {
    listPhysicalWarehouses().then(result => {
      if (result.success && result.data) {
        setWarehouses(result.data as WarehouseInfo[])
      }
      setIsLoadingWarehouses(false)
    })
  }, [])

  const loadStock = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await listStockByWarehouse({
        warehouseId: selectedWarehouseId,
        search: search || undefined,
      })
      if (result.success && result.data) {
        setRows(result.data as StockRow[])
      } else {
        setRows([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [selectedWarehouseId, search])

  useEffect(() => {
    if (!isLoadingWarehouses) {
      const t = setTimeout(loadStock, 300)
      return () => clearTimeout(t)
    }
  }, [loadStock, isLoadingWarehouses])

  // Opciones dinámicas derivadas de los datos cargados
  const sizeOptions = useMemo(() => [...new Set(rows.map(r => r.size).filter(Boolean))].sort() as string[], [rows])
  const colorOptions = useMemo(() => [...new Set(rows.map(r => r.color).filter(Boolean))].sort() as string[], [rows])
  const supplierOptions = useMemo(() => [...new Set(rows.map(r => r.supplier_name).filter(Boolean))].sort() as string[], [rows])
  const typeOptions = useMemo(() => [...new Set(rows.map(r => r.product_type))].sort(), [rows])

  // Aplicar todos los filtros
  const displayedRows = useMemo(() => {
    return rows.filter(r => {
      if (stockFilter === 'out' && r.quantity > 0) return false
      if (stockFilter === 'low' && (r.quantity <= 0 || r.quantity > 5)) return false
      if (stockFilter === 'in' && r.quantity <= 0) return false
      if (typeFilter !== 'all' && r.product_type !== typeFilter) return false
      if (sizeFilter !== 'all' && r.size !== sizeFilter) return false
      if (colorFilter !== 'all' && r.color !== colorFilter) return false
      if (supplierFilter !== 'all' && r.supplier_name !== supplierFilter) return false
      return true
    })
  }, [rows, stockFilter, typeFilter, sizeFilter, colorFilter, supplierFilter])

  const hasActiveFilters = stockFilter !== 'all' || typeFilter !== 'all' || sizeFilter !== 'all' || colorFilter !== 'all' || supplierFilter !== 'all'

  const clearAllFilters = () => {
    setStockFilter('all')
    setTypeFilter('all')
    setSizeFilter('all')
    setColorFilter('all')
    setSupplierFilter('all')
    onClearOutOfStockFilter?.()
  }

  const handleStockFilterChange = (val: StockFilterValue) => {
    setStockFilter(val)
    if (val !== 'out') onClearOutOfStockFilter?.()
  }

  return (
    <div className="space-y-4">
      {/* Selector de almacén */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Selecciona un almacén para ver sus existencias</p>
        <div className="flex flex-wrap gap-2 items-center">
          {isLoadingWarehouses ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Button
                size="sm"
                variant={selectedWarehouseId === 'all' ? 'default' : 'outline'}
                className={selectedWarehouseId === 'all' ? 'bg-prats-navy hover:bg-prats-navy-light' : ''}
                onClick={() => setSelectedWarehouseId('all')}
              >
                <Warehouse className="mr-1 h-3 w-3" /> Todos los almacenes
              </Button>
              {warehouses.map((w) => (
                <Button
                  key={w.id}
                  size="sm"
                  variant={selectedWarehouseId === w.id ? 'default' : 'outline'}
                  className={selectedWarehouseId === w.id ? 'bg-prats-navy hover:bg-prats-navy-light' : ''}
                  onClick={() => setSelectedWarehouseId(w.id)}
                >
                  {w.name}{w.storeName ? ` — ${w.storeName}` : ''}
                </Button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      {!isLoading && rows.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Líneas de stock</p>
              <p className="text-xl font-bold">{displayedRows.length}<span className="text-sm font-normal text-muted-foreground"> / {rows.length}</span></p>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Unidades totales</p>
              <p className="text-xl font-bold">{displayedRows.reduce((s, r) => s + r.quantity, 0)}</p>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-red-500">Sin stock</p>
              <p className="text-xl font-bold text-red-600">{rows.filter((r) => r.quantity <= 0).length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Barra de filtros */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros</span>
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground ml-auto"
              onClick={clearAllFilters}
            >
              <X className="h-3 w-3 mr-1" /> Limpiar todo
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Búsqueda */}
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto o SKU..."
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Stock */}
          <Select value={stockFilter} onValueChange={(v) => handleStockFilterChange(v as StockFilterValue)}>
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

          {/* Tipo */}
          {typeOptions.length > 0 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className={`h-8 w-[140px] text-sm ${typeFilter !== 'all' ? 'border-prats-navy text-prats-navy font-medium' : ''}`}>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {typeOptions.map(t => (
                  <SelectItem key={t} value={t}>{productTypeLabels[t] || t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Talla */}
          {sizeOptions.length > 0 && (
            <Select value={sizeFilter} onValueChange={setSizeFilter}>
              <SelectTrigger className={`h-8 w-[120px] text-sm ${sizeFilter !== 'all' ? 'border-prats-navy text-prats-navy font-medium' : ''}`}>
                <SelectValue placeholder="Talla" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las tallas</SelectItem>
                {sizeOptions.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Color */}
          {colorOptions.length > 0 && (
            <Select value={colorFilter} onValueChange={setColorFilter}>
              <SelectTrigger className={`h-8 w-[130px] text-sm ${colorFilter !== 'all' ? 'border-prats-navy text-prats-navy font-medium' : ''}`}>
                <SelectValue placeholder="Color" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los colores</SelectItem>
                {colorOptions.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Proveedor */}
          {supplierOptions.length > 0 && (
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className={`h-8 w-[150px] text-sm ${supplierFilter !== 'all' ? 'border-prats-navy text-prats-navy font-medium' : ''}`}>
                <SelectValue placeholder="Proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {supplierOptions.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Chips de filtros activos */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5">
            {stockFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                {stockFilter === 'out' ? 'Sin stock' : stockFilter === 'low' ? 'Stock bajo' : 'Con stock'}
                <button onClick={() => handleStockFilterChange('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {typeFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                {productTypeLabels[typeFilter] || typeFilter}
                <button onClick={() => setTypeFilter('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {sizeFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                Talla {sizeFilter}
                <button onClick={() => setSizeFilter('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {colorFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                {colorFilter}
                <button onClick={() => setColorFilter('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {supplierFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                {supplierFilter}
                <button onClick={() => setSupplierFilter('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>SKU variante</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-center">Cantidad</TableHead>
              <TableHead className="text-center">Reservado</TableHead>
              <TableHead className="text-center">Disponible</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="h-40 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : displayedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-40 text-center text-muted-foreground">
                  {hasActiveFilters ? 'No hay resultados para los filtros aplicados.' : 'No hay stock en este almacén.'}
                </TableCell>
              </TableRow>
            ) : (
              displayedRows.map((r, i) => (
                <TableRow
                  key={`${r.product_id}-${r.variant_sku}-${i}`}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/stock/productos/${r.product_id}`)}
                >
                  <TableCell>
                    {r.main_image_url ? (
                      <img src={r.main_image_url} alt="" className="h-9 w-9 rounded object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center">
                        <ImageIcon className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium text-sm">{r.product_name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{r.product_sku}</p>
                      </div>
                      {r.product_type === 'tailoring_fabric' && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 px-1.5 py-0 h-4 shrink-0">Tela</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{r.variant_sku}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{productTypeLabels[r.product_type] || r.product_type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{r.size || '-'}</TableCell>
                  <TableCell className="text-sm">{r.color || '-'}</TableCell>
                  <TableCell className="text-sm">{r.supplier_name || '-'}</TableCell>
                  <TableCell className="text-center">
                    {r.product_type === 'tailoring_fabric' ? (
                      <span className={`font-bold ${r.quantity <= 0 ? 'text-red-600' : 'text-blue-700'}`}>
                        {r.quantity} m
                      </span>
                    ) : (
                      <span className={`font-bold ${r.quantity <= 0 ? 'text-red-600' : ''}`}>{r.quantity}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{r.reserved}</TableCell>
                  <TableCell className="text-center">
                    {r.product_type === 'tailoring_fabric' ? (
                      <span className={`font-medium ${r.available <= 0 ? 'text-red-600' : 'text-blue-700'}`}>
                        {r.available} m
                      </span>
                    ) : (
                      <span className={`font-medium ${r.available <= 0 ? 'text-red-600' : r.available <= 2 ? 'text-amber-600' : 'text-green-700'}`}>{r.available}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
