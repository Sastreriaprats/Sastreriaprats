'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Search, X, Plus, Minus, Trash2, User, ShoppingBag, CreditCard,
  Banknote, Smartphone, ArrowRightLeft, Receipt, FileText,
  LogOut, Clock, BarChart3, Loader2, Percent, UserPlus, CalendarClock, AlertCircle, Lock, Check, ImageOff, ChevronLeft, Printer,
  Bookmark, Gift,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import { searchProductsForPos, createSale, cashWithdrawal, listPosEmployees, validateDiscountCode, getPhysicalStoresForCaja } from '@/actions/pos'
import { addOrderPayment, addSalePayment, getClientPendingDebt } from '@/actions/payments'
import { getProductByBarcode } from '@/actions/products'
import { listClients } from '@/actions/clients'
import { CreateClientDialog } from '@/app/(admin)/admin/clientes/create-client-dialog'
import { formatCurrency } from '@/lib/utils'
import { generateTicketPdf, printTicketPdf, printGiftTicketPdf } from '@/components/pos/ticket-pdf'
import { getStorePdfData } from '@/lib/pdf/pdf-company'
import { createInvoiceFromSaleAction, generateInvoicePdfAction } from '@/actions/accounting'
import { getActiveReservationsForVariant } from '@/actions/reservations'
import { ReservationDialog } from './reservation-dialog'

interface TicketLine {
  id: string
  product_variant_id: string | null
  description: string
  sku: string
  quantity: number
  unit_price: number
  discount_percentage: number
  tax_rate: number
  cost_price: number
  original_price?: number
  image_url?: string
  /** Stock disponible para esta variante (para limitar cantidad) */
  available_stock?: number
  /** Si la línea es un cobro de un pedido/venta pendiente, se registra el pago en onSuccess. */
  cobro_ref?: { entity_type: 'tailoring_order' | 'sale'; entity_id: string }
  /** Si la línea corresponde a la recogida de una reserva, su id. */
  reservation_id?: string | null
  /** Línea específica de la reserva que se recoge. */
  reservation_line_id?: string | null
  /** Número legible de la reserva (p.ej. RSV-2026-0003) para mostrar badge. */
  reservation_number?: string | null
  /** Total de la reserva (solo informativo, para desglosar en ticket). */
  reservation_total?: number
  /** Importe ya pagado previamente en la reserva (no entra en caja hoy). */
  reservation_already_paid?: number
}

interface Payment {
  payment_method: 'cash' | 'card' | 'bizum' | 'transfer' | 'voucher'
  amount: number
  reference?: string
  voucher_id?: string
  next_payment_date?: string | null
}

