'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Search, Loader2, ArrowRightLeft, Ticket, ShoppingBag, Barcode, X, Package } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import {
  createReturn,
  findSaleByBarcode,
  findSaleByTicketNumber,
  getSaleByIdForReturn,
  searchProductsForPos,
} from '@/actions/pos'
import { formatCurrency, formatDateTime } from '@/lib/utils'

interface TicketCandidate {
  id: string
  ticket_number: string
  created_at: string
  total: number
  client_name: string | null
}

interface ReplacementItem {
  variantId: string
  description: string
  sku: string
  unitPrice: number
  quantity: number
  taxRate: number
  imageUrl?: string
}

export function ReturnsContent() {
  const router = useRouter()
  const { activeStoreId } = useAuth()

  const [ticketSearch, setTicketSearch] = useState('')
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [foundSale, setFoundSale] = useState<any>(null)
  const [ticketCandidates, setTicketCandidates] = useState<TicketCandidate[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  const [returnType, setReturnType] = useState<'exchange' | 'voucher'>('voucher')
  const [reason, setReason] = useState('')
  const barcodeBufferRef = useRef({ digits: '', firstAt: 0 })
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Buscador de producto de reemplazo para Cambio Directo
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<any[]>([])
  const [isProductSearching, setIsProductSearching] = useState(false)
  const [replacements, setReplacements] = useState<ReplacementItem[]>([])

  const searchSaleByBarcode = useCallback(async (barcode?: string) => {
    const code = (barcode ?? barcodeSearch).trim()
    if (!code) return
    setIsSearching(true)
    setBarcodeSearch('')
    try {
      const result = await findSaleByBarcode({ barcode: code, storeId: activeStoreId ?? undefined })
      if (!result?.success && result && 'error' in result) {
        toast.error(result.error ?? 'Error al buscar')
        return
      }
      if (result?.data && 'sale' in result.data && result.data.sale) {
        setFoundSale(result.data.sale)
        setTicketCandidates([])
        setSelectedLineIds([])
        setTicketSearch(result.data.sale.ticket_number ?? '')
        toast.success(`Ticket ${result.data.sale.ticket_number} encontrado por código de barras`)
      } else {
        toast.error('No se encontró ninguna venta con ese código de barras')
      }
    } catch {
      toast.error('Error al buscar por código de barras')
    } finally {
      setIsSearching(false)
      barcodeInputRef.current?.focus()
    }
  }, [activeStoreId, barcodeSearch])

  // Escáner EAN-13
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const { digits, firstAt } = barcodeBufferRef.current
        const elapsed = Date.now() - firstAt
        if (digits.length === 13 && elapsed < 200) {
          e.preventDefault()
          e.stopPropagation()
          barcodeBufferRef.current = { digits: '', firstAt: 0 }
          searchSaleByBarcode(digits)
          return
        }
        barcodeBufferRef.current = { digits: '', firstAt: 0 }
        return
      }
      if (e.key.length === 1 && e.key >= '0' && e.key <= '9') {
        const now = Date.now()
        if (barcodeBufferRef.current.digits.length === 0) barcodeBufferRef.current.firstAt = now
        barcodeBufferRef.current.digits += e.key
        if (barcodeBufferRef.current.digits.length > 13) barcodeBufferRef.current.digits = barcodeBufferRef.current.digits.slice(-13)
      } else {
        barcodeBufferRef.current = { digits: '', firstAt: 0 }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeStoreId, searchSaleByBarcode])

  const searchSale = async () => {
    const search = ticketSearch.trim()
    if (!search) return
    setIsSearching(true)
    setTicketCandidates([])
    try {
      const result = await findSaleByTicketNumber({ ticketNumber: search })
      if (!result?.success && result && 'error' in result) {
        toast.error(result.error ?? 'Error al buscar el ticket')
        return
      }
      const data = result?.data as any
      if (!data) {
        toast.error('Ticket no encontrado o ya devuelto')
        return
      }
      if ('sale' in data && data.sale) {
        setFoundSale(data.sale)
        setSelectedLineIds([])
      } else if ('matches' in data && Array.isArray(data.matches)) {
        setTicketCandidates(data.matches)
        setFoundSale(null)
        if (data.matches.length === 0) toast.error('Sin coincidencias')
      } else {
        toast.error('Ticket no encontrado')
      }
    } catch {
      toast.error('Error al buscar el ticket')
    } finally {
      setIsSearching(false)
    }
  }

  const selectCandidate = async (candidateId: string) => {
    setIsSearching(true)
    try {
      const result = await getSaleByIdForReturn({ saleId: candidateId })
      if (result?.success && result.data && 'sale' in result.data && result.data.sale) {
        setFoundSale(result.data.sale)
        setTicketCandidates([])
        setSelectedLineIds([])
        setTicketSearch(result.data.sale.ticket_number ?? '')
      } else {
        toast.error('No se pudo cargar el ticket seleccionado')
      }
    } finally {
      setIsSearching(false)
    }
  }

  const toggleLine = (lineId: string) => {
    setSelectedLineIds(prev => prev.includes(lineId) ? prev.filter(id => id !== lineId) : [...prev, lineId])
  }

  const selectedTotal = foundSale?.sale_lines
    ?.filter((l: any) => selectedLineIds.includes(l.id))
    ?.reduce((sum: number, l: any) => sum + l.line_total, 0) || 0

  // Búsqueda en vivo de productos para el cambio directo (debounce 300ms)
  useEffect(() => {
    if (returnType !== 'exchange') return
    if (productQuery.trim().length < 2 || !activeStoreId) {
      setProductResults([])
      return
    }
    const t = setTimeout(async () => {
      setIsProductSearching(true)
      try {
        const res = await searchProductsForPos({ query: productQuery.trim(), storeId: activeStoreId })
        if (res.success) setProductResults(res.data ?? [])
      } catch {
        setProductResults([])
      } finally {
        setIsProductSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [productQuery, activeStoreId, returnType])

  const addReplacement = (variant: any) => {
    const existing = replacements.find(r => r.variantId === variant.id)
    if (existing) {
      setReplacements(prev => prev.map(r => r.variantId === variant.id ? { ...r, quantity: r.quantity + 1 } : r))
    } else {
      const taxRate = Number(variant.products?.tax_rate) || 21
      const priceOverride = Number(variant.price_override) || 0
      const priceWithTax = Number(variant.products?.price_with_tax) || 0
      const basePrice = Number(variant.products?.base_price) || 0
      const price = priceOverride || priceWithTax || (basePrice ? basePrice * (1 + taxRate / 100) : 0)
      setReplacements(prev => [...prev, {
        variantId: variant.id,
        description: `${variant.products.name}${variant.size ? ` T.${variant.size}` : ''}${variant.color ? ` ${variant.color}` : ''}`,
        sku: variant.variant_sku,
        unitPrice: price,
        quantity: 1,
        taxRate,
        imageUrl: variant.products?.main_image_url,
      }])
    }
    setProductQuery('')
    setProductResults([])
  }

  const updateReplacementQty = (variantId: string, qty: number) => {
    if (qty <= 0) {
      setReplacements(prev => prev.filter(r => r.variantId !== variantId))
    } else {
      setReplacements(prev => prev.map(r => r.variantId === variantId ? { ...r, quantity: qty } : r))
    }
  }

  const removeReplacement = (variantId: string) => {
    setReplacements(prev => prev.filter(r => r.variantId !== variantId))
  }

  const replacementsTotal = replacements.reduce((sum, r) => sum + r.unitPrice * r.quantity, 0)
  const priceDiff = replacementsTotal - selectedTotal // positivo = cliente paga; negativo = se devuelve saldo

  const { execute, isLoading: isProcessing } = useAction(createReturn, {
    successMessage: returnType === 'voucher' ? 'Vale de devolución generado' : 'Devolución registrada',
    onSuccess: (data: any) => {
      if (returnType === 'voucher') {
        if (data.voucher_code) toast.success(`Código del vale: ${data.voucher_code}`, { duration: 10000 })
        setFoundSale(null); setSelectedLineIds([]); setReason(''); setTicketSearch(''); setBarcodeSearch('')
        return
      }
      // Cambio directo: guardar reemplazos + crédito en sessionStorage y llevar a caja
      try {
        const payload = {
          created_at: Date.now(),
          origin_ticket: foundSale?.ticket_number ?? null,
          return_id: data?.return_id ?? null,
          credit: selectedTotal,
          items: replacements.map(r => ({
            variant_id: r.variantId,
            description: r.description,
            sku: r.sku,
            unit_price: r.unitPrice,
            quantity: r.quantity,
            tax_rate: r.taxRate,
            image_url: r.imageUrl ?? null,
          })),
        }
        sessionStorage.setItem('pos_pending_exchange', JSON.stringify(payload))
        toast.success('Redirigiendo a caja para completar el cambio…')
        router.push('/pos/caja')
      } catch {
        toast.error('No se pudo redirigir a caja. Añade el artículo manualmente.')
      }
    },
  })

  const canProcess = () => {
    if (!reason) return false
    if (selectedLineIds.length === 0) return false
    if (returnType === 'exchange' && replacements.length === 0) return false
    return true
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 p-4 border-b bg-white">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Devoluciones</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Buscar ticket original</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Nº ticket (parcial, ej: 0005 o tick-2026-5)"
                    className="pl-9"
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchSale()}
                  />
                </div>
                <Button onClick={searchSale} disabled={isSearching || !ticketSearch.trim()}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </Button>
              </div>

              {ticketCandidates.length > 0 && (
                <div className="border rounded divide-y bg-white">
                  <p className="px-3 py-2 text-xs text-muted-foreground bg-muted">
                    {ticketCandidates.length} tickets coinciden — selecciona uno:
                  </p>
                  {ticketCandidates.map((c) => (
                    <button
                      key={c.id}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted text-left"
                      onClick={() => selectCandidate(c.id)}
                    >
                      <div>
                        <p className="font-mono text-sm font-medium">{c.ticket_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(c.created_at)}
                          {c.client_name ? ` · ${c.client_name}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-semibold">{formatCurrency(c.total)}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="relative border-t pt-4">
                <p className="text-xs text-muted-foreground mb-2">O escanee el código de barras del artículo a devolver</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={barcodeInputRef}
                      placeholder="Escanee o escriba código de barras (EAN-13)"
                      className="pl-9"
                      value={barcodeSearch}
                      onChange={(e) => setBarcodeSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchSaleByBarcode()}
                    />
                  </div>
                  <Button onClick={() => searchSaleByBarcode()} disabled={isSearching || !barcodeSearch.trim()} variant="outline">
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {foundSale && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-mono">{foundSale.ticket_number}</CardTitle>
                    <span className="text-sm text-muted-foreground">{formatDateTime(foundSale.created_at)}</span>
                  </div>
                  {foundSale.clients && <p className="text-sm text-muted-foreground">Cliente: {foundSale.clients.full_name}</p>}
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-semibold mb-3">Selecciona los artículos a devolver:</p>
                  <div className="space-y-2">
                    {foundSale.sale_lines.map((line: any) => {
                      const alreadyReturned = line.quantity_returned > 0
                      return (
                        <div key={line.id} className={`flex items-center gap-3 p-2 rounded border ${alreadyReturned ? 'opacity-40' : ''}`}>
                          <Checkbox checked={selectedLineIds.includes(line.id)} onCheckedChange={() => !alreadyReturned && toggleLine(line.id)} disabled={alreadyReturned} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{line.description}</p>
                            <p className="text-xs text-muted-foreground">Cant: {line.quantity} &times; {formatCurrency(line.unit_price)}</p>
                          </div>
                          <span className="font-medium text-sm">{formatCurrency(line.line_total)}</span>
                          {alreadyReturned && <Badge variant="destructive" className="text-xs">Ya devuelto</Badge>}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {selectedLineIds.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Procesar devolución</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between text-lg font-bold p-3 bg-muted rounded">
                      <span>Total a devolver</span>
                      <span>{formatCurrency(selectedTotal)}</span>
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de devolución</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant={returnType === 'voucher' ? 'default' : 'outline'} className="h-16 flex-col gap-1"
                          onClick={() => setReturnType('voucher')}>
                          <Ticket className="h-5 w-5" /><span className="text-sm">Vale de compra</span>
                          <span className="text-xs opacity-70">Válido 1 año</span>
                        </Button>
                        <Button variant={returnType === 'exchange' ? 'default' : 'outline'} className="h-16 flex-col gap-1"
                          onClick={() => setReturnType('exchange')}>
                          <ShoppingBag className="h-5 w-5" /><span className="text-sm">Cambio directo</span>
                          <span className="text-xs opacity-70">Por otro artículo</span>
                        </Button>
                      </div>
                    </div>

                    {returnType === 'exchange' && (
                      <div className="space-y-3 p-3 border rounded bg-muted/30">
                        <Label className="text-sm font-semibold">Artículo(s) de reemplazo</Label>

                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Buscar por nombre, SKU, código de barras, marca…"
                            className="pl-9"
                            value={productQuery}
                            onChange={(e) => setProductQuery(e.target.value)}
                          />
                          {isProductSearching && (
                            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                          )}
                        </div>

                        {productResults.length > 0 && (
                          <div className="border rounded divide-y bg-white max-h-64 overflow-y-auto">
                            {productResults.map((v: any) => {
                              const taxRate = Number(v.products?.tax_rate) || 21
                              const priceOverride = Number(v.price_override) || 0
                              const priceWithTax = Number(v.products?.price_with_tax) || 0
                              const basePrice = Number(v.products?.base_price) || 0
                              const price = priceOverride || priceWithTax || (basePrice ? basePrice * (1 + taxRate / 100) : 0)
                              const stock = Array.isArray(v.stock_levels) ? (v.stock_levels[0]?.available ?? 0) : 0
                              return (
                                <button
                                  key={v.id}
                                  className="w-full flex items-center gap-3 p-2 hover:bg-muted text-left"
                                  onClick={() => addReplacement(v)}
                                  disabled={stock <= 0}
                                >
                                  <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {v.products?.name}
                                      {v.size ? ` · T.${v.size}` : ''}
                                      {v.color ? ` · ${v.color}` : ''}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {v.variant_sku} · Stock: {stock}
                                    </p>
                                  </div>
                                  <span className="text-sm font-semibold">{formatCurrency(price)}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {replacements.length > 0 && (
                          <div className="space-y-2">
                            {replacements.map((r) => (
                              <div key={r.variantId} className="flex items-center gap-2 p-2 bg-white rounded border">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{r.description}</p>
                                  <p className="text-xs text-muted-foreground">{r.sku}</p>
                                </div>
                                <Input
                                  type="number" min={1} value={r.quantity}
                                  onChange={(e) => updateReplacementQty(r.variantId, parseInt(e.target.value) || 0)}
                                  className="w-16 h-8 text-center"
                                />
                                <span className="text-sm font-semibold w-20 text-right">
                                  {formatCurrency(r.unitPrice * r.quantity)}
                                </span>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeReplacement(r.variantId)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}

                            <div className="flex justify-between text-sm pt-2 border-t">
                              <span>Total reemplazo</span>
                              <span className="font-semibold">{formatCurrency(replacementsTotal)}</span>
                            </div>
                            <div className={`flex justify-between text-sm font-bold p-2 rounded ${priceDiff > 0 ? 'bg-orange-100 text-orange-900' : priceDiff < 0 ? 'bg-green-100 text-green-900' : 'bg-muted'}`}>
                              <span>
                                {priceDiff > 0 ? 'Diferencia a cobrar' : priceDiff < 0 ? 'Saldo a favor del cliente' : 'Sin diferencia'}
                              </span>
                              <span>{formatCurrency(Math.abs(priceDiff))}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Motivo *</Label>
                      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la devolución..." rows={2} />
                    </div>

                    <Button onClick={() => execute({
                      original_sale_id: foundSale.id, return_type: returnType,
                      line_ids: selectedLineIds, reason, store_id: activeStoreId!,
                    })} disabled={isProcessing || !canProcess()} className="w-full h-12 bg-prats-navy hover:bg-prats-navy-light">
                      {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRightLeft className="mr-2 h-5 w-5" />}
                      {returnType === 'voucher' ? 'Generar vale de devolución' : 'Procesar cambio'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
