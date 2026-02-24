'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search, Loader2, Plus, Eye, MoreHorizontal, Image as ImageIcon,
} from 'lucide-react'
import { useList } from '@/hooks/use-list'
import { usePermissions } from '@/hooks/use-permissions'
import { listProducts } from '@/actions/products'
import { formatCurrency } from '@/lib/utils'
import { forwardRef, useImperativeHandle } from 'react'

function getFabricStock(product: any): number {
  let total = 0
  for (const v of product.product_variants || []) {
    for (const sl of v.stock_levels || []) {
      total += sl.quantity || 0
    }
  }
  return total
}

function getFabricWarehouses(product: any): { name: string; qty: number }[] {
  const map = new Map<string, { name: string; qty: number }>()
  for (const v of product.product_variants || []) {
    for (const sl of v.stock_levels || []) {
      const wId = sl.warehouse_id
      const wName = sl.warehouses?.name || sl.warehouses?.code || wId
      const cur = map.get(wId)
      if (cur) cur.qty += sl.quantity || 0
      else map.set(wId, { name: wName, qty: sl.quantity || 0 })
    }
  }
  return Array.from(map.values())
}

export const FabricsTab = forwardRef<{ openNewFabricDialog: () => void }>(function FabricsTab(_, ref) {
  const router = useRouter()
  const { can } = usePermissions()

  const {
    data: products, total, totalPages, page, setPage,
    search, setSearch, isLoading, pageSize,
  } = useList(listProducts, {
    pageSize: 50,
    defaultSort: 'name',
    defaultOrder: 'asc',
    defaultFilters: { product_type: 'tailoring_fabric' },
  })

  useImperativeHandle(ref, () => ({
    openNewFabricDialog: () => router.push('/admin/stock/productos/nuevo'),
  }), [router])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, SKU, color..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {can('products.create') && (
          <Button onClick={() => router.push('/admin/stock/productos/nuevo')} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
            <Plus className="h-4 w-4" /> Nuevo tejido
          </Button>
        )}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>€/metro</TableHead>
              <TableHead>Metros gastados</TableHead>
              <TableHead>Stock disponible</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  No hay tejidos. Crea uno con «Nuevo tejido» (tipo Tejido).
                </TableCell>
              </TableRow>
            ) : (
              products.map((p: any) => {
                const stockTotal = getFabricStock(p)
                const warehouses = getFabricWarehouses(p)
                const metersUsed = p.fabric_meters_used != null ? Number(p.fabric_meters_used) : 0
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/admin/stock/productos/${p.id}`)}
                  >
                    <TableCell>
                      {p.main_image_url ? (
                        <img src={p.main_image_url} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <span className="text-sm">{p.color || '-'}</span>
                    </TableCell>
                    <TableCell className="text-sm">{p.suppliers?.name || '-'}</TableCell>
                    <TableCell className="font-medium">
                      {p.base_price ? formatCurrency(p.base_price) : '-'}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${metersUsed > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                        {metersUsed.toFixed(1)} m
                      </span>
                    </TableCell>
                    <TableCell>
                      {warehouses.length === 0 ? (
                        <span className="text-xs text-red-500">Sin stock</span>
                      ) : (
                        <div className="space-y-0.5">
                          {warehouses.map((w) => (
                            <div key={w.name} className="flex items-center gap-1 text-xs">
                              <span className={`font-semibold ${w.qty <= 0 ? 'text-red-600' : w.qty <= 5 ? 'text-amber-600' : ''}`}>
                                {w.qty} m
                              </span>
                              <span className="text-muted-foreground">· {w.name}</span>
                            </div>
                          ))}
                          {warehouses.length > 1 && (
                            <div className="text-xs font-bold border-t pt-0.5">Total: {stockTotal} m</div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/admin/stock/productos/${p.id}`)}>
                            <Eye className="mr-2 h-4 w-4" /> Ver ficha
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
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span>{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  )
})
