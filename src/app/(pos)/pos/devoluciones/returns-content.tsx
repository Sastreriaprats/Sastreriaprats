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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Search, Loader2, ArrowRightLeft, Ticket, ShoppingBag, Barcode, X, Package, Printer, Receipt, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import {
  createReturn,
  processExchange,
  checkCashSessionOpen,
  findSaleByBarcode,
  findSaleByTicketNumber,
  getSaleByIdForReturn,
  searchProductsForPos,
  searchSalesByTicketPrefix,
} from '@/actions/pos'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { generateReturnTicketPdf, printReturnTicketPdf, type ReturnTicketData } from '@/components/pos/return-ticket-pdf'
import { getStorePdfData } from '@/lib/pdf/pdf-company'

interface TicketCandidate {
  id: string
  ticket_number: string
  created_at: string
  total: number
  client_name: string | null
}

type RefundMethod = 'cash' | 'card' | 'bizum' | 'transfer'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum', transfer: 'Transferencia', voucher: 'Vale', mixed: 'Mixto',
}

const todayStr = () => new Date().toISOString().slice(0, 10)

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
  const { activeStoreId, stores } = useAuth()
  const activeStoreName = stores.find((s) => s.storeId === activeStoreId)?.storeName ?? null

  // completedReturn cubre tanto el vale de devolución como el resultado de un cambio.
  // Campos de cambio (exchange): nº de ticket nuevo, vale residual y diferencia cobrada.
  const [completedReturn, setCompletedReturn] = useState<(ReturnTicketData & {
    voucher_code: string | null
    new_ticket_number?: string | null
    residual_code?: string | null
    residual_amount?: number
    diferencia_cobrada?: number
    compra_Y?: number
  }) | null>(null)

  // Sesión de caja abierta de la tienda activa (necesaria para la venta del cambio)
  const [cashSessionId, setCashSessionId] = useState<string | null>(null)
  // Método para cobrar la diferencia cuando lo nuevo cuesta más que lo devuelto
  const [diffMethod, setDiffMethod] = useState<'cash' | 'card' | 'bizum' | 'transfer'>('card')

  const [ticketSearch, setTicketSearch] = useState('')
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [foundSale, setFoundSale] = useState<any>(null)
  const [ticketCandidates, setTicketCandidates] = useState<TicketCandidate[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  const [returnType, setReturnType] = useState<'exchange' | 'voucher' | 'refund'>('voucher')
  const [refundMethod, setRefundMethod] = useState<RefundMethod | null>(null)
  const [returnDate, setReturnDate] = useState(todayStr())
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

  // Autocomplete: al escribir ≥3 caracteres, mostrar tickets coincidentes (debounce 250ms)
  useEffect(() => {
    if (foundSale) return
    const q = ticketSearch.trim()
    if (q.length < 3) { setTicketCandidates([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await searchSalesByTicketPrefix({ prefix: q })
        if (res?.success && Array.isArray(res.data)) setTicketCandidates(res.data)
      } catch { /* ignorar */ }
    }, 250)
    return () => clearTimeout(t)
  }, [ticketSearch, foundSale])

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

  // Cómo se pagó el ticket original (para mostrarlo y preseleccionar el reintegro)
  const salePayments: Array<{ payment_method: string; amount: number }> = (foundSale?.sale_payments ?? [])
    .map((p: any) => ({ payment_method: String(p.payment_method), amount: Number(p.amount ?? 0) }))
  const originalMethods = new Set(salePayments.map((p) => p.payment_method))

  // Al cargar un ticket nuevo: fecha a hoy y método de reintegro = el del pago
  // original (el de mayor importe que no sea vale).
  useEffect(() => {
    if (!foundSale) return
    setReturnDate(todayStr())
    const candidates = (foundSale.sale_payments ?? [])
      .filter((p: any) => ['cash', 'card', 'bizum', 'transfer'].includes(String(p.payment_method)))
      .sort((a: any, b: any) => Number(b.amount ?? 0) - Number(a.amount ?? 0))
    setRefundMethod(candidates.length > 0 ? (String(candidates[0].payment_method) as RefundMethod) : null)
  }, [foundSale])

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

  // Sesión de caja abierta de la tienda (para poder cobrar la venta del cambio)
  useEffect(() => {
    if (!activeStoreId) { setCashSessionId(null); return }
    let cancel = false
    ;(async () => {
      try {
        const res = await checkCashSessionOpen({ storeId: activeStoreId })
        if (!cancel) setCashSessionId(res.success ? (res.data?.sessionId ?? null) : null)
      } catch { if (!cancel) setCashSessionId(null) }
    })()
    return () => { cancel = true }
  }, [activeStoreId])

  const addReplacement = (variant: any) => {
    const existing = replacements.find(r => r.variantId === variant.id)
    if (existing) {
      setReplacements(prev => prev.map(r => r.variantId === variant.id ? { ...r, quantity: r.quantity + 1 } : r))
    } else {
      const taxRate = Number(variant.products?.tax_rate) || 21
      const priceOverride = Number(variant.price_override) || 0
      const priceWithTax = Number(variant.products?.price_with_tax) || 0
      const price = priceOverride || priceWithTax
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

  // Devolución a VALE o REINTEGRO al método de pago (misma RPC, tipo distinto)
  const { execute, isLoading: isProcessing } = useAction(createReturn, {
    successMessage: 'Devolución procesada',
    onSuccess: (data: any) => {
      const storeConfig = getStorePdfData(activeStoreName)
      setCompletedReturn({
        return_type: data?.return_type === 'refund' ? 'refund' : 'voucher',
        refund_method: data?.refund_method ?? null,
        original_ticket_number: data?.original_ticket_number ?? foundSale?.ticket_number ?? null,
        client_name: data?.original_client_name ?? foundSale?.clients?.full_name ?? null,
        total_returned: Number(data?.total_returned ?? selectedTotal ?? 0),
        voucher_code: data?.voucher_code ?? null,
        reason: reason,
        created_at: data?.return_created_at ?? new Date().toISOString(),
        lines: Array.isArray(data?.returned_lines) && data.returned_lines.length > 0
          ? data.returned_lines
          : (foundSale?.sale_lines ?? [])
              .filter((l: any) => selectedLineIds.includes(l.id))
              .map((l: any) => ({
                description: l.description, sku: l.sku, quantity: l.quantity,
                unit_price: Number(l.unit_price ?? 0), line_total: Number(l.line_total ?? 0),
              })),
        storeAddress: storeConfig.address,
        storeSubtitle: storeConfig.subtitle ?? null,
        storePhones: storeConfig.phones,
      })
      if (data?.voucher_code) toast.success(`Código del vale: ${data.voucher_code}`, { duration: 10000 })
      if (data?.return_type === 'refund' && data?.refund_method) {
        toast.success(
          `Devolver ${formatCurrency(Number(data?.total_returned ?? 0))} al cliente en ${(PAYMENT_LABELS[data.refund_method] ?? data.refund_method).toLowerCase()}`,
          { duration: 10000 },
        )
      }
    },
  })

  // CAMBIO directo ATÓMICO (flujo nuevo): una sola llamada, sin caja ni sessionStorage.
  const { execute: executeExchange, isLoading: isExchanging } = useAction(processExchange, {
    successMessage: 'Cambio procesado',
    onSuccess: (data: any) => {
      const storeConfig = getStorePdfData(activeStoreName)
      setCompletedReturn({
        return_type: 'exchange',
        original_ticket_number: data?.original_ticket_number ?? foundSale?.ticket_number ?? null,
        client_name: data?.original_client_name ?? foundSale?.clients?.full_name ?? null,
        total_returned: Number(data?.credito_X ?? selectedTotal ?? 0),
        voucher_code: data?.residual_code ?? null,
        reason: reason,
        created_at: new Date().toISOString(),
        lines: Array.isArray(data?.returned_lines) && data.returned_lines.length > 0
          ? data.returned_lines
          : (foundSale?.sale_lines ?? [])
              .filter((l: any) => selectedLineIds.includes(l.id))
              .map((l: any) => ({
                description: l.description, sku: l.sku, quantity: l.quantity,
                unit_price: Number(l.unit_price ?? 0), line_total: Number(l.line_total ?? 0),
              })),
        storeAddress: storeConfig.address,
        storeSubtitle: storeConfig.subtitle ?? null,
        storePhones: storeConfig.phones,
        new_ticket_number: data?.new_ticket_number ?? null,
        residual_code: data?.residual_code ?? null,
        residual_amount: Number(data?.residual_amount ?? 0),
        diferencia_cobrada: Number(data?.diferencia_cobrada ?? 0),
        compra_Y: Number(data?.compra_Y ?? replacementsTotal ?? 0),
      })
      if (data?.residual_code) toast.success(`Vale generado: ${data.residual_code}`, { duration: 10000 })
    },
  })

  const resetAfterReturn = () => {
    setCompletedReturn(null)
    setFoundSale(null)
    setSelectedLineIds([])
    setReason('')
    setTicketSearch('')
    setBarcodeSearch('')
    setReplacements([])
    setProductQuery('')
    setProductResults([])
    setRefundMethod(null)
    setReturnDate(todayStr())
  }

  const handlePrintReturnTicket = async () => {
    if (!completedReturn) return
    try {
      await printReturnTicketPdf(completedReturn)
    } catch {
      toast.error('Error al imprimir el ticket de devolución')
    }
  }

  const handleDownloadReturnTicket = async () => {
    if (!completedReturn) return
    try {
      await generateReturnTicketPdf(completedReturn)
    } catch {
      toast.error('Error al generar el ticket de devolución')
    }
  }

  const canProcess = () => {
    if (!reason) return false
    if (selectedLineIds.length === 0) return false
    if (returnType === 'exchange') {
      if (replacements.length === 0) return false
      if (!cashSessionId) return false // la venta del cambio necesita caja abierta
    }
    if (returnType === 'refund') {
      if (!refundMethod) return false
      if (!returnDate || returnDate > todayStr()) return false
    }
    if (returnType === 'voucher' && (!returnDate || returnDate > todayStr())) return false
    return true
  }

  // Lanza el flujo correcto según el tipo: vale/reintegro (createReturn) o cambio (processExchange)
  const handleProcess = () => {
    if (!foundSale || !activeStoreId) return
    if (returnType === 'voucher' || returnType === 'refund') {
      execute({
        original_sale_id: foundSale.id,
        return_type: returnType,
        line_ids: selectedLineIds,
        reason,
        store_id: activeStoreId,
        refund_method: returnType === 'refund' ? refundMethod : null,
        return_date: returnDate !== todayStr() ? returnDate : null,
      })
      return
    }
    // Cambio: una sola llamada atómica
    executeExchange({
      original_sale_id: foundSale.id,
      return_line_ids: selectedLineIds,
      new_lines: replacements.map(r => ({
        product_variant_id: r.variantId,
        description: r.description,
        sku: r.sku,
        quantity: r.quantity,
        unit_price: r.unitPrice,
        tax_rate: r.taxRate,
        cost_price: 0,
      })),
      diff_payment: priceDiff > 0.005 ? { payment_method: diffMethod, amount: Math.round(priceDiff * 100) / 100 } : null,
      reason,
      store_id: activeStoreId,
      cash_session_id: cashSessionId!,
    })
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
                  {salePayments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-xs text-muted-foreground">Pagado con:</span>
                      {salePayments.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-xs font-normal">
                          {PAYMENT_LABELS[p.payment_method] ?? p.payment_method} · {formatCurrency(p.amount)}
                        </Badge>
                      ))}
                    </div>
                  )}
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
                      <div className="grid grid-cols-3 gap-3">
                        <Button variant={returnType === 'voucher' ? 'default' : 'outline'} className="h-16 flex-col gap-1"
                          onClick={() => setReturnType('voucher')}>
                          <Ticket className="h-5 w-5" /><span className="text-sm">Vale de compra</span>
                          <span className="text-xs opacity-70">Válido 1 año</span>
                        </Button>
                        <Button variant={returnType === 'refund' ? 'default' : 'outline'} className="h-16 flex-col gap-1"
                          onClick={() => setReturnType('refund')}>
                          <Banknote className="h-5 w-5" /><span className="text-sm">Devolver importe</span>
                          <span className="text-xs opacity-70">Al método de pago</span>
                        </Button>
                        <Button variant={returnType === 'exchange' ? 'default' : 'outline'} className="h-16 flex-col gap-1"
                          onClick={() => setReturnType('exchange')}>
                          <ShoppingBag className="h-5 w-5" /><span className="text-sm">Cambio directo</span>
                          <span className="text-xs opacity-70">Por otro artículo</span>
                        </Button>
                      </div>
                      {returnType === 'exchange' && !cashSessionId && (
                        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
                          No hay una caja abierta en esta tienda. Abre la caja para poder hacer un cambio (la compra nueva se cobra por caja).
                        </p>
                      )}
                    </div>

                    {returnType === 'refund' && (
                      <div className="space-y-2 p-3 border rounded bg-muted/30">
                        <Label className="text-sm font-semibold">Método por el que se devuelve el importe</Label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(['cash', 'card', 'bizum', 'transfer'] as const).map((m) => (
                            <Button key={m} type="button" size="sm"
                              variant={refundMethod === m ? 'default' : 'outline'}
                              className="h-9 text-xs"
                              onClick={() => setRefundMethod(m)}>
                              {PAYMENT_LABELS[m]}{originalMethods.has(m) ? ' ✓' : ''}
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">✓ = método con el que se pagó el ticket original.</p>
                        {refundMethod && !originalMethods.has(refundMethod) && (
                          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
                            El ticket no se pagó por {PAYMENT_LABELS[refundMethod].toLowerCase()}. Asegúrate de que es lo acordado con el cliente.
                          </p>
                        )}
                        {refundMethod === 'cash' && !cashSessionId && returnDate === todayStr() && (
                          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
                            No hay caja abierta en esta tienda: para devolver efectivo hoy hace falta una caja abierta.
                          </p>
                        )}
                      </div>
                    )}

                    {returnType !== 'exchange' && (
                      <div className="space-y-2">
                        <Label>Fecha de la devolución</Label>
                        <Input type="date" value={returnDate} max={todayStr()}
                          onChange={(e) => setReturnDate(e.target.value)} className="w-44" />
                        {returnDate !== todayStr() && returnDate && (
                          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
                            La devolución se registrará con fecha {returnDate.split('-').reverse().join('/')}
                            {returnType === 'refund' && refundMethod === 'cash' ? ' y se ajustará la caja de ese día' : ''}.
                          </p>
                        )}
                      </div>
                    )}

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
                              const priceOverride = Number(v.price_override) || 0
                              const priceWithTax = Number(v.products?.price_with_tax) || 0
                              const price = priceOverride || priceWithTax
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

                            {/* Neto del cambio, en lenguaje del vendedor */}
                            <div className="rounded border bg-white divide-y">
                              <div className="flex justify-between text-sm px-3 py-2">
                                <span className="text-muted-foreground">Se devuelve</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(selectedTotal)}</span>
                              </div>
                              <div className="flex justify-between text-sm px-3 py-2">
                                <span className="text-muted-foreground">Se lleva</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(replacementsTotal)}</span>
                              </div>
                              {priceDiff > 0.005 ? (
                                <div className="px-3 py-2 bg-orange-50">
                                  <div className="flex justify-between text-sm font-bold text-orange-900">
                                    <span>El cliente paga</span>
                                    <span className="tabular-nums">{formatCurrency(priceDiff)}</span>
                                  </div>
                                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                                    {([['cash','Efectivo'],['card','Tarjeta'],['bizum','Bizum'],['transfer','Transf.']] as const).map(([m,label]) => (
                                      <Button key={m} type="button" size="sm"
                                        variant={diffMethod === m ? 'default' : 'outline'}
                                        className="h-8 text-xs"
                                        onClick={() => setDiffMethod(m)}>
                                        {label}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              ) : priceDiff < -0.005 ? (
                                <div className="flex justify-between text-sm font-bold px-3 py-2 bg-green-50 text-green-900">
                                  <span>Se generará un vale de</span>
                                  <span className="tabular-nums">{formatCurrency(Math.abs(priceDiff))}</span>
                                </div>
                              ) : (
                                <div className="flex justify-between text-sm font-bold px-3 py-2 bg-muted">
                                  <span>Sin diferencia a cobrar</span>
                                  <span className="tabular-nums">{formatCurrency(0)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Motivo *</Label>
                      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la devolución..." rows={2} />
                    </div>

                    <Button onClick={handleProcess}
                      disabled={isProcessing || isExchanging || !canProcess()}
                      className="w-full h-12 bg-prats-navy hover:bg-prats-navy-light">
                      {(isProcessing || isExchanging) ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRightLeft className="mr-2 h-5 w-5" />}
                      {returnType === 'voucher' ? 'Generar vale de devolución'
                        : returnType === 'refund' ? `Devolver ${formatCurrency(selectedTotal)}${refundMethod ? ` en ${PAYMENT_LABELS[refundMethod].toLowerCase()}` : ''}`
                        : 'Procesar cambio'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={!!completedReturn} onOpenChange={(open) => { if (!open) resetAfterReturn() }}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-green-600" />
              {completedReturn?.return_type === 'voucher' ? 'Vale de devolución generado'
                : completedReturn?.return_type === 'refund' ? 'Devolución de importe registrada'
                : 'Cambio realizado'}
            </DialogTitle>
          </DialogHeader>
          {completedReturn && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ticket origen</p>
                <p className="text-lg font-mono font-bold text-slate-900 mt-0.5">{completedReturn.original_ticket_number ?? '—'}</p>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                {completedReturn.return_type === 'exchange' && completedReturn.new_ticket_number && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <dt className="text-slate-600">Ticket del cambio</dt>
                    <dd className="font-mono font-semibold">{completedReturn.new_ticket_number}</dd>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <dt className="text-slate-600">{completedReturn.return_type === 'exchange' ? 'Se devolvió' : 'Total devuelto'}</dt>
                  <dd className="font-semibold tabular-nums">{formatCurrency(completedReturn.total_returned)}</dd>
                </div>
                {completedReturn.return_type === 'exchange' && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <dt className="text-slate-600">Se llevó</dt>
                    <dd className="font-semibold tabular-nums">{formatCurrency(completedReturn.compra_Y ?? 0)}</dd>
                  </div>
                )}
                {completedReturn.return_type === 'exchange' && (completedReturn.diferencia_cobrada ?? 0) > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <dt className="text-slate-600">Diferencia cobrada</dt>
                    <dd className="font-semibold tabular-nums text-orange-700">{formatCurrency(completedReturn.diferencia_cobrada ?? 0)}</dd>
                  </div>
                )}
                {completedReturn.return_type === 'refund' && completedReturn.refund_method && (
                  <div className="flex flex-col gap-1 py-2 rounded bg-blue-50 border border-blue-200 px-3">
                    <dt className="text-xs text-blue-800 uppercase tracking-wide font-medium">Devolver al cliente</dt>
                    <dd className="font-bold text-lg text-blue-900">
                      {formatCurrency(completedReturn.total_returned)} en {(PAYMENT_LABELS[completedReturn.refund_method] ?? completedReturn.refund_method).toLowerCase()}
                    </dd>
                  </div>
                )}
                {completedReturn.client_name && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <dt className="text-slate-600">Cliente</dt>
                    <dd className="text-slate-800">{completedReturn.client_name}</dd>
                  </div>
                )}
                {completedReturn.voucher_code && (
                  <div className="flex flex-col gap-1 py-2 rounded bg-green-50 border border-green-200 px-3">
                    <dt className="text-xs text-green-800 uppercase tracking-wide font-medium">
                      {completedReturn.return_type === 'exchange'
                        ? `Vale generado${(completedReturn.residual_amount ?? 0) > 0 ? ` (${formatCurrency(completedReturn.residual_amount ?? 0)})` : ''}`
                        : 'Código del vale'}
                    </dt>
                    <dd className="font-mono font-bold text-lg text-green-900">{completedReturn.voucher_code}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2 sm:flex-row border-t pt-4">
            <Button className="flex-1 min-w-[140px] gap-2 bg-prats-gold hover:bg-prats-gold/90 text-prats-navy font-semibold" onClick={handlePrintReturnTicket}>
              <Printer className="h-4 w-4" />
              Imprimir ticket
            </Button>
            <Button variant="outline" className="flex-1 min-w-[140px] gap-2" onClick={handleDownloadReturnTicket}>
              <Receipt className="h-4 w-4" />
              Descargar PDF
            </Button>
            <Button className="flex-1 min-w-[140px] bg-prats-navy hover:bg-prats-navy-light" onClick={resetAfterReturn}>
              Nueva devolución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
