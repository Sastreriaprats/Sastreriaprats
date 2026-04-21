'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, ChevronLeft, ChevronRight, Check, X, FileText, Plus } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import {
  listStockTransfers,
  approveStockTransfer,
  rejectStockTransfer,
  createStockTransfer,
  listPhysicalWarehouses,
  listTransferCandidates,
  searchTransferProducts,
} from '@/actions/products'
import { createDeliveryNoteFromTransfer } from '@/actions/delivery-notes'
import { useAuth } from '@/components/providers/auth-provider'
import { toast } from 'sonner'

const PAGE_SIZE = 20

const statusLabels: Record<string, string> = {
  requested: 'Pendiente de aprobar',
  approved: 'Aprobado',
  in_transit: 'En tránsito',
  received: 'Recibido',
  cancelled: 'Cancelado',
  all: 'Todos',
}

type TransferLine = {
  product_variant_id: string
  product_name: string
  product_sku: string
  variant_sku: string
  available: number
  quantity_requested: number
  selected: boolean
}

export function TransfersTab() {
  const { profile, stores, isAdmin } = useAuth()
  const userStoreIds = new Set(stores.map((s) => s.storeId))
  const [transfers, setTransfers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const [actioningId, setActioningId] = useState<string | null>(null)

  const [newOpen, setNewOpen] = useState(false)
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [isMassive, setIsMassive] = useState(false)
  const [massiveCategory, setMassiveCategory] = useState<'all' | 'sastreria' | 'boutique' | 'tejidos'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [lines, setLines] = useState<TransferLine[]>([])

  const fetchTransfers = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await listStockTransfers({
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
      })
      if (result.success && result.data) {
        setTransfers(result.data.data)
        setTotal(result.data.total)
      } else {
        setTransfers([])
        setTotal(0)
      }
    } catch (err) {
      console.error('[TransfersTab] fetchTransfers error:', err)
      setTransfers([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [page, statusFilter])

  const loadWarehouses = useCallback(async () => {
    setLoadingWarehouses(true)
    try {
      const result = await listPhysicalWarehouses()
      if (result.success && result.data) setWarehouses(result.data)
      else setWarehouses([])
    } finally {
      setLoadingWarehouses(false)
    }
  }, [])

  useEffect(() => {
    fetchTransfers()
  }, [fetchTransfers])

  useEffect(() => {
    if (newOpen && warehouses.length === 0 && !loadingWarehouses) loadWarehouses()
  }, [newOpen, warehouses.length, loadingWarehouses, loadWarehouses])

  const handleApprove = async (id: string, as: 'admin' | 'destination') => {
    setActioningId(id)
    try {
      const result = await approveStockTransfer({ id, as })
      if (result.success) {
        if (result.data?.status === 'approved') {
          toast.success('Traspaso aprobado y stock movido al almacén destino')
        } else if (result.data?.status === 'admin_approved') {
          toast.success('Aprobación de admin registrada. Falta la aprobación de la tienda destino')
        } else if (result.data?.status === 'destination_approved') {
          toast.success('Aprobación de tienda destino registrada. Falta la aprobación de admin')
        }
        fetchTransfers()
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('stock-transfers-updated'))
      } else {
        toast.error(result.error || 'No se pudo aprobar el traspaso')
      }
    } finally {
      setActioningId(null)
    }
  }

  const handleReject = async (id: string) => {
    setActioningId(id)
    try {
      const result = await rejectStockTransfer({ id })
      if (result.success) {
        fetchTransfers()
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('stock-transfers-updated'))
      }
    } finally {
      setActioningId(null)
    }
  }

  const loadMassiveProducts = async () => {
    if (!fromWarehouseId) {
      toast.error('Selecciona almacén origen')
      return
    }
    setLoadingCandidates(true)
    const result = await listTransferCandidates({
      warehouseId: fromWarehouseId,
      category: massiveCategory,
      limit: 1200,
    })
    setLoadingCandidates(false)
    if (!result.success) {
      toast.error(result.error || 'No se pudieron cargar productos')
      return
    }
    const loaded = (result.data || []).map((r: any) => ({
      ...r,
      quantity_requested: Number(r.available) || 0,
      selected: true,
    })) as TransferLine[]
    setLines(loaded)
    if (!loaded.length) toast.warning('No hay productos con stock para ese filtro')
  }

  const loadSearchResults = useCallback(async () => {
    if (!fromWarehouseId) return
    const term = searchTerm.trim()
    if (term.length < 3) {
      setSearchResults([])
      return
    }
    setLoadingSearch(true)
    const result = await searchTransferProducts({
      search: term,
      fromWarehouseId,
      limit: 50,
    })
    setLoadingSearch(false)
    if (!result.success) {
      toast.error(result.error || 'No se pudo buscar')
      return
    }
    setSearchResults(result.data || [])
  }, [fromWarehouseId, searchTerm])

  useEffect(() => {
    if (isMassive) return
    const term = searchTerm.trim()
    if (term.length < 3 || !fromWarehouseId) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(() => { loadSearchResults() }, 350)
    return () => clearTimeout(timer)
  }, [searchTerm, fromWarehouseId, isMassive, loadSearchResults])

  const addManualLine = (row: any) => {
    setLines((prev) => {
      if (prev.some((x) => x.product_variant_id === row.product_variant_id)) return prev
      return [...prev, {
        product_variant_id: row.product_variant_id,
        product_name: row.product_name,
        product_sku: row.product_sku,
        variant_sku: row.variant_sku,
        available: Number(row.available) || 0,
        quantity_requested: 1,
        selected: true,
      }]
    })
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const selectedLines = lines.filter((l) => l.selected && Number(l.quantity_requested) > 0)
  const totalUnits = selectedLines.reduce((acc, l) => acc + Number(l.quantity_requested || 0), 0)

  const resetNewTransfer = () => {
    setFromWarehouseId('')
    setToWarehouseId('')
    setNotes('')
    setIsMassive(false)
    setMassiveCategory('all')
    setSearchTerm('')
    setSearchResults([])
    setLines([])
  }

  const submitNewTransfer = async () => {
    if (!fromWarehouseId || !toWarehouseId) {
      toast.error('Selecciona almacén origen y destino')
      return
    }
    if (fromWarehouseId === toWarehouseId) {
      toast.error('Origen y destino deben ser distintos')
      return
    }
    if (!selectedLines.length) {
      toast.error('Añade al menos una línea de traspaso')
      return
    }
    setSavingTransfer(true)
    const result = await createStockTransfer({
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      notes,
      lines: selectedLines.map((l) => ({
        product_variant_id: l.product_variant_id,
        quantity_requested: Number(l.quantity_requested),
      })),
    })
    setSavingTransfer(false)
    if (!result.success) {
      toast.error(result.error || 'No se pudo crear el traspaso')
      return
    }
    toast.success(`Traspaso ${result.data?.transfer_number || ''} creado correctamente`)
    setNewOpen(false)
    resetNewTransfer()
    fetchTransfers()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('stock-transfers-updated'))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0) }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{statusLabels.all}</SelectItem>
            {Object.entries(statusLabels).filter(([k]) => k !== 'all').map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="gap-1" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo traspaso
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Solicitado por</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : transfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Sin traspasos
                </TableCell>
              </TableRow>
            ) : transfers.map((t: any) => {
              const isOwnRequest = t.requested_by === profile?.id
              const adminDone = !!t.admin_approved_at
              const destDone = !!t.destination_approved_at
              const destStoreId = t.to_warehouse?.store_id ?? null
              const userIsDestStoreMember = destStoreId ? userStoreIds.has(destStoreId) : false
              const canApproveAsAdmin = !isOwnRequest && isAdmin && !adminDone
                && (!destDone || t.destination_approved_by !== profile?.id)
              const canApproveAsDest = !isOwnRequest && userIsDestStoreMember && !destDone
                && (!adminDone || t.admin_approved_by !== profile?.id)
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm">{t.transfer_number}</TableCell>
                  <TableCell>{t.from_warehouse?.name || t.from_warehouse?.code || '-'}</TableCell>
                  <TableCell>{t.to_warehouse?.name || t.to_warehouse?.code || '-'}</TableCell>
                  <TableCell className="text-sm">{t.requested_by_name || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(t.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={t.status === 'requested' ? 'default' : 'secondary'} className="text-xs w-fit">
                        {statusLabels[t.status] || t.status}
                      </Badge>
                      {t.status === 'requested' && (
                        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                          <span className={adminDone ? 'text-green-600' : ''}>
                            {adminDone ? '✓' : '○'} Admin{adminDone && t.admin_approved_by_name ? ` (${t.admin_approved_by_name})` : ''}
                          </span>
                          <span className={destDone ? 'text-green-600' : ''}>
                            {destDone ? '✓' : '○'} Destino{destDone && t.destination_approved_by_name ? ` (${t.destination_approved_by_name})` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {t.delivery_note_id ? (
                        <Link href={`/admin/almacen/albaranes/${t.delivery_note_id}`}>
                          <Button size="sm" variant="outline" className="gap-1">
                            <FileText className="h-3 w-3" /> Ver albarán
                          </Button>
                        </Link>
                      ) : (t.status === 'received' || t.status === 'completed') ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={actioningId !== null}
                          onClick={async () => {
                            setActioningId(t.id)
                            const r = await createDeliveryNoteFromTransfer(t.id)
                            setActioningId(null)
                            if (r.success) {
                              toast.success('Albarán generado')
                              fetchTransfers()
                            } else {
                              toast.error(r.error || 'No se pudo generar el albarán')
                            }
                          }}
                        >
                          <FileText className="h-3 w-3" /> Generar albarán
                        </Button>
                      ) : null}
                      {t.status === 'requested' && (
                        <>
                          {canApproveAsAdmin && (
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1"
                              disabled={actioningId !== null}
                              onClick={() => handleApprove(t.id, 'admin')}
                              title="Aprobar como administrador"
                            >
                              {actioningId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Aprobar (admin)
                            </Button>
                          )}
                          {canApproveAsDest && (
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1"
                              disabled={actioningId !== null}
                              onClick={() => handleApprove(t.id, 'destination')}
                              title="Aprobar como tienda destino"
                            >
                              {actioningId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Aprobar (destino)
                            </Button>
                          )}
                          {(canApproveAsAdmin || canApproveAsDest) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={actioningId !== null}
                              onClick={() => handleReject(t.id)}
                            >
                              {actioningId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                              Rechazar
                            </Button>
                          )}
                          {!canApproveAsAdmin && !canApproveAsDest && (
                            <span className="text-xs text-muted-foreground italic">
                              {isOwnRequest ? 'Traspaso creado por ti' : 'Sin permisos para aprobar'}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} traspasos</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">{page + 1} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={newOpen} onOpenChange={(open) => { setNewOpen(open); if (!open) resetNewTransfer() }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Nuevo traspaso</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Almacén origen</Label>
              <Select value={fromWarehouseId || 'none'} onValueChange={(v) => setFromWarehouseId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingWarehouses ? 'Cargando...' : 'Selecciona almacén'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar</SelectItem>
                  {warehouses.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.storeName})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Almacén destino</Label>
              <Select value={toWarehouseId || 'none'} onValueChange={(v) => setToWarehouseId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona almacén" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar</SelectItem>
                  {warehouses.filter((w: any) => w.id !== fromWarehouseId).map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.storeName})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>

          <div className="flex items-center gap-2 rounded-md border p-2">
            <Checkbox
              checked={isMassive}
              onCheckedChange={(v) => {
                const enabled = Boolean(v)
                setIsMassive(enabled)
                setLines([])
                setSearchResults([])
                setSearchTerm('')
              }}
            />
            <span className="text-sm">Traspaso de temporada / masivo</span>
          </div>

          {isMassive ? (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1 min-w-[220px]">
                  <Label>Categoría</Label>
                  <Select value={massiveCategory} onValueChange={(v) => setMassiveCategory(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="sastreria">Sastrería</SelectItem>
                      <SelectItem value="boutique">Boutique</SelectItem>
                      <SelectItem value="tejidos">Tejidos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={loadMassiveProducts} disabled={loadingCandidates || !fromWarehouseId}>
                  {loadingCandidates ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Cargar productos
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1 min-w-[320px] flex-1">
                  <Label>Buscar producto/variante</Label>
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Nombre, SKU, variante o EAN (mín. 3 caracteres)"
                    disabled={!fromWarehouseId}
                  />
                  <p className="text-xs text-muted-foreground">
                    {!fromWarehouseId
                      ? 'Selecciona un almacén origen para buscar.'
                      : searchTerm.trim().length > 0 && searchTerm.trim().length < 3
                        ? 'Escribe al menos 3 caracteres.'
                        : loadingSearch
                          ? 'Buscando…'
                          : searchTerm.trim().length >= 3 && searchResults.length === 0 && !loadingSearch
                            ? 'Sin resultados con stock en el almacén origen.'
                            : 'Se busca automáticamente mientras escribes.'}
                  </p>
                </div>
              </div>
              {searchResults.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU / EAN</TableHead>
                        <TableHead>Variante</TableHead>
                        <TableHead>Stock por tienda</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.map((r: any) => (
                        <TableRow key={r.product_variant_id}>
                          <TableCell>
                            <div className="font-medium">{r.product_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{r.product_sku}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            <div>{r.variant_sku || '—'}</div>
                            {r.barcode ? <div className="text-muted-foreground">{r.barcode}</div> : null}
                          </TableCell>
                          <TableCell className="text-xs">
                            {[r.size, r.color].filter(Boolean).join(' · ') || '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(r.stocks || []).filter((s: any) => s.available > 0).length === 0 ? (
                                <span className="text-xs text-muted-foreground">Sin stock</span>
                              ) : (
                                (r.stocks || [])
                                  .filter((s: any) => s.available > 0)
                                  .map((s: any) => (
                                    <Badge
                                      key={s.warehouse_id}
                                      variant={s.warehouse_id === fromWarehouseId ? 'default' : 'secondary'}
                                      className="text-[11px] font-normal"
                                    >
                                      {s.warehouse_name}: {s.available}
                                    </Badge>
                                  ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => addManualLine(r)} disabled={!r.available}>Añadir</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={lines.length > 0 && lines.every((l) => l.selected)}
                      onCheckedChange={(v) => setLines((prev) => prev.map((l) => ({ ...l, selected: Boolean(v) })))}
                    />
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Stock origen</TableHead>
                  <TableHead>Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Sin líneas de traspaso
                    </TableCell>
                  </TableRow>
                ) : lines.map((line, idx) => (
                  <TableRow key={line.product_variant_id}>
                    <TableCell>
                      <Checkbox
                        checked={line.selected}
                        onCheckedChange={(v) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, selected: Boolean(v) } : x))}
                      />
                    </TableCell>
                    <TableCell>{line.product_name}</TableCell>
                    <TableCell className="font-mono text-xs">{line.variant_sku || line.product_sku}</TableCell>
                    <TableCell>{line.available}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        max={line.available}
                        value={line.quantity_requested}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          setLines((prev) => prev.map((x, i) => i === idx ? {
                            ...x,
                            quantity_requested: Math.max(0, Math.min(line.available, Number.isFinite(next) ? Math.trunc(next) : 0)),
                          } : x))
                        }}
                        className="h-8 w-24"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="text-sm text-muted-foreground">
            Total de unidades a traspasar: <span className="font-semibold text-foreground">{totalUnits}</span>
          </div>

          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4 mt-2">
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button onClick={submitNewTransfer} disabled={savingTransfer || !fromWarehouseId || !toWarehouseId || selectedLines.length === 0}>
              {savingTransfer ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirmar traspaso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