export function PosSaleScreen({ session, onCloseCash, initialCobro, onSwitchStore }: { session: any; onCloseCash: () => void; initialCobro?: { entity_type: 'tailoring_order' | 'sale'; entity_id: string; amount: number; client_id: string; client_name: string; reference: string } | null; onSwitchStore?: (storeId: string) => void }) {
  const router = useRouter()
  const { profile, activeStoreId, stores, isAdmin } = useAuth()
  const [adminStores, setAdminStores] = useState<Array<{ storeId: string; storeName: string }>>([])
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    getPhysicalStoresForCaja()
      .then((r) => {
        if (cancelled) return
        if (r?.success && r.data) setAdminStores(r.data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isAdmin])
  const activeStoreName = (isAdmin ? adminStores : stores).find((s) => s.storeId === activeStoreId)?.storeName
    ?? stores.find((s) => s.storeId === activeStoreId)?.storeName
    ?? 'Caja'
  const searchRef = useRef<HTMLInputElement>(null)
  const barcodeBufferRef = useRef({ digits: '', firstAt: 0 })
  const scannerInputRef = useRef<HTMLInputElement>(null)
  const appliedCobroRef = useRef(false)
  const appliedExchangeRef = useRef(false)
  const lastCobroLinesRef = useRef<Array<{ entity_type: 'tailoring_order' | 'sale'; entity_id: string; amount: number }>>([])
  const cobroPaymentMethodRef = useRef<'cash' | 'card' | 'bizum' | 'transfer' | 'voucher'>('cash')
  const integroSubmitRef = useRef(false)

  const [ticketLines, setTicketLines] = useState<TicketLine[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedClientName, setSelectedClientName] = useState('')
  const [saleType, setSaleType] = useState<string>('boutique')
  const [globalDiscount, setGlobalDiscount] = useState(0)
  const [discountCodeInput, setDiscountCodeInput] = useState('')
  const [discountCodeApplied, setDiscountCodeApplied] = useState<string | null>(null)
  const [discountCodeLoading, setDiscountCodeLoading] = useState(false)
  const [isTaxFree, setIsTaxFree] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showWithdrawal, setShowWithdrawal] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [completedSale, setCompletedSale] = useState<any | null>(null)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [saleWithoutClient, setSaleWithoutClient] = useState(false)
  const [showClientDialog, setShowClientDialog] = useState(false)
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [clientSearchResults, setClientSearchResults] = useState<any[]>([])
  const [clientSearching, setClientSearching] = useState(false)
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const [leaveAsPending, setLeaveAsPending] = useState(false)
  const [nextPaymentDate, setNextPaymentDate] = useState('')
  const [wantPartialPayment, setWantPartialPayment] = useState(false)
  const [downloadingInvoice, setDownloadingInvoice] = useState(false)
  const [clientPendingDebt, setClientPendingDebt] = useState<Array<{ entity_type: 'tailoring_order' | 'sale'; entity_id: string; reference: string; total_pending: number }>>([])
  const [clientDebtLoading, setClientDebtLoading] = useState(false)
  const [showCloseReminderDialog, setShowCloseReminderDialog] = useState(false)
  const [paymentTab, setPaymentTab] = useState<'integro' | 'mixto' | 'parcial'>('integro')
  const [paymentStep, setPaymentStep] = useState<'salesperson' | 'choose_type' | 'details'>('salesperson')
  const [posEmployees, setPosEmployees] = useState<Array<{ id: string; full_name: string }>>([])
  const [posEmployeesLoading, setPosEmployeesLoading] = useState(false)
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string | null>(null)
  const [lastSaleSalespersonName, setLastSaleSalespersonName] = useState<string | null>(null)
  const [showReservationDialog, setShowReservationDialog] = useState(false)
  const [reservedVariantsForClient, setReservedVariantsForClient] = useState<Record<string, number>>({})

  // Totales de sesión para la cabecera
  const [sessionTotals, setSessionTotals] = useState({
    total_sales: 0,
    total_cash_sales: 0,
    total_card_sales: 0,
    total_bizum_sales: 0,
    total_transfer_sales: 0,
  })
  const lastPaymentsRef = useRef<Payment[]>([])

  useEffect(() => {
    if (!session) return
    setSessionTotals({
      total_sales: Number(session.total_sales) || 0,
      total_cash_sales: Number(session.total_cash_sales) || 0,
      total_card_sales: Number(session.total_card_sales) || 0,
      total_bizum_sales: Number(session.total_bizum_sales) || 0,
      total_transfer_sales: Number(session.total_transfer_sales) || 0,
    })
  }, [session?.id])

  useEffect(() => {
    if (searchQuery.length < 2 || !activeStoreId) { setSearchResults([]); return }
    const timeout = setTimeout(async () => {
      setIsSearching(true)
      try {
        const result = await searchProductsForPos({ query: searchQuery.trim(), storeId: activeStoreId })
        if (result.success) setSearchResults(result.data ?? [])
      } catch (e) {
        console.error('[TPV search]', e)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 200)
    return () => clearTimeout(timeout)
  }, [searchQuery, activeStoreId])

  // Escáner de códigos de barras: secuencia rápida de dígitos + Enter → búsqueda por EAN-13
  // Listener GLOBAL en document para capturar la pistola sin importar el foco
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // No interceptar si el usuario está escribiendo en un input/textarea normal
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.id !== 'pos-barcode-scanner'

      if (e.key === 'Enter') {
        const { digits, firstAt } = barcodeBufferRef.current
        const elapsed = Date.now() - firstAt
        // Pistola: 8-13 dígitos en menos de 300ms (humano no puede)
        if (digits.length >= 8 && digits.length <= 13 && elapsed < 300) {
          e.preventDefault()
          e.stopPropagation()
          const captured = digits
          barcodeBufferRef.current = { digits: '', firstAt: 0 }
          getProductByBarcode({ barcode: captured, storeId: activeStoreId ?? undefined }).then((result) => {
            if (result.success && result.data && result.data.variant) {
              addToTicket(result.data.variant)
              const v = result.data.variant as any
              const name = v.products?.name || v.product_name || 'Producto'
              const size = v.size ? ` · Talla ${v.size}` : ''
              toast.success(`✓ ${name}${size}`)
              scannerInputRef.current?.focus()
            } else {
              toast.error(`Código no encontrado: ${captured}`)
            }
          }).catch(() => toast.error('Producto no encontrado'))
          return
        }
        barcodeBufferRef.current = { digits: '', firstAt: 0 }
        return
      }

      // Solo capturar dígitos
      if (e.key.length === 1 && e.key >= '0' && e.key <= '9') {
        const now = Date.now()
        // Si han pasado más de 300ms desde el último dígito, reiniciar (no es la pistola)
        if (barcodeBufferRef.current.digits.length > 0 && now - barcodeBufferRef.current.firstAt > 300) {
          barcodeBufferRef.current = { digits: '', firstAt: 0 }
        }
        if (barcodeBufferRef.current.digits.length === 0) barcodeBufferRef.current.firstAt = now
        // Si el usuario está escribiendo en un input normal, no interceptar
        if (isTyping) return
        barcodeBufferRef.current.digits += e.key
        if (barcodeBufferRef.current.digits.length > 13) barcodeBufferRef.current.digits = barcodeBufferRef.current.digits.slice(-13)
      } else if (e.key.length === 1) {
        // Cualquier otra tecla rompe la secuencia
        barcodeBufferRef.current = { digits: '', firstAt: 0 }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeStoreId])

  // Pre-cargar cobro pendiente desde /sastre/cobros → /pos/caja?cobro=...
  useEffect(() => {
    if (!initialCobro || appliedCobroRef.current) return
    appliedCobroRef.current = true
    if (initialCobro.client_id) {
      setSelectedClientId(initialCobro.client_id)
      setSelectedClientName(initialCobro.client_name)
    }
    setTicketLines([{
      id: crypto.randomUUID(),
      product_variant_id: null,
      description: `Cobro pendiente - ${initialCobro.reference}`,
      sku: '',
      quantity: 1,
      unit_price: initialCobro.amount,
      discount_percentage: 0,
      tax_rate: 0,
      cost_price: 0,
      cobro_ref: { entity_type: initialCobro.entity_type, entity_id: initialCobro.entity_id },
    }])
    setSaleType(initialCobro.entity_type === 'tailoring_order' ? 'tailoring_final' : 'boutique')
    router.replace('/pos/caja')
  }, [initialCobro, router])

  // Pre-carga desde "Cambio directo" (devoluciones): lee sessionStorage 'pos_pending_exchange'
  // y añade los artículos de reemplazo + una línea de crédito negativa por el importe devuelto.
  useEffect(() => {
    if (appliedExchangeRef.current) return
    if (typeof window === 'undefined') return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('pos_pending_exchange') } catch { return }
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as {
        created_at: number
        origin_ticket: string | null
        return_id: string | null
        credit: number
        items: Array<{ variant_id: string; description: string; sku: string; unit_price: number; quantity: number; tax_rate: number; image_url: string | null }>
      }
      // Caducar si tiene más de 15 minutos
      if (!payload || Date.now() - (payload.created_at ?? 0) > 15 * 60 * 1000) {
        sessionStorage.removeItem('pos_pending_exchange')
        return
      }
      if (!Array.isArray(payload.items) || payload.items.length === 0) return

      appliedExchangeRef.current = true
      const newLines: TicketLine[] = payload.items.map((it) => ({
        id: crypto.randomUUID(),
        product_variant_id: it.variant_id,
        description: it.description,
        sku: it.sku,
        quantity: it.quantity,
        unit_price: it.unit_price,
        original_price: it.unit_price,
        discount_percentage: 0,
        tax_rate: it.tax_rate ?? 21,
        cost_price: 0,
        image_url: it.image_url ?? undefined,
      }))
      if (payload.credit > 0) {
        newLines.push({
          id: crypto.randomUUID(),
          product_variant_id: null,
          description: `Crédito por devolución${payload.origin_ticket ? ` (${payload.origin_ticket})` : ''}`,
          sku: '',
          quantity: 1,
          unit_price: -payload.credit,
          discount_percentage: 0,
          tax_rate: 0,
          cost_price: 0,
        })
      }
      setTicketLines(newLines)
      sessionStorage.removeItem('pos_pending_exchange')
      toast.success(`Cambio cargado${payload.origin_ticket ? ` — ticket ${payload.origin_ticket}` : ''}`)
    } catch {
      try { sessionStorage.removeItem('pos_pending_exchange') } catch { /* ignore */ }
    }
  }, [])

  // Búsqueda de clientes para asignar a la venta
  useEffect(() => {
    if (clientSearchQuery.length < 2) { setClientSearchResults([]); return }
    const t = setTimeout(async () => {
      setClientSearching(true)
      try {
        const res = await listClients({ search: clientSearchQuery, pageSize: 20 })
        if (res.success && res.data) setClientSearchResults(res.data.data ?? [])
      } catch (e) {
        console.error('[POS client search]', e)
        setClientSearchResults([])
      } finally {
        setClientSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearchQuery])

  // Pendiente de cobro del cliente seleccionado (aviso en caja, no bloquea la venta)
  useEffect(() => {
    if (!selectedClientId) {
      setClientPendingDebt([])
      return
    }
    let cancelled = false
    setClientDebtLoading(true)
    getClientPendingDebt({ client_id: selectedClientId })
      .then((result) => {
        if (cancelled) return
        if (result.success && result.data && result.data.length > 0) {
          setClientPendingDebt(result.data.map((r) => ({
            entity_type: r.entity_type,
            entity_id: r.id,
            reference: r.reference,
            total_pending: r.total_pending,
          })))
        } else {
          setClientPendingDebt([])
        }
      })
      .catch(() => { if (!cancelled) setClientPendingDebt([]) })
      .finally(() => { if (!cancelled) setClientDebtLoading(false) })
    return () => { cancelled = true }
  }, [selectedClientId])

  // Mapa de reservas activas del cliente por variante (para mostrar badge "De reserva" en las líneas)
  useEffect(() => {
    if (!selectedClientId) { setReservedVariantsForClient({}); return }
    const variantIds = Array.from(new Set(ticketLines.map(l => l.product_variant_id).filter((x): x is string => Boolean(x))))
    if (variantIds.length === 0) { setReservedVariantsForClient({}); return }
    let cancelled = false
    Promise.all(variantIds.map(async (variantId) => {
      const res = await getActiveReservationsForVariant({ productVariantId: variantId, clientId: selectedClientId })
      if (!res.success) return [variantId, 0] as const
      return [variantId, res.data.totalReserved] as const
    }))
      .then((entries) => {
        if (cancelled) return
        const map: Record<string, number> = {}
        for (const [id, qty] of entries) map[id] = qty
        setReservedVariantsForClient(map)
      })
      .catch(() => { if (!cancelled) setReservedVariantsForClient({}) })
    return () => { cancelled = true }
  }, [selectedClientId, ticketLines])

  // A partir de las 21:00 mostrar aviso "¿Quieres cerrar ya la caja?" (una vez o cada 60 min si dice "Más tarde")
  useEffect(() => {
    const now = new Date()
    if (now.getHours() < 21) return
    const key = 'pos_close_reminder_until'
    try {
      const until = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null
      if (until && Date.now() < parseInt(until, 10)) return
      setShowCloseReminderDialog(true)
    } catch {
      setShowCloseReminderDialog(true)
    }
  }, [])

  const dismissCloseReminder = (forMinutes = 60) => {
    setShowCloseReminderDialog(false)
    try {
      sessionStorage.setItem('pos_close_reminder_until', String(Date.now() + forMinutes * 60 * 1000))
    } catch { /* ignore */ }
  }

  // unit_price ES el PVP (IVA incluido), NO añadir IVA encima
  const subtotal = ticketLines.reduce((sum, l) => {
    const lineDiscount = l.unit_price * l.quantity * (l.discount_percentage / 100)
    return sum + (l.unit_price * l.quantity - lineDiscount)
  }, 0)
  const globalDiscountAmount = subtotal * (globalDiscount / 100)
  const total = subtotal - globalDiscountAmount
  const taxAmount = isTaxFree ? 0 : ticketLines.reduce((sum, l) => {
    const lineNet = l.unit_price * l.quantity * (1 - l.discount_percentage / 100) * (1 - globalDiscount / 100)
    const taxRate = l.tax_rate ?? 21
    return sum + lineNet * taxRate / (100 + taxRate)
  }, 0)
  const totalUnits = ticketLines.reduce((s, l) => s + l.quantity, 0)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = total - totalPaid
  const change = totalPaid > total ? totalPaid - total : 0
  const canCobrar = ticketLines.length > 0 && (!!selectedClientId || saleWithoutClient)

  const addToTicket = (variant: any) => {
    const stock = Array.isArray(variant.stock_levels) ? (variant.stock_levels[0]?.available ?? 0) : 0
    const existing = ticketLines.find(l => l.product_variant_id === variant.id)
    if (existing) {
      if (existing.available_stock != null && existing.quantity >= existing.available_stock) return
      setTicketLines(prev => prev.map(l =>
        l.product_variant_id === variant.id ? { ...l, quantity: l.quantity + 1 } : l
      ))
    } else {
      // price_with_tax ES el PVP (IVA incluido); si no existe, calcular desde base_price
      const taxRate = Number(variant.products.tax_rate) || 21
      const priceOverride = Number(variant.price_override) || 0
      const priceWithTax = Number(variant.products.price_with_tax) || 0
      const basePrice = Number(variant.products.base_price) || 0
      const price = priceOverride || priceWithTax || (basePrice ? basePrice * (1 + taxRate / 100) : 0)
      setTicketLines(prev => [...prev, {
        id: crypto.randomUUID(),
        product_variant_id: variant.id,
        description: `${variant.products.name}${variant.size ? ` T.${variant.size}` : ''}${variant.color ? ` ${variant.color}` : ''}`,
        sku: variant.variant_sku,
        quantity: 1,
        unit_price: price,
        original_price: price,
        discount_percentage: 0,
        tax_rate: taxRate,
        cost_price: variant.products.cost_price || 0,
        image_url: variant.products.main_image_url,
        available_stock: stock,
      }])
    }
    setSearchQuery('')
    setSearchResults([])
    searchRef.current?.focus()
  }

  const addManualLine = () => {
    setTicketLines(prev => [...prev, {
      id: crypto.randomUUID(),
      product_variant_id: null,
      description: 'Artículo manual',
      sku: '',
      quantity: 1,
      unit_price: 0,
      discount_percentage: 0,
      tax_rate: 0,
      cost_price: 0,
    }])
  }

  const addReservationPickup = (payloads: Array<{
    reservation_id: string
    reservation_line_id: string
    reservation_number: string
    product_variant_id: string
    description: string
    sku: string
    size: string | null
    color: string | null
    image_url: string | null
    quantity: number
    unit_price: number
    tax_rate: number
    cost_price: number
    reservation_total: number
    reservation_already_paid: number
    client_id: string | null
    client_name: string | null
  }>) => {
    if (!payloads || payloads.length === 0) return

    const first = payloads[0]
    // Cliente: asignar el de la reserva si no hay cliente en el ticket
    if (first.client_id && !selectedClientId) {
      setSelectedClientId(first.client_id)
      setSelectedClientName(first.client_name || '')
    }

    const existingLineIds = new Set(ticketLines.map((l) => l.reservation_line_id).filter(Boolean))
    const fresh = payloads.filter((p) => !existingLineIds.has(p.reservation_line_id))
    const duplicates = payloads.length - fresh.length

    if (fresh.length === 0) {
      toast.warning('Las líneas seleccionadas ya están en el ticket')
      return
    }

    setTicketLines(prev => [
      ...prev,
      ...fresh.map((p) => ({
        id: crypto.randomUUID(),
        product_variant_id: p.product_variant_id || null,
        description: p.description,
        sku: p.sku || '',
        quantity: p.quantity,
        unit_price: p.unit_price,
        discount_percentage: 0,
        tax_rate: p.tax_rate,
        cost_price: p.cost_price,
        image_url: p.image_url || undefined,
        reservation_id: p.reservation_id,
        reservation_line_id: p.reservation_line_id,
        reservation_number: p.reservation_number,
        reservation_total: p.reservation_total,
        reservation_already_paid: p.reservation_already_paid,
      })),
    ])
    toast.success(
      fresh.length === 1
        ? `Línea de reserva ${first.reservation_number} añadida`
        : `${fresh.length} líneas de ${first.reservation_number} añadidas${duplicates > 0 ? ` (${duplicates} ya estaban)` : ''}`,
    )
  }

  const updateLine = (id: string, field: string, value: any) => {
    setTicketLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  const removeLine = (id: string) => setTicketLines(prev => prev.filter(l => l.id !== id))

  const applyPosDiscountCode = async () => {
    const code = discountCodeInput.trim()
    if (!code) return
    setDiscountCodeLoading(true)
    try {
      const res = await validateDiscountCode({ code, subtotal })
      if (!res || !res.success) { toast.error(!res ? 'Error al validar' : res.error); return }
      const d = res.data
      if (d.discount_type === 'percentage') {
        setGlobalDiscount(d.discount_value)
      } else {
        const pct = subtotal > 0 ? Math.min((d.discount_amount / subtotal) * 100, 100) : 0
        setGlobalDiscount(Math.round(pct * 100) / 100)
      }
      setDiscountCodeApplied(code.toUpperCase())
      toast.success(`Código ${code.toUpperCase()} aplicado`)
    } catch { toast.error('Error al validar el código') }
    finally { setDiscountCodeLoading(false) }
  }

  const removePosDiscountCode = () => {
    setDiscountCodeApplied(null)
    setDiscountCodeInput('')
    setGlobalDiscount(0)
  }

  /** Añade al ticket una línea por cada cobro pendiente del cliente que aún no esté en el ticket. */
  const addPendingDebtToTicket = () => {
    const existingEntityIds = new Set(ticketLines.filter(l => l.cobro_ref).map(l => l.cobro_ref!.entity_id))
    const toAdd = clientPendingDebt.filter((p) => !existingEntityIds.has(p.entity_id))
    if (toAdd.length === 0) {
      toast.info('Todos los pendientes ya están en el ticket')
      return
    }
    setTicketLines(prev => [
      ...prev,
      ...toAdd.map((p) => ({
        id: crypto.randomUUID(),
        product_variant_id: null as string | null,
        description: `Cobro pendiente - ${p.reference}`,
        sku: '',
        quantity: 1,
        unit_price: p.total_pending,
        discount_percentage: 0,
        tax_rate: 0,
        cost_price: 0,
        cobro_ref: { entity_type: p.entity_type, entity_id: p.entity_id } as const,
      })),
    ])
    toast.success(`${toAdd.length} pendiente(s) añadido(s) al ticket`)
  }

  const quickPay = (method: Payment['payment_method']) => {
    if (wantPartialPayment) {
      const amount = Math.min(
        Math.max(0, parseFloat(String(paymentAmountInput).replace(',', '.')) || 0),
        remaining
      )
      if (amount < 0.01) return
      setPayments(prev => [...prev, { payment_method: method, amount }])
      setPaymentAmountInput('')
    } else {
      setPayments([{ payment_method: method, amount: total }])
    }
  }

  const paymentDialogOpenedRef = useRef(false)
  useEffect(() => {
    if (showPayment && !paymentDialogOpenedRef.current) {
      setPaymentAmountInput(remaining.toFixed(2))
      setLeaveAsPending(false)
      setNextPaymentDate('')
      setWantPartialPayment(false)
      setPaymentTab('integro')
      setPaymentStep('salesperson')
      integroSubmitRef.current = false
      setSelectedSalespersonId(profile?.id ?? null)
      if (activeStoreId) {
        setPosEmployeesLoading(true)
        listPosEmployees({ store_id: activeStoreId })
          .then((res) => {
            if (res?.success && res.data) setPosEmployees(res.data)
            else setPosEmployees([])
          })
          .catch(() => setPosEmployees([]))
          .finally(() => setPosEmployeesLoading(false))
      } else {
        setPosEmployees([])
      }
    }
    paymentDialogOpenedRef.current = !!showPayment
  }, [showPayment, remaining, activeStoreId, profile?.id])

  // Cobro íntegro: al elegir un solo método, enviar venta cuando payments se actualice
  useEffect(() => {
    if (!showPayment || payments.length !== 1) return
    const p = payments[0]
    if (Math.abs(p.amount - total) > 0.02) return
    if (!integroSubmitRef.current) return
    integroSubmitRef.current = false
    handleProcessSale()
  }, [showPayment, payments, total])

  const { execute: submitSale, isLoading: isProcessing } = useAction(createSale, {
    successMessage: 'Venta completada',
    onSuccess: async (data) => {
      const toAdd = lastPaymentsRef.current
      if (toAdd.length > 0) {
        setSessionTotals((prev) => {
          const next = { ...prev }
          next.total_sales = prev.total_sales + (data?.total ?? 0)
          toAdd.forEach((p) => {
            if (p.payment_method === 'cash') next.total_cash_sales += p.amount
            else if (p.payment_method === 'card') next.total_card_sales += p.amount
            else if (p.payment_method === 'bizum') next.total_bizum_sales += p.amount
            else if (p.payment_method === 'transfer') next.total_transfer_sales += p.amount
          })
          return next
        })
        lastPaymentsRef.current = []
      }
      setShowPayment(false)
      setCompletedSale(data)
      setShowTicketModal(true)
      const cobroLines = lastCobroLinesRef.current
      lastCobroLinesRef.current = []
      if (cobroLines.length > 0) {
        const method = cobroPaymentMethodRef.current
        const orderMethod = method === 'bizum' || method === 'voucher' ? 'card' : (method === 'cash' || method === 'card' || method === 'transfer' ? method : 'cash')
        const today = new Date().toISOString().split('T')[0]
        for (const item of cobroLines) {
          try {
            if (item.entity_type === 'tailoring_order') {
              const res = await addOrderPayment({
                tailoring_order_id: item.entity_id,
                payment_date: today,
                payment_method: orderMethod,
                amount: item.amount,
                storeId: activeStoreId ?? undefined,
              })
              if (res?.success !== true) toast.error(res && 'error' in res ? res.error : 'Error al registrar pago en pedido')
            } else {
              const res = await addSalePayment({
                sale_id: item.entity_id,
                payment_method: orderMethod,
                amount: item.amount,
                storeId: activeStoreId ?? undefined,
              })
              if (res?.success !== true) toast.error(res && 'error' in res ? res.error : 'Error al registrar pago en venta')
            }
          } catch (e) {
            console.error('[POS] registrar pago cobro:', e)
            toast.error('Error al registrar el pago en el pedido/venta')
          }
        }
      }
    },
  })


  const handleNewSale = () => {
    setShowTicketModal(false)
    setCompletedSale(null)
    setTicketLines([])
    setPayments([])
    setSelectedClientId(null)
    setSelectedClientName('')
    setGlobalDiscount(0)
    setIsTaxFree(false)
    setShowPayment(false)
    setSaleType('boutique')
    setSaleWithoutClient(false)
    searchRef.current?.focus()
  }

  const handleDownloadTicketPdf = async () => {
    if (!completedSale) return
    const lineTotal = (l: TicketLine) =>
      l.unit_price * l.quantity * (1 - (l.discount_percentage || 0) / 100)
    const storeConfig = getStorePdfData(activeStoreName)
    await generateTicketPdf({
      sale: {
        ticket_number: completedSale.ticket_number,
        created_at: completedSale.created_at || new Date().toISOString(),
        client_id: completedSale.client_id,
        subtotal: completedSale.subtotal,
        discount_amount: completedSale.discount_amount,
        discount_percentage: completedSale.discount_percentage,
        tax_amount: completedSale.tax_amount,
        total: completedSale.total,
        payment_method: completedSale.payment_method,
        is_tax_free: completedSale.is_tax_free,
      },
      lines: ticketLines.map(l => ({
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_percentage: l.discount_percentage,
        line_total: lineTotal(l),
        tax_rate: l.tax_rate,
        sku: l.sku || null,
      })),
      payments,
      clientName: selectedClientName || null,
      clientCode: null,
      attendedBy: lastSaleSalespersonName || null,
      storeAddress: storeConfig.address,
      storeSubtitle: storeConfig.subtitle ?? null,
      storePhones: storeConfig.phones,
    })
  }

  const buildTicketPdfData = () => {
    if (!completedSale) return null
    const lineTotal = (l: TicketLine) =>
      l.unit_price * l.quantity * (1 - (l.discount_percentage || 0) / 100)
    const storeConfig = getStorePdfData(activeStoreName)
    return {
      sale: {
        ticket_number: completedSale.ticket_number,
        created_at: completedSale.created_at || new Date().toISOString(),
        client_id: completedSale.client_id,
        subtotal: completedSale.subtotal,
        discount_amount: completedSale.discount_amount,
        discount_percentage: completedSale.discount_percentage,
        tax_amount: completedSale.tax_amount,
        total: completedSale.total,
        payment_method: completedSale.payment_method,
        is_tax_free: completedSale.is_tax_free,
      },
      lines: ticketLines.map(l => ({
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_percentage: l.discount_percentage,
        line_total: lineTotal(l),
        tax_rate: l.tax_rate,
        sku: l.sku || null,
      })),
      payments,
      clientName: selectedClientName || null,
      clientCode: null,
      attendedBy: lastSaleSalespersonName || null,
      storeAddress: storeConfig.address,
      storeSubtitle: storeConfig.subtitle ?? null,
      storePhones: storeConfig.phones,
    }
  }

  const handlePrintTicket = async () => {
    const data = buildTicketPdfData()
    if (!data) return
    await printTicketPdf(data)
  }

  const handlePrintGiftTicket = async () => {
    const data = buildTicketPdfData()
    if (!data) return
    await printGiftTicketPdf(data)
  }

  const handleDownloadFactura = async () => {
    if (!completedSale?.id) return
    setDownloadingInvoice(true)
    try {
      const createRes = await createInvoiceFromSaleAction(completedSale.id)
      if (!createRes.success || !createRes.data) {
        toast.error('error' in createRes ? createRes.error : 'Error al crear la factura')
        return
      }
      const pdfRes = await generateInvoicePdfAction(createRes.data.id)
      if (!pdfRes.success || !pdfRes.data?.url) {
        toast.error('error' in pdfRes ? pdfRes.error : 'Error al generar el PDF')
        return
      }
      window.open(pdfRes.data.url, '_blank', 'noopener,noreferrer')
      toast.success(`Factura ${createRes.data.invoice_number} generada`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al obtener la factura')
    } finally {
      setDownloadingInvoice(false)
    }
  }

  const handleProcessSale = () => {
    const hasEnough = remaining <= 0.01
    const partialAmountFromInput = Math.min(
      Math.max(0, parseFloat(String(paymentAmountInput).replace(',', '.')) || 0),
      total
    )
    const usePartialFromInput = leaveAsPending && payments.length === 0 && partialAmountFromInput >= 0
    const allowedPartial = (leaveAsPending && payments.length > 0) || usePartialFromInput
    if (!hasEnough && !allowedPartial) {
      toast.error('Completa el pago o marca "Dejar pendiente" e indica el importe a cobrar ahora')
      return
    }
    const salespersonId = selectedSalespersonId || profile?.id || null
    if (!salespersonId) {
      toast.error('Selecciona quién realiza la venta')
      return
    }
    setLastSaleSalespersonName(posEmployees.find((e) => e.id === salespersonId)?.full_name ?? profile?.fullName ?? null)
    cobroPaymentMethodRef.current = payments[0]?.payment_method ?? 'cash'
    let paymentsToSend: Payment[] = [...payments]
    if (usePartialFromInput) {
      paymentsToSend = [{ payment_method: 'cash', amount: partialAmountFromInput }]
    }
    if (leaveAsPending && nextPaymentDate && paymentsToSend.length > 0) {
      const last = paymentsToSend[paymentsToSend.length - 1]
      paymentsToSend[paymentsToSend.length - 1] = { ...last, next_payment_date: nextPaymentDate }
    }
    lastPaymentsRef.current = paymentsToSend
    const lineTotal = (l: TicketLine) => l.unit_price * l.quantity * (1 - (l.discount_percentage || 0) / 100)
    lastCobroLinesRef.current = ticketLines
      .filter((l): l is TicketLine & { cobro_ref: NonNullable<TicketLine['cobro_ref']> } => !!l.cobro_ref)
      .map(l => ({ entity_type: l.cobro_ref.entity_type, entity_id: l.cobro_ref.entity_id, amount: lineTotal(l) }))
    submitSale({
      sale: {
        cash_session_id: session.id,
        store_id: activeStoreId,
        client_id: saleWithoutClient ? null : selectedClientId,
        sale_type: saleType,
        discount_percentage: globalDiscount,
        discount_code: discountCodeApplied || null,
        is_tax_free: isTaxFree,
        notes: saleWithoutClient ? 'Venta sin cliente' : null,
        salesperson_id: salespersonId,
      },
      lines: ticketLines.map(l => ({
        product_variant_id: l.product_variant_id,
        reservation_id: l.reservation_id ?? null,
        reservation_line_id: l.reservation_line_id ?? null,
        description: l.description,
        sku: l.sku,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_percentage: l.discount_percentage,
        tax_rate: isTaxFree ? 0 : l.tax_rate,
        cost_price: l.cost_price,
      })),
      payments: paymentsToSend,
    })
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2' && canCobrar && ticketLines.length > 0) { e.preventDefault(); setShowPayment(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ticketLines, canCobrar])

  const partialAmountFromInput = Math.min(
    Math.max(0, parseFloat(String(paymentAmountInput).replace(',', '.')) || 0),
    total
  )
  const canCompleteWithInputOnly = leaveAsPending && wantPartialPayment && partialAmountFromInput >= 0.01
  const canPressComplete = !isProcessing
    && (payments.length > 0 || remaining <= 0.01 || canCompleteWithInputOnly)
    && (remaining <= 0.01 || leaveAsPending)

  const totalCashInDrawer = (session?.opening_amount ?? 0) + sessionTotals.total_cash_sales - (session?.total_returns ?? 0) - (session?.total_withdrawals ?? 0)
  const clientDebtTotal = clientPendingDebt.reduce((s, i) => s + i.total_pending, 0)

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* FILA 1 — Cabecera (igual que referencia: espaciosa, recuadro teal cuadrado, Caja abierta en verde, botones definidos) */}
      <div className="bg-[#1A2436] min-h-[5rem] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1.5">
          {isAdmin && adminStores.length > 1 && onSwitchStore ? (
            <Select value={activeStoreId ?? ''} onValueChange={(v) => { if (v && v !== activeStoreId) onSwitchStore(v) }}>
              <SelectTrigger
                className="h-7 w-auto min-w-[160px] max-w-[240px] border border-[rgba(201,169,110,0.3)] bg-transparent text-white font-semibold text-sm px-2 hover:bg-white/5 focus:ring-0 focus:ring-offset-0"
              >
                <SelectValue placeholder="Tienda" />
              </SelectTrigger>
              <SelectContent className="border-[rgba(201,169,110,0.3)] bg-[#1a2744] text-white">
                {adminStores.map((s) => (
                  <SelectItem key={s.storeId} value={s.storeId} className="text-white focus:bg-white/10 focus:text-white">
                    {s.storeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-white font-semibold text-sm leading-tight">{activeStoreName}</span>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded bg-[#1E5257] border border-[#2a6b70]" aria-hidden>
              <div className="h-2.5 w-2.5 rounded-full bg-[#2DE6AA] shadow-[0_0_6px_#2DE6AA]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[#2DE6AA] font-bold text-lg leading-tight">Caja abierta</span>
              {profile?.fullName && <span className="text-slate-400 text-xs mt-0.5">{profile.fullName}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-10 px-5 rounded border border-slate-400/60 bg-[#252d3d] text-white font-medium hover:bg-slate-500/40 hover:text-white hover:border-slate-400"
            onClick={() => router.push('/admin/perfil')}
          >
            <User className="h-4 w-4" />
            Volver a mi perfil
          </Button>
          <Button size="sm" className="gap-2 h-10 px-5 rounded bg-red-600 hover:bg-red-700 text-white font-medium border-0 shadow-none" onClick={onCloseCash}>
            <Lock className="h-4 w-4" />
            Cerrar caja
          </Button>
        </div>
      </div>
      {/* FILA 2 — Totales (líneas duras entre columnas, EFECTIVO destacado en ámbar) */}
      <div className="bg-[#252d3d] min-h-[3.5rem] flex shrink-0">
        {[
          { label: 'VENTAS TOTAL', value: sessionTotals.total_sales, highlight: false },
          { label: 'EFECTIVO', value: totalCashInDrawer, highlight: true },
          { label: 'TARJETA', value: sessionTotals.total_card_sales, highlight: false },
          { label: 'BIZUM', value: sessionTotals.total_bizum_sales, highlight: false },
          { label: 'TRANSFERENCIA', value: sessionTotals.total_transfer_sales, highlight: false },
        ].map(({ label, value, highlight }) => (
          <div
            key={label}
            className={`flex-1 flex flex-col items-center justify-center border-r border-slate-600 last:border-r-0 ${highlight ? 'bg-slate-800/50' : ''}`}
          >
            <span className={`text-[10px] uppercase tracking-widest font-medium tabular-nums ${highlight ? 'text-amber-400/90' : 'text-slate-400'}`}>{label}</span>
            <span className="text-white font-bold text-base mt-0.5 tabular-nums">{formatCurrency(value ?? 0)}</span>
          </div>
        ))}
      </div>

      {/* BODY — 3 columnas */}
      <div className="flex-1 flex flex-row min-h-0">
        {/* COLUMNA IZQUIERDA */}
        <div className="w-52 bg-[#f5f5f5] border-r border-slate-200 flex flex-col overflow-y-auto shrink-0">
          <div className="p-4 border-b border-slate-200">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Cajero</p>
            <div className="w-full h-16 rounded bg-[#4a6fa5] text-white text-2xl font-black flex items-center justify-center">
              {(profile?.fullName ?? 'AP').slice(0, 2).toUpperCase()}
            </div>
            <p className="text-xs text-slate-500 mt-2">F3 Venta</p>
            <p className="text-xs text-slate-500">F5 Ticket</p>
          </div>
          <div className="p-4 border-b border-slate-200">
            <p className="text-xs text-slate-500 mb-2">Tipo de venta</p>
            <Select value={saleType} onValueChange={(v) => { if (v === 'manual') { addManualLine(); setSaleType('boutique') } else setSaleType(v) }}>
              <SelectTrigger className="w-full border border-slate-200 rounded h-9 text-sm bg-slate-200 text-slate-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="boutique">Boutique</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="tailoring_deposit">Señal sastrería</SelectItem>
                <SelectItem value="tailoring_final">Pago final</SelectItem>
                <SelectItem value="alteration">Arreglo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="p-4 border-b border-slate-200">
            {!selectedClientId ? (
              <Button variant="outline" className="w-full h-9 text-sm gap-2 min-h-[44px] border-slate-300 bg-slate-200 text-slate-700 hover:bg-slate-300 hover:text-slate-900" onClick={() => setShowClientDialog(true)}>
                <User className="h-4 w-4 text-slate-500" />
                Asignar cliente
              </Button>
            ) : (
              <div className="rounded bg-slate-200 border border-slate-300 p-2.5 flex flex-col items-center text-center">
                <p className="text-sm font-medium text-slate-800 truncate w-full">{selectedClientName}</p>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-600 font-medium hover:text-slate-800 hover:bg-slate-300 mt-1" onClick={() => { setSelectedClientId(null); setSelectedClientName('') }}>Cambiar</Button>
              </div>
            )}
            {clientDebtLoading && selectedClientId && <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Comprobando...</div>}
            {!clientDebtLoading && clientPendingDebt.length > 0 && selectedClientId && (
              <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs">
                <p className="font-semibold text-amber-800 tabular-nums">Pendiente: {formatCurrency(clientDebtTotal)}</p>
                <p className="text-amber-700/90 mt-0.5 leading-tight">Puedes añadirlo al cobro actual.</p>
                <Button type="button" size="sm" variant="outline" className="mt-2 w-full h-auto min-h-8 py-2 text-xs font-medium border-amber-300 text-amber-800 hover:bg-amber-100 hover:border-amber-400 justify-center text-center whitespace-normal leading-tight" onClick={addPendingDebtToTicket}>
                  Incluir pendientes en este ticket
                </Button>
              </div>
            )}
          </div>
          <div className="p-4 border-b border-slate-200">
            <label className="flex flex-col gap-1 cursor-pointer rounded bg-slate-200 border border-slate-300 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Checkbox checked={saleWithoutClient} onCheckedChange={(c) => setSaleWithoutClient(c === true)} />
                <span className="text-sm text-slate-700">Venta sin cliente (excepcional)</span>
              </div>
              {saleWithoutClient && <span className="text-xs text-slate-500 pl-6">No se guardará en perfil de cliente</span>}
            </label>
          </div>
          <div className="p-4 border-b border-slate-200">
            <p className="text-xs text-slate-500 mb-2">Vales</p>
            <Input placeholder="Código de vale" className="h-9 text-sm bg-slate-200 border-slate-300 placeholder:text-slate-500 text-slate-800" readOnly />
          </div>
          <div className="flex-1" />
        </div>

        {/* COLUMNA CENTRO */}
        <div className="flex-1 flex flex-col bg-white min-h-0">
          <div className="relative border-b border-slate-200 shrink-0">
            <input ref={scannerInputRef} id="pos-barcode-scanner" type="text" autoComplete="off" className="absolute w-px h-px opacity-0 pointer-events-none left-0 top-0" tabIndex={-1} aria-hidden />
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              ref={searchRef}
              placeholder="Buscar por nombre, referencia, EAN o código de barras..."
              className="h-12 pl-10 text-sm border-0 rounded-none focus:ring-0 bg-slate-100 placeholder:text-slate-500 text-slate-800"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-slate-400" />}
          </div>
          {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
            <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
              <span className="text-sm text-slate-500">No se encontraron resultados para &ldquo;{searchQuery}&rdquo;</span>
            </div>
          )}
          {searchResults.length > 0 && (
            <div className="bg-white border-b border-slate-200 max-h-64 overflow-y-auto shrink-0 shadow-sm">
              {searchResults.map((v: any) => {
                const stock = Array.isArray(v.stock_levels) ? (v.stock_levels[0]?.available ?? 0) : (v.stock_levels?.[0]?.available || 0)
                const taxRate = Number(v.products?.tax_rate) || 21
                const priceOverride = Number(v.price_override) || 0
                const priceWithTax = Number(v.products?.price_with_tax) || 0
                const basePrice = Number(v.products?.base_price) || 0
                const price = priceOverride || priceWithTax || (basePrice ? basePrice * (1 + taxRate / 100) : 0)
                const name = v.products?.name ?? ''
                const sku = v.products?.sku ?? ''
                const variantSku = v.variant_sku ?? ''
                const barcode = v.barcode ?? ''
                const size = v.size ?? ''
                const color = v.color ?? ''
                return (
                  <button key={v.id} type="button" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0 text-left disabled:opacity-40 disabled:cursor-not-allowed transition-colors" onClick={() => stock > 0 && addToTicket(v)} disabled={stock <= 0}>
                    {v.products?.main_image_url ? (
                      <img src={v.products.main_image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0 bg-slate-100" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0"><ImageOff className="h-4 w-4 text-slate-300" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 font-mono">Ref: {sku || variantSku}</span>
                        {barcode && <span className="text-xs text-slate-400 font-mono">EAN: {barcode}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {size && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">T.{size}</span>}
                      {color && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{color}</span>}
                    </div>
                    <div className="text-right shrink-0 ml-2 min-w-[80px]">
                      <p className="text-sm font-semibold text-slate-700 tabular-nums">{formatCurrency(price)}</p>
                      <p className={`text-xs tabular-nums ${stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {stock > 0 ? `${stock} uds` : 'Sin stock'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="bg-red-700 text-white text-xs uppercase tracking-wide px-4 py-2.5 shrink-0 grid grid-cols-[48px_90px_1fr_40px_1fr_90px_72px_80px_40px] gap-2 items-center">
              <span>U</span>
              <span>CÓDIGO</span>
              <span>ARTÍCULO</span>
              <span>T</span>
              <span>DESCRIPCIÓN</span>
              <span>PVP</span>
              <span>DTO</span>
              <span>TOTAL</span>
              <span className="w-8" />
            </div>
            <button type="button" onClick={addManualLine} className="px-4 py-2 border-b border-slate-200 hover:bg-slate-50 text-sm text-slate-600 cursor-pointer flex items-center gap-2 min-h-[44px] shrink-0">
              <Plus className="h-4 w-4 text-slate-500" />
              + Añadir línea manual
            </button>
            <div className="flex-1 min-h-0 overflow-auto">
              {ticketLines.map((line) => {
                // unit_price YA es PVP (IVA incluido)
                const lineTotal = line.unit_price * line.quantity * (1 - (line.discount_percentage || 0) / 100)
                const pvpConIva = line.unit_price
                const taxRate = line.tax_rate || 21
                const ivaIncl = line.unit_price * taxRate / (100 + taxRate)
                return (
                <div key={line.id} className="group flex px-4 py-2 border-b border-slate-200 hover:bg-slate-50 items-center gap-3 text-sm grid grid-cols-[48px_90px_1fr_40px_1fr_90px_72px_80px_40px] gap-2">
                  <div className="flex items-center gap-0">
                    <Button variant="ghost" size="icon" className="rounded-full w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-600" onClick={() => updateLine(line.id, 'quantity', Math.max(1, line.quantity - 1))}><Minus className="h-2.5 w-2.5" /></Button>
                    <span className="w-5 text-center text-xs tabular-nums text-slate-700">{line.quantity}</span>
                    <Button variant="ghost" size="icon" className={`rounded-full w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-600 ${line.available_stock != null && line.quantity >= line.available_stock ? 'opacity-30 cursor-not-allowed' : ''}`} onClick={() => { if (line.available_stock != null && line.quantity >= line.available_stock) return; updateLine(line.id, 'quantity', line.quantity + 1) }}><Plus className="h-2.5 w-2.5" /></Button>
                  </div>
                  <span className="text-slate-500 text-xs truncate">{line.sku || '—'}</span>
                  <div className="min-w-0">
                    {line.product_variant_id ? (
                      <div className="flex items-center gap-1 min-w-0">
                        <p className="font-medium truncate text-slate-800">{line.description}</p>
                        {line.reservation_id ? (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] px-1.5 py-0 shrink-0">
                            <Bookmark className="h-2.5 w-2.5 mr-0.5" /> {line.reservation_number || 'Reserva'}
                          </Badge>
                        ) : (
                          line.product_variant_id && reservedVariantsForClient[line.product_variant_id] >= line.quantity && (
                            <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] px-1.5 py-0 shrink-0">
                              <Bookmark className="h-2.5 w-2.5 mr-0.5" /> De reserva
                            </Badge>
                          )
                        )}
                      </div>
                    ) : (
                      <Input value={line.description} onChange={(e) => updateLine(line.id, 'description', e.target.value)} onFocus={(e) => { if (e.target.value === 'Artículo manual') e.target.select() }} className="h-7 text-sm border-slate-200 placeholder:text-slate-400" placeholder="Artículo..." />
                    )}
                  </div>
                  <span className="text-slate-400 text-xs">—</span>
                  <div className="min-w-0"><span className="text-xs text-slate-400 truncate">—</span></div>
                  <div className="text-slate-700 text-xs">
                    {line.product_variant_id ? (
                      <div>
                        {line.original_price && line.unit_price !== line.original_price && (
                          <span className="tabular-nums text-slate-400 line-through mr-1">{formatCurrency(line.original_price)}</span>
                        )}
                        <Input type="number" step="0.01" value={line.unit_price || ''} onChange={(e) => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)} className="h-6 w-20 text-xs text-right border-slate-200 tabular-nums font-medium" />
                      </div>
                    ) : (
                      <Input type="number" step="0.01" value={line.unit_price || ''} onChange={(e) => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)} className="h-6 w-20 text-xs text-right border-slate-200" />
                    )}
                  </div>
                  <Input type="number" min={0} max={100} value={line.discount_percentage || ''} onChange={(e) => updateLine(line.id, 'discount_percentage', parseFloat(e.target.value) || 0)} className="h-6 w-16 text-xs text-center rounded border-slate-200" />
                  <span className="text-slate-800 font-medium tabular-nums text-xs">{formatCurrency(lineTotal)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-700" onClick={() => removeLine(line.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )})}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div className="w-64 bg-[#f5f5f5] border-l border-slate-200 flex flex-col p-4 gap-4 shrink-0 overflow-y-auto">
          <div className="bg-[#4a6fa5] rounded p-4 text-white shrink-0">
            <p className="text-xs uppercase tracking-widest text-slate-200">TOTAL A COBRAR</p>
            <p className="text-4xl font-black text-center mt-1 tabular-nums">{formatCurrency(total)}</p>
          </div>
          <div className="space-y-3 rounded bg-slate-200 p-3 border border-slate-300">
            <p className="text-sm text-slate-600">Tarifa CT: 1</p>
            <div>
              <Label className="text-sm text-slate-500">% Descuento</Label>
              <Input type="number" min={0} max={100} value={globalDiscount || ''} onChange={(e) => { setGlobalDiscount(parseFloat(e.target.value) || 0); if (discountCodeApplied) { setDiscountCodeApplied(null); setDiscountCodeInput('') } }} className="w-full h-9 mt-1 border-slate-300 bg-slate-200 text-slate-800 placeholder:text-slate-500" />
            </div>
            <div>
              <Label className="text-sm text-slate-500">Código descuento</Label>
              {discountCodeApplied ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">{discountCodeApplied}</Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={removePosDiscountCode}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <div className="flex gap-1 mt-1">
                  <Input placeholder="CODIGO" value={discountCodeInput} onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && applyPosDiscountCode()} className="h-9 flex-1 border-slate-300 bg-slate-200 text-slate-800 placeholder:text-slate-500 text-xs" />
                  <Button variant="outline" size="sm" className="h-9 px-2 border-slate-300 text-slate-700" onClick={applyPosDiscountCode} disabled={discountCodeLoading || !discountCodeInput.trim()}>
                    {discountCodeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              )}
            </div>
          </div>
          {/* Recuadros de productos del ticket: descripción, precio, imagen (más pequeña); sin foto = recuadro en blanco */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {ticketLines.length === 0 ? null : (
              <div className={ticketLines.length === 1 ? 'space-y-2' : 'grid grid-cols-2 gap-2 content-start'}>
                {ticketLines.map((line) => {
                  const pvpConIva = line.unit_price
                  const lineTotalConIva = line.quantity * pvpConIva * (1 - line.discount_percentage / 100)
                  return (
                    <div key={line.id} className="rounded border border-slate-300 bg-white p-2 flex flex-col shrink-0">
                      <div className={`rounded overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center ${ticketLines.length === 1 ? 'h-24' : 'h-20'}`}>
                        {line.image_url ? (
                          <img src={line.image_url} alt={line.description} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-slate-400 flex flex-col items-center gap-0.5">
                            <ImageOff className="h-6 w-6" />
                            <span className="text-[10px]">Sin foto</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 min-w-0">
                        <p className="text-xs font-medium text-slate-800 line-clamp-2" title={line.description}>{line.description}</p>
                        {line.sku ? <p className="text-[10px] text-slate-500 truncate">Cód: {line.sku}</p> : null}
                        <p className="text-xs text-slate-700 mt-0.5">
                          {line.quantity} × {formatCurrency(pvpConIva)}
                          {line.discount_percentage > 0 && <span className="text-amber-600"> (−{line.discount_percentage}%)</span>}
                          {' → '}<span className="font-semibold">{formatCurrency(lineTotalConIva)}</span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Franja gris resumen (sobre la barra azul) */}
      <div className="bg-slate-200 border-t border-slate-300 px-4 py-2 flex items-center justify-center text-sm text-slate-600 shrink-0">
        <span className="tabular-nums">{ticketLines.length} lineas</span>
        <span className="mx-2">·</span>
        <span className="tabular-nums">{totalUnits} unidades</span>
        <span className="mx-2">·</span>
        <span className="font-medium tabular-nums">Total: {formatCurrency(total)}</span>
      </div>
      {/* Barra inferior azul — Línea -, Ticket X, Devolver, Resumen, Retirada, Salir, PAGAR */}
      <div className="bg-[#1B2A4A] min-h-[4rem] px-4 flex items-center justify-between shrink-0 border-t border-slate-700">
        <div className="flex-1 flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => addManualLine()}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 text-rose-300 hover:text-rose-200 hover:bg-white/5 rounded transition-colors"
          >
            <Minus className="h-5 w-5" />
            <span className="text-[10px] font-medium uppercase tracking-wide">Línea -</span>
          </button>
          <button
            type="button"
            onClick={() => { setTicketLines([]); setPayments([]); toast.success('Ticket anulado'); }}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 text-rose-300 hover:text-rose-200 hover:bg-white/5 rounded transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="text-[10px] font-medium uppercase tracking-wide">Anular ticket</span>
          </button>
          <Button variant="ghost" className="flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 h-auto text-sky-300 hover:text-sky-200 hover:bg-white/5 rounded" onClick={() => router.push('/pos/devoluciones')}>
            <ArrowRightLeft className="h-5 w-5" />
            <span className="text-[10px] font-medium uppercase tracking-wide">Devolver</span>
          </Button>
          <Button variant="ghost" className="flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 h-auto text-emerald-300 hover:text-emerald-200 hover:bg-white/5 rounded" onClick={() => router.push('/pos/resumen')}>
            <BarChart3 className="h-5 w-5" />
            <span className="text-[10px] font-medium uppercase tracking-wide">Resumen</span>
          </Button>
          <Button variant="ghost" className="flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 h-auto text-emerald-300 hover:text-emerald-200 hover:bg-white/5 rounded" onClick={() => setShowWithdrawal(true)}>
            <Banknote className="h-5 w-5" />
            <span className="text-[10px] font-medium uppercase tracking-wide">Retirada</span>
          </Button>
          <Button
            variant="ghost"
            className="flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 h-auto text-purple-300 hover:text-purple-200 hover:bg-white/5 rounded"
            onClick={() => setShowReservationDialog(true)}
          >
            <Bookmark className="h-5 w-5" />
            <span className="text-[10px] font-medium uppercase tracking-wide">Reservar</span>
          </Button>
          <Button variant="ghost" className="flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 h-auto text-slate-300 hover:text-white hover:bg-white/5 rounded" onClick={() => router.back()}>
            <LogOut className="h-5 w-5" />
            <span className="text-[10px] font-medium uppercase tracking-wide">Salir</span>
          </Button>
        </div>
        <Button
          onClick={() => { if (ticketLines.length === 0) { toast.error('Ticket vacío'); return } if (!canCobrar) { toast.error('Selecciona un cliente o activa "Venta sin cliente"'); return } setShowPayment(true) }}
          disabled={!canCobrar || ticketLines.length === 0}
          className="flex flex-col items-center justify-center gap-0.5 h-14 px-8 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded disabled:opacity-50 shrink-0"
        >
          <Check className="h-6 w-6" />
          <span className="text-sm uppercase tracking-wide">PAGAR</span>
          <span className="text-[10px] font-normal opacity-90">(F2)</span>
        </Button>
      </div>

      {/* Diálogo Buscar / Asignar cliente */}
      <Dialog open={showClientDialog} onOpenChange={(open) => {
        setShowClientDialog(open)
        if (!open) {
          setClientSearchQuery('')
          setClientSearchResults([])
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" /> Asignar cliente a la venta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Nombre, apellido o código..."
              value={clientSearchQuery}
              onChange={(e) => setClientSearchQuery(e.target.value)}
              className="h-9"
            />
            {clientSearching && (
              <div className="flex items-center justify-center py-4 text-slate-600 text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Buscando...
              </div>
            )}
            {!clientSearching && clientSearchQuery.length >= 2 && (
              <ScrollArea className="h-[220px] rounded border border-slate-200">
                {clientSearchResults.length === 0 ? (
                  <p className="p-4 text-sm text-slate-600 text-center">Sin resultados</p>
                ) : (
                  <ul className="p-2 space-y-1">
                    {clientSearchResults.map((c) => (
                      <li key={c.id}>
                        <Button
                          variant="ghost"
                          className="w-full justify-start h-9 text-left font-normal"
                          onClick={() => {
                            const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()
                            setSelectedClientId(c.id)
                            setSelectedClientName(name)
                            setShowClientDialog(false)
                            setClientSearchQuery('')
                            setClientSearchResults([])
                            toast.success('Cliente asignado')
                          }}
                        >
                          <span className="font-medium">{c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</span>
                          {c.client_code && <span className="text-slate-500 ml-2">({c.client_code})</span>}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            )}
            {clientSearchQuery.length < 2 && !clientSearching && (
              <p className="text-sm text-slate-600 py-2">Escribe al menos 2 caracteres para buscar</p>
            )}
          </div>
          <div className="pt-3 border-t border-slate-200">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                setShowClientDialog(false)
                setShowCreateClientDialog(true)
              }}
            >
              <UserPlus className="h-4 w-4" />
              Crear cliente nuevo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo Crear cliente nuevo (formulario completo) */}
      <CreateClientDialog
        open={showCreateClientDialog}
        onOpenChange={setShowCreateClientDialog}
        onSuccess={() => {}}
        onSuccessWithData={(data) => {
          if (data?.id) {
            const name = data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim()
            setSelectedClientId(data.id)
            setSelectedClientName(name)
            setClientSearchQuery('')
            setClientSearchResults([])
            toast.success('Cliente creado y asignado a la venta')
          }
        }}
      />

      {/* Diálogo de cobro — Paso 1: elegir tipo (Íntegro / Mixto / Parcial). Paso 2: método de pago y detalles */}
      <Dialog open={showPayment} onOpenChange={(open) => {
        setShowPayment(open)
        if (!open) {
          setPayments([])
          setWantPartialPayment(false)
          setPaymentTab('integro')
          setPaymentStep('salesperson')
        }
      }}>
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-2xl overflow-hidden p-0 gap-0">
          {/* Cabecera con total */}
          <div className="bg-gradient-to-br from-[#1B2A4A] to-[#243b5e] px-6 py-5 text-white">
            <p className="text-xs font-medium text-white/70 uppercase tracking-wider">Total a cobrar</p>
            <p className="text-3xl font-black tabular-nums mt-0.5">{formatCurrency(total)}</p>
          </div>

          {paymentStep === 'salesperson' ? (
            /* Paso 0: Quién realiza la venta (obligatorio primero) */
            <div className="p-6 space-y-5">
              <p className="text-sm font-medium text-slate-700 text-center">Indica quién realiza esta venta</p>
              {posEmployeesLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Cargando empleados...</div>
              ) : (
                <Select value={selectedSalespersonId ?? ''} onValueChange={(v) => setSelectedSalespersonId(v || null)}>
                  <SelectTrigger className="w-full h-12 text-base border-slate-300 bg-white">
                    <SelectValue placeholder="Selecciona el vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {posEmployees.length === 0 && profile?.id && (
                      <SelectItem value={profile.id}>{profile.fullName ?? 'Yo'}</SelectItem>
                    )}
                    {posEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                className="w-full h-12 rounded-xl bg-[#1B2A4A] hover:bg-[#243860] text-white font-bold"
                disabled={!selectedSalespersonId || posEmployeesLoading}
                onClick={() => setPaymentStep('choose_type')}
              >
                Continuar
              </Button>
            </div>
          ) : paymentStep === 'choose_type' ? (
            /* Paso 1: tipo de cobro (íntegro, mixto, parcial) */
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 text-center">Elige cómo quieres cobrar</p>
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => { setPaymentTab('integro'); setPaymentStep('details') }}
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 transition-all text-left group"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500 text-white group-hover:bg-emerald-600">
                    <Check className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Cobro íntegro</p>
                    <p className="text-xs text-slate-500">Un solo pago por el total</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentTab('mixto'); setPaymentStep('details'); setPaymentAmountInput(remaining.toFixed(2)) }}
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-all text-left group"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500 text-white group-hover:bg-blue-600">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Pago mixto</p>
                    <p className="text-xs text-slate-500">Varios métodos (efectivo + tarjeta, etc.)</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentTab('parcial'); setPaymentStep('details'); setPaymentAmountInput(remaining.toFixed(2)) }}
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 transition-all text-left group"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 text-white group-hover:bg-amber-600">
                    <Percent className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Cobro parcial</p>
                    <p className="text-xs text-slate-500">Cobrar ahora una parte y dejar pendiente</p>
                  </div>
                </button>
              </div>
              <Button variant="ghost" size="sm" className="w-full gap-1.5 text-slate-500" onClick={() => setPaymentStep('salesperson')}>
                <ChevronLeft className="h-4 w-4" />
                Cambiar vendedor
              </Button>
            </div>
          ) : (
            /* Paso 2: contenido según el tipo elegido */
            <div className="p-6 space-y-4">
              <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 text-slate-500 hover:text-slate-700" onClick={() => setPaymentStep('choose_type')}>
                <ChevronLeft className="h-4 w-4" />
                Cambiar tipo de cobro
              </Button>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-600">Vendedor:</span>
                <span className="font-medium text-slate-800">
                  {posEmployees.find((e) => e.id === selectedSalespersonId)?.full_name ?? (profile?.id === selectedSalespersonId ? profile?.fullName : null) ?? '—'}
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={() => setPaymentStep('salesperson')}>Cambiar</Button>
              </div>

              {paymentTab === 'integro' && (
                <>
                  <div className="rounded-xl bg-slate-100 py-4 px-4 text-center">
                    <p className="text-2xl font-bold text-[#1B2A4A] tabular-nums">{formatCurrency(total)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Elige el método de pago</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { method: 'cash' as const, label: 'Efectivo', icon: Banknote, bg: 'bg-emerald-500 hover:bg-emerald-600', border: 'border-emerald-200' },
                      { method: 'card' as const, label: 'Tarjeta', icon: CreditCard, bg: 'bg-blue-500 hover:bg-blue-600', border: 'border-blue-200' },
                      { method: 'bizum' as const, label: 'Bizum', icon: Smartphone, bg: 'bg-purple-500 hover:bg-purple-600', border: 'border-purple-200' },
                      { method: 'transfer' as const, label: 'Transferencia', icon: ArrowRightLeft, bg: 'bg-amber-500 hover:bg-amber-600', border: 'border-amber-200' },
                    ] as const).map(({ method, label, icon: Icon, bg, border }) => {
                      const selected = payments.length === 1 && payments[0].payment_method === method
                      return (
                        <Button
                          key={method}
                          type="button"
                          variant="outline"
                          className={`h-16 rounded-xl flex-col gap-1.5 border-2 ${border} bg-white hover:bg-slate-50 text-slate-800 font-medium ${selected ? 'ring-2 ring-[#1B2A4A] ring-offset-2' : ''}`}
                          onClick={() => setPayments([{ payment_method: method, amount: total }])}
                        >
                          <Icon className={`h-7 w-7 ${method === 'cash' ? 'text-emerald-600' : method === 'card' ? 'text-blue-600' : method === 'bizum' ? 'text-purple-600' : 'text-amber-600'}`} />
                          <span className="text-sm">{label}</span>
                        </Button>
                      )
                    })}
                  </div>
                  <Button
                    className="w-full h-12 rounded-xl bg-[#1B2A4A] hover:bg-[#243860] text-white font-bold disabled:opacity-50 gap-2"
                    disabled={payments.length !== 1 || isProcessing}
                    onClick={() => handleProcessSale()}
                  >
                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Receipt className="h-5 w-5" />}
                    Pagar
                  </Button>
                </>
              )}

              {paymentTab === 'mixto' && (
                <>
                  <div className="flex gap-2 items-center">
                    <Label className="text-sm shrink-0 font-medium text-slate-700">Importe (€)</Label>
                    <Input type="number" step="0.01" value={paymentAmountInput} onChange={(e) => setPaymentAmountInput(e.target.value)} className="h-10 w-28 font-mono text-center border-slate-300" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['cash', 'card', 'bizum', 'transfer'] as const).map((method) => {
                      const Icon = method === 'cash' ? Banknote : method === 'card' ? CreditCard : method === 'bizum' ? Smartphone : ArrowRightLeft
                      const label = method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : method === 'bizum' ? 'Bizum' : 'Transfer.'
                      return (
                        <Button key={method} variant="outline" size="sm" className="gap-1.5 rounded-lg border-slate-300" onClick={() => {
                          const amount = Math.min(Math.max(0, parseFloat(String(paymentAmountInput).replace(',', '.')) || 0), remaining)
                          if (amount >= 0.01) {
                            setPayments(prev => [...prev, { payment_method: method, amount }])
                            setPaymentAmountInput((remaining - amount).toFixed(2))
                          }
                        }}>
                          <Icon className="h-3.5 w-3.5" /> +{label}
                        </Button>
                      )
                    })}
                  </div>
                  {payments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-700">Pagos aplicados</p>
                      {payments.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-100 rounded-lg border border-slate-200">
                          <span className="text-sm capitalize text-slate-700">{p.payment_method}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#1B2A4A]">{formatCurrency(p.amount)}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-600" onClick={() => setPayments(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${total > 0 ? Math.min(100, (totalPaid / total) * 100) : 0}%` }} />
                  </div>
                  <p className="text-xs text-center text-slate-500">Cubierto {formatCurrency(totalPaid)} / Pendiente {formatCurrency(remaining)}</p>
                  <Button className="w-full h-12 rounded-xl bg-[#1B2A4A] hover:bg-[#243860] text-white font-bold disabled:opacity-40" disabled={remaining > 0.01 || isProcessing} onClick={handleProcessSale}>
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                    Completar venta
                  </Button>
                </>
              )}

              {paymentTab === 'parcial' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Importe a cobrar ahora (€)</Label>
                    <Input type="number" step="0.01" min="0" max={total} value={paymentAmountInput} onChange={(e) => setPaymentAmountInput(e.target.value)} placeholder={total.toFixed(2)} className="text-lg font-mono h-11 border-slate-300 rounded-lg" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['cash', 'card', 'bizum', 'transfer'] as const).map((method) => {
                      const Icon = method === 'cash' ? Banknote : method === 'card' ? CreditCard : method === 'bizum' ? Smartphone : ArrowRightLeft
                      const label = method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : method === 'bizum' ? 'Bizum' : 'Transfer.'
                      return (
                        <Button key={method} variant="outline" size="sm" className="gap-1.5 rounded-lg border-slate-300" onClick={() => {
                          const amount = Math.min(Math.max(0, parseFloat(String(paymentAmountInput).replace(',', '.')) || 0), total)
                          if (amount >= 0.01) {
                            setPayments(prev => [...prev, { payment_method: method, amount }])
                          }
                        }}>
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </Button>
                      )
                    })}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                    <Checkbox checked={leaveAsPending} onCheckedChange={(c) => setLeaveAsPending(c === true)} />
                    Dejar resto como cobro pendiente
                  </label>
                  {leaveAsPending && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Fecha próximo cobro</Label>
                      <DatePickerPopover value={nextPaymentDate} onChange={(date) => setNextPaymentDate(date)} min={new Date().toISOString().split('T')[0]} />
                    </div>
                  )}
                  {payments.length > 0 && (
                    <div className="space-y-1">
                      {payments.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 bg-slate-100 rounded-lg text-sm border border-slate-200">
                          <span className="capitalize text-slate-700">{p.payment_method}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#1B2A4A]">{formatCurrency(p.amount)}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-600" onClick={() => setPayments(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button className="w-full h-12 rounded-xl bg-[#1B2A4A] hover:bg-[#243860] text-white font-bold disabled:opacity-40" disabled={isProcessing || (payments.length === 0 && !leaveAsPending)} onClick={() => handleProcessSale()}>
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                    Registrar cobro parcial
                  </Button>
                </>
              )}
            </div>
          )}

          <DialogFooter className="border-t bg-slate-50 px-6 py-4 flex-row justify-between">
            <Button variant="outline" className="rounded-lg border-slate-300" onClick={() => { setPayments([]); setShowPayment(false) }}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket completado: nº ticket, descargar PDF, nueva venta */}
      <Dialog open={showTicketModal} onOpenChange={(open) => !open && handleNewSale()}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-green-600" />
              Venta completada
            </DialogTitle>
          </DialogHeader>
          {completedSale && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Nº Ticket</p>
                <p className="text-xl font-mono font-bold text-slate-900 mt-0.5">{completedSale.ticket_number}</p>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <dt className="text-slate-600">Total cobrado</dt>
                  <dd className="font-semibold tabular-nums">{formatCurrency(completedSale.total)}</dd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <dt className="text-slate-600">Método de pago</dt>
                  <dd className="capitalize">{completedSale.payment_method === 'cash' ? 'Efectivo' : completedSale.payment_method === 'card' ? 'Tarjeta' : completedSale.payment_method}</dd>
                </div>
                {lastSaleSalespersonName && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <dt className="text-slate-600">Realizada por</dt>
                    <dd className="font-medium">{lastSaleSalespersonName}</dd>
                  </div>
                )}
                {selectedClientName && (
                  <div className="flex justify-between items-center py-2">
                    <dt className="text-slate-600">Cliente</dt>
                    <dd className="text-slate-800">{selectedClientName}</dd>
                  </div>
                )}
              </dl>
              {selectedClientName && (
                <p className="text-xs text-slate-500">Ticket guardado en el perfil del cliente</p>
              )}
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2 sm:flex-row border-t pt-4">
            <Button className="flex-1 min-w-[140px] gap-2 bg-prats-gold hover:bg-prats-gold/90 text-prats-navy font-semibold" onClick={handlePrintTicket}>
              <Printer className="h-4 w-4" />
              Imprimir ticket
            </Button>
            <Button variant="outline" className="flex-1 min-w-[140px] gap-2" onClick={handlePrintGiftTicket}>
              <Gift className="h-4 w-4" />
              Imprimir Regalo
            </Button>
            <Button variant="outline" className="flex-1 min-w-[140px] gap-2" onClick={handleDownloadTicketPdf}>
              <Receipt className="h-4 w-4" />
              Descargar ticket PDF
            </Button>
            <Button variant="outline" className="flex-1 min-w-[140px] gap-2" onClick={handleDownloadFactura} disabled={downloadingInvoice}>
              {downloadingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Descargar factura
            </Button>
            <Button className="flex-1 min-w-[140px] bg-prats-navy hover:bg-prats-navy-light" onClick={handleNewSale}>
              Nueva venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso a partir de las 21:00: ¿Quieres cerrar ya la caja? */}
      <Dialog open={showCloseReminderDialog} onOpenChange={(open) => !open && dismissCloseReminder()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Son más de las 21:00
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            ¿Quieres cerrar ya la caja?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => dismissCloseReminder()}>
              Más tarde
            </Button>
            <Button className="bg-prats-navy hover:bg-prats-navy-light gap-2" onClick={() => { setShowCloseReminderDialog(false); onCloseCash() }}>
              <Lock className="h-4 w-4" />
              Sí, cerrar caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Dialog */}
      <WithdrawalDialog open={showWithdrawal} onOpenChange={setShowWithdrawal} sessionId={session.id} />

      {/* Reservation Dialog */}
      <ReservationDialog
        open={showReservationDialog}
        onOpenChange={setShowReservationDialog}
        storeId={activeStoreId}
        cashSessionId={session.id}
        storeName={activeStoreName}
        attendedBy={profile?.fullName || profile?.email || null}
        defaultClientId={selectedClientId}
        defaultClientName={selectedClientName}
        onAddReservationToTicket={addReservationPickup}
      />
    </div>
  )
}

function WithdrawalDialog({ open, onOpenChange, sessionId }: { open: boolean; onOpenChange: (v: boolean) => void; sessionId: string }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const { execute, isLoading } = useAction(cashWithdrawal, {
    successMessage: 'Retirada registrada',
    onSuccess: () => { onOpenChange(false); setAmount(''); setReason('') },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Retirada de efectivo</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Importe (&euro;)</label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg h-12 text-center font-mono" autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo *</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: Compra de material, cambio..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => execute({ session_id: sessionId, amount: parseFloat(amount) || 0, reason })}
            disabled={isLoading || !amount || !reason} className="bg-prats-navy hover:bg-prats-navy-light">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Registrar retirada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
