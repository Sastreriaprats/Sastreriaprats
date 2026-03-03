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
  LogOut, Clock, BarChart3, Loader2, Percent, UserPlus, CalendarClock, AlertCircle, Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import { searchProductsForPos, createSale, cashWithdrawal } from '@/actions/pos'
import { addOrderPayment, addSalePayment, getClientPendingDebt } from '@/actions/payments'
import { getProductByBarcode } from '@/actions/products'
import { listClients, createClientAction } from '@/actions/clients'
import { formatCurrency } from '@/lib/utils'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'
import { createInvoiceFromSaleAction, generateInvoicePdfAction } from '@/actions/accounting'

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
  image_url?: string
}

interface Payment {
  payment_method: 'cash' | 'card' | 'bizum' | 'transfer' | 'voucher'
  amount: number
  reference?: string
  voucher_id?: string
  next_payment_date?: string | null
}

export function PosSaleScreen({ session, onCloseCash, initialCobro }: { session: any; onCloseCash: () => void; initialCobro?: { entity_type: 'tailoring_order' | 'sale'; entity_id: string; amount: number; client_id: string; client_name: string; reference: string } | null }) {
  const router = useRouter()
  const { profile, activeStoreId, stores } = useAuth()
  const activeStoreName = stores.find((s) => s.storeId === activeStoreId)?.storeName ?? 'Caja'
  const searchRef = useRef<HTMLInputElement>(null)
  const barcodeBufferRef = useRef({ digits: '', firstAt: 0 })
  const scannerInputRef = useRef<HTMLInputElement>(null)
  const appliedCobroRef = useRef(false)
  const cobroContextRef = useRef<{ entity_type: 'tailoring_order' | 'sale'; entity_id: string } | null>(null)
  const cobroPaymentMethodRef = useRef<'cash' | 'card' | 'bizum' | 'transfer' | 'voucher'>('cash')

  const [ticketLines, setTicketLines] = useState<TicketLine[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedClientName, setSelectedClientName] = useState('')
  const [saleType, setSaleType] = useState<string>('boutique')
  const [globalDiscount, setGlobalDiscount] = useState(0)
  const [isTaxFree, setIsTaxFree] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showWithdrawal, setShowWithdrawal] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [completedSale, setCompletedSale] = useState<any | null>(null)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [saleWithoutClient, setSaleWithoutClient] = useState(false)
  const [showClientDialog, setShowClientDialog] = useState(false)
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [clientSearchResults, setClientSearchResults] = useState<any[]>([])
  const [clientSearching, setClientSearching] = useState(false)
  const [clientTab, setClientTab] = useState<'search' | 'new'>('search')
  const [newClientForm, setNewClientForm] = useState({ first_name: '', last_name: '', phone: '', email: '' })
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const [leaveAsPending, setLeaveAsPending] = useState(false)
  const [nextPaymentDate, setNextPaymentDate] = useState('')
  const [wantPartialPayment, setWantPartialPayment] = useState(false)
  const [downloadingInvoice, setDownloadingInvoice] = useState(false)
  const [clientPendingDebt, setClientPendingDebt] = useState<Array<{ entity_type: string; reference: string; total_pending: number }>>([])
  const [clientDebtLoading, setClientDebtLoading] = useState(false)
  const [showCloseReminderDialog, setShowCloseReminderDialog] = useState(false)

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

  // Escáner de códigos de barras: 13 dígitos en menos de 200ms → búsqueda por EAN-13
  useEffect(() => {
    const input = document.getElementById('pos-barcode-scanner') as HTMLInputElement | null
    if (!input) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const { digits, firstAt } = barcodeBufferRef.current
        const elapsed = Date.now() - firstAt
        if (digits.length === 13 && elapsed < 200) {
          e.preventDefault()
          barcodeBufferRef.current = { digits: '', firstAt: 0 }
          getProductByBarcode({ barcode: digits, storeId: activeStoreId ?? undefined }).then((result) => {
            if (result.success && result.data && result.data.variant) {
              addToTicket(result.data.variant)
              scannerInputRef.current?.focus()
            } else {
              toast.error('Producto no encontrado')
            }
          }).catch(() => toast.error('Producto no encontrado'))
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

    input.addEventListener('keydown', handleKeyDown)
    return () => input.removeEventListener('keydown', handleKeyDown)
  }, [activeStoreId])

  // Pre-cargar cobro pendiente desde /sastre/cobros → /pos/caja?cobro=...
  useEffect(() => {
    if (!initialCobro || appliedCobroRef.current) return
    appliedCobroRef.current = true
    cobroContextRef.current = { entity_type: initialCobro.entity_type, entity_id: initialCobro.entity_id }
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
    }])
    setSaleType(initialCobro.entity_type === 'tailoring_order' ? 'tailoring_final' : 'boutique')
    router.replace('/pos/caja')
  }, [initialCobro, router])

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

  const subtotal = ticketLines.reduce((sum, l) => {
    const lineDiscount = l.unit_price * l.quantity * (l.discount_percentage / 100)
    return sum + (l.unit_price * l.quantity - lineDiscount)
  }, 0)
  const globalDiscountAmount = subtotal * (globalDiscount / 100)
  const taxableAmount = subtotal - globalDiscountAmount
  const taxAmount = isTaxFree ? 0 : taxableAmount * 0.21
  const total = taxableAmount + taxAmount
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = total - totalPaid
  const change = totalPaid > total ? totalPaid - total : 0
  const canCobrar = ticketLines.length > 0 && (!!selectedClientId || saleWithoutClient)

  const addToTicket = (variant: any) => {
    const existing = ticketLines.find(l => l.product_variant_id === variant.id)
    if (existing) {
      setTicketLines(prev => prev.map(l =>
        l.product_variant_id === variant.id ? { ...l, quantity: l.quantity + 1 } : l
      ))
    } else {
      const price = variant.price_override || variant.products.base_price
      setTicketLines(prev => [...prev, {
        id: crypto.randomUUID(),
        product_variant_id: variant.id,
        description: `${variant.products.name}${variant.size ? ` T.${variant.size}` : ''}${variant.color ? ` ${variant.color}` : ''}`,
        sku: variant.variant_sku,
        quantity: 1,
        unit_price: price,
        discount_percentage: 0,
        tax_rate: variant.products.tax_rate || 21,
        cost_price: variant.products.cost_price || 0,
        image_url: variant.products.main_image_url,
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
      tax_rate: 21,
      cost_price: 0,
    }])
  }

  const updateLine = (id: string, field: string, value: any) => {
    setTicketLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  const removeLine = (id: string) => setTicketLines(prev => prev.filter(l => l.id !== id))

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
    }
    paymentDialogOpenedRef.current = !!showPayment
  }, [showPayment, remaining])

  const { execute: submitSale, isLoading: isProcessing } = useAction(createSale, {
    successMessage: 'Venta completada',
    onSuccess: async (data) => {
      setShowPayment(false)
      setCompletedSale(data)
      setShowTicketModal(true)
      const ctx = cobroContextRef.current
      if (ctx && data?.total != null) {
        cobroContextRef.current = null
        const method = cobroPaymentMethodRef.current
        const orderMethod = method === 'bizum' || method === 'voucher' ? 'card' : (method === 'cash' || method === 'card' || method === 'transfer' ? method : 'cash')
        const today = new Date().toISOString().split('T')[0]
        const amountToRegister = Number(data.amount_paid ?? data.total ?? 0)
        try {
          if (ctx.entity_type === 'tailoring_order') {
            const res = await addOrderPayment({
              tailoring_order_id: ctx.entity_id,
              payment_date: today,
              payment_method: orderMethod,
              amount: amountToRegister,
            })
            if (res?.success !== true) toast.error(res && 'error' in res ? res.error : 'Error al registrar pago en pedido')
          } else {
            const res = await addSalePayment({
              sale_id: ctx.entity_id,
              payment_method: orderMethod,
              amount: amountToRegister,
            })
            if (res?.success !== true) toast.error(res && 'error' in res ? res.error : 'Error al registrar pago en venta')
          }
        } catch (e) {
          console.error('[POS] registrar pago cobro:', e)
          toast.error('Error al registrar el pago en el pedido/venta')
        }
      }
    },
  })

  const { execute: createClient, isLoading: isCreatingClient } = useAction(createClientAction, {
    onSuccess: (data) => {
      if (data?.id) {
        const name = data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim()
        setSelectedClientId(data.id)
        setSelectedClientName(name)
        setShowClientDialog(false)
        setClientTab('search')
        setNewClientForm({ first_name: '', last_name: '', phone: '', email: '' })
        setClientSearchQuery('')
        setClientSearchResults([])
        toast.success('Cliente creado y asignado a la venta')
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
    await generateTicketPdf({
      sale: {
        ticket_number: completedSale.ticket_number,
        created_at: completedSale.created_at,
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
      })),
      payments,
      clientName: selectedClientName || null,
      clientCode: null,
    })
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
    const usePartialFromInput = leaveAsPending && payments.length === 0 && partialAmountFromInput >= 0.01
    const allowedPartial = (leaveAsPending && payments.length > 0) || usePartialFromInput
    if (!hasEnough && !allowedPartial) {
      toast.error('Completa el pago o marca "Dejar pendiente" e indica el importe a cobrar ahora')
      return
    }
    cobroPaymentMethodRef.current = payments[0]?.payment_method ?? 'cash'
    let paymentsToSend: Payment[] = [...payments]
    if (usePartialFromInput) {
      paymentsToSend = [{ payment_method: 'cash', amount: partialAmountFromInput }]
    }
    if (leaveAsPending && nextPaymentDate && paymentsToSend.length > 0) {
      const last = paymentsToSend[paymentsToSend.length - 1]
      paymentsToSend[paymentsToSend.length - 1] = { ...last, next_payment_date: nextPaymentDate }
    }
    submitSale({
      sale: {
        cash_session_id: session.id,
        store_id: activeStoreId,
        client_id: saleWithoutClient ? null : selectedClientId,
        sale_type: saleType,
        discount_percentage: globalDiscount,
        is_tax_free: isTaxFree,
        notes: saleWithoutClient ? 'Venta sin cliente' : null,
      },
      lines: ticketLines.map(l => ({
        product_variant_id: l.product_variant_id,
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

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Barra superior: estado de caja muy visible + volver + cerrar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 bg-[#1B2A4A] text-white shrink-0 shadow-md border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 ring-2 ring-emerald-400/50">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" title="Caja abierta" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">Estado</span>
            <span className="text-base font-semibold tracking-tight text-emerald-300">Caja abierta</span>
            {activeStoreName && (
              <span className="text-xs text-white/70 mt-0.5" title="Tienda actual">{activeStoreName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white border-white/30 font-medium"
            onClick={() => router.push('/admin/perfil')}
          >
            <User className="h-4 w-4" />
            Volver a mi perfil
          </Button>
          <Button
            size="sm"
            className="gap-2 h-9 rounded-lg bg-red-800 hover:bg-red-700 text-white border-0 font-medium shadow-lg shadow-red-900/30"
            onClick={onCloseCash}
          >
            <Lock className="h-4 w-4" />
            Cerrar caja
          </Button>
        </div>
      </div>

    <div className="flex flex-1 min-h-0">
      {/* Left sidebar */}
      <div className="w-[8.25rem] bg-[#1B2A4A] flex flex-col py-4 gap-1 shrink-0 shadow-lg overflow-y-auto min-h-0">
        <div className="text-white/40 text-[10px] font-semibold tracking-[0.2em] mb-4 pl-1 pr-1" style={{ writingMode: 'vertical-rl' }}>PRATS</div>
        <div className="w-full pl-1 pr-2 flex flex-col gap-1">
          <Button variant="ghost" className="w-full justify-start gap-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg h-10 pl-2 pr-2" title="Resumen" onClick={() => router.push('/pos/resumen')}>
            <BarChart3 className="h-5 w-5 shrink-0" />
            <span className="text-xs font-medium whitespace-nowrap">Resumen</span>
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg h-10 pl-2 pr-2" title="Devoluciones" onClick={() => router.push('/pos/devoluciones')}>
            <ArrowRightLeft className="h-5 w-5 shrink-0" />
            <span className="text-xs font-medium whitespace-nowrap">Devoluciones</span>
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg h-10 pl-2 pr-2" title="Retirada efectivo" onClick={() => setShowWithdrawal(true)}>
            <Banknote className="h-5 w-5 shrink-0" />
            <span className="text-xs font-medium whitespace-nowrap">Retirada efectivo</span>
          </Button>
        </div>
      </div>

      {/* Center - Product search */}
      <div className="flex-1 flex flex-col p-5 overflow-hidden bg-white rounded-tl-2xl shadow-sm border-l border-slate-200/80">
        <div className="relative mb-5">
          <input
            ref={scannerInputRef}
            id="pos-barcode-scanner"
            type="text"
            autoComplete="off"
            className="absolute w-px h-px opacity-0 pointer-events-none left-0 top-0"
            tabIndex={-1}
            aria-hidden
          />
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchRef}
            placeholder="Escanea código de barras o busca producto..."
            className="pl-12 h-14 text-base rounded-xl border-slate-200 focus:ring-2 focus:ring-[#1B2A4A]/15 focus:border-[#1B2A4A] bg-slate-50/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {isSearching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-slate-400" />}
        </div>

        {searchResults.length > 0 ? (
          <ScrollArea className="flex-1 -mx-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-stretch pr-2">
              {searchResults.map((v: any) => {
                const stock = Array.isArray(v.stock_levels) ? (v.stock_levels[0]?.available ?? 0) : (v.stock_levels?.[0]?.available || 0)
                const price = v.price_override ?? v.products?.base_price ?? 0
                const name = v.products?.name ?? ''
                const img = v.products?.main_image_url
                return (
                  <Card
                    key={v.id}
                    className={`cursor-pointer hover:shadow-md transition-shadow overflow-hidden flex flex-col h-full ${stock <= 0 ? 'opacity-60' : ''}`}
                    onClick={() => stock > 0 && addToTicket(v)}
                  >
                    <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                      <div className="aspect-square bg-muted relative shrink-0">
                        {img ? (
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                            <ShoppingBag className="h-10 w-10" />
                          </div>
                        )}
                      </div>
                      <div className="p-3 flex flex-col flex-1 min-h-0">
                        <p className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]" title={name}>{name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.variant_sku}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {v.size && <Badge variant="secondary" className="text-[10px] font-normal">T.{v.size}</Badge>}
                          {v.color && <Badge variant="outline" className="text-[10px] font-normal">{v.color}</Badge>}
                        </div>
                        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-border/50">
                          <span className="font-semibold text-sm tabular-nums">{formatCurrency(price)}</span>
                          <span className={`text-xs tabular-nums shrink-0 ${stock <= 0 ? 'text-destructive' : stock <= 2 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            Stock {stock}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <ShoppingBag className="mx-auto h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg">Escanea o busca un producto</p>
              <p className="text-sm mt-1">Usa el lector de códigos o escribe nombre/SKU</p>
            </div>
          </div>
        )}
      </div>

      {/* Right - Ticket */}
      <div className="w-[380px] bg-white border-l border-slate-200/80 flex flex-col shadow-lg shrink-0">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Select value={saleType} onValueChange={setSaleType}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="boutique">Boutique</SelectItem>
                  <SelectItem value="tailoring_deposit">Señal sastrería</SelectItem>
                  <SelectItem value="tailoring_final">Pago final</SelectItem>
                  <SelectItem value="alteration">Arreglo</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={addManualLine}>
                <Plus className="h-3 w-3" /> Manual
              </Button>
            </div>
            <Badge variant="outline" className="text-xs"><Clock className="h-3 w-3 mr-1" />{profile?.fullName?.split(' ')[0]}</Badge>
          </div>
          {selectedClientName ? (
            <div className="flex items-center justify-between p-2 bg-blue-50 rounded text-sm">
              <span className="flex items-center gap-1"><User className="h-3 w-3" />{selectedClientName}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedClientId(null); setSelectedClientName('') }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs gap-1 h-8" onClick={() => setShowClientDialog(true)}>
              <User className="h-3 w-3" /> Asignar cliente
            </Button>
          )}
          {clientDebtLoading && selectedClientId && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Loader2 className="h-3 w-3 animate-spin" /> Comprobando cobros pendientes...</p>
          )}
          {!clientDebtLoading && clientPendingDebt.length > 0 && (
            <div className="mt-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm">
              <p className="font-medium text-amber-800 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Este cliente tiene pendiente de cobro
              </p>
              <ul className="mt-2 space-y-1 text-amber-900">
                {clientPendingDebt.map((item, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {item.entity_type === 'tailoring_order' ? 'Pedido sastrería' : 'Venta'} {item.reference}:
                    </span>
                    <span className="font-medium">{formatCurrency(item.total_pending)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 pt-2 border-t border-amber-200 text-amber-900 font-medium">
                Total pendiente: {formatCurrency(clientPendingDebt.reduce((s, i) => s + i.total_pending, 0))}
              </p>
              <p className="text-xs text-amber-700 mt-1">Puedes cobrar esta venta con normalidad. Para registrar un cobro del pendiente, ve a Cobros pendientes.</p>
            </div>
          )}
          <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-muted-foreground">
            <Checkbox
              checked={saleWithoutClient}
              onCheckedChange={(checked) => setSaleWithoutClient(checked === true)}
            />
            <span>Venta sin cliente (excepcional)</span>
          </label>
          {saleWithoutClient && (
            <p className="text-xs text-amber-600 mt-1">Esta venta no se guardará en ningún perfil de cliente</p>
          )}
        </div>

        <ScrollArea className="flex-1 p-4">
          {ticketLines.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Ticket vacío</p>
          ) : (
            <div className="space-y-3">
              {ticketLines.map((line) => (
                <div key={line.id} className="flex gap-2 group">
                  <div className="flex-1 min-w-0">
                    {line.product_variant_id ? (
                      <p className="text-sm font-medium truncate">{line.description}</p>
                    ) : (
                      <Input value={line.description} onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                        className="h-7 text-sm" placeholder="Descripción..." />
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center border rounded">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateLine(line.id, 'quantity', Math.max(1, line.quantity - 1))}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm">{line.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateLine(line.id, 'quantity', line.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground">&times;</span>
                      {line.product_variant_id ? (
                        <span className="text-sm">{formatCurrency(line.unit_price)}</span>
                      ) : (
                        <Input type="number" step="0.01" value={line.unit_price || ''} onChange={(e) => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="h-6 w-20 text-sm text-right" />
                      )}
                      {line.discount_percentage > 0 && <Badge variant="outline" className="text-xs">-{line.discount_percentage}%</Badge>}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className="text-sm font-medium">
                      {formatCurrency(line.unit_price * line.quantity * (1 - line.discount_percentage / 100))}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => removeLine(line.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-4 space-y-2">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          {globalDiscount > 0 && <div className="flex justify-between text-sm text-red-600"><span>Dto. {globalDiscount}%</span><span>-{formatCurrency(globalDiscountAmount)}</span></div>}
          {!isTaxFree && <div className="flex justify-between text-sm"><span>IVA 21%</span><span>{formatCurrency(taxAmount)}</span></div>}
          {isTaxFree && <div className="flex justify-between text-sm text-blue-600"><span>Tax Free</span><span>0,00 &euro;</span></div>}
          <Separator />
          <div className="flex justify-between text-xl font-bold"><span>TOTAL</span><span>{formatCurrency(total)}</span></div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => setGlobalDiscount(globalDiscount > 0 ? 0 : 10)}>
              <Percent className="h-3 w-3" /> {globalDiscount > 0 ? `Dto: ${globalDiscount}%` : 'Descuento'}
            </Button>
            <Button variant={isTaxFree ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setIsTaxFree(!isTaxFree)}>
              Tax Free
            </Button>
          </div>

          {!canCobrar && ticketLines.length > 0 && (
            <p className="text-sm text-amber-600 text-center">Selecciona un cliente para continuar</p>
          )}
          <Button onClick={() => { if (ticketLines.length === 0) { toast.error('Ticket vacío'); return }; if (!canCobrar) { toast.error('Selecciona un cliente o activa "Venta sin cliente"'); return }; setShowPayment(true) }}
            disabled={!canCobrar || ticketLines.length === 0}
            className="w-full h-14 text-lg bg-prats-navy hover:bg-prats-navy-light gap-2">
            <CreditCard className="h-5 w-5" /> Cobrar {formatCurrency(total)} <span className="text-xs opacity-70">(F2)</span>
          </Button>
        </div>
      </div>

      {/* Diálogo Asignar / Crear cliente */}
      <Dialog open={showClientDialog} onOpenChange={(open) => {
        setShowClientDialog(open)
        if (!open) {
          setClientTab('search')
          setClientSearchQuery('')
          setClientSearchResults([])
          setNewClientForm({ first_name: '', last_name: '', phone: '', email: '' })
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" /> Asignar cliente a la venta
            </DialogTitle>
          </DialogHeader>
          <Tabs value={clientTab} onValueChange={(v) => setClientTab(v as 'search' | 'new')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="search">Buscar cliente</TabsTrigger>
              <TabsTrigger value="new">Crear cliente nuevo</TabsTrigger>
            </TabsList>
            <TabsContent value="search" className="space-y-3 mt-3">
              <Input
                placeholder="Nombre, apellido o código..."
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
                className="h-9"
              />
              {clientSearching && (
                <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Buscando...
                </div>
              )}
              {!clientSearching && clientSearchQuery.length >= 2 && (
                <ScrollArea className="h-[220px] rounded border">
                  {clientSearchResults.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">Sin resultados</p>
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
                            {c.client_code && <span className="text-muted-foreground ml-2">({c.client_code})</span>}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              )}
              {clientSearchQuery.length < 2 && !clientSearching && (
                <p className="text-sm text-muted-foreground py-2">Escribe al menos 2 caracteres para buscar</p>
              )}
            </TabsContent>
            <TabsContent value="new" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nombre *</Label>
                  <Input
                    placeholder="Nombre"
                    value={newClientForm.first_name}
                    onChange={(e) => setNewClientForm((f) => ({ ...f, first_name: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Apellidos *</Label>
                  <Input
                    placeholder="Apellidos"
                    value={newClientForm.last_name}
                    onChange={(e) => setNewClientForm((f) => ({ ...f, last_name: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input
                  placeholder="Teléfono"
                  value={newClientForm.phone}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, phone: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={newClientForm.email}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, email: e.target.value }))}
                  className="h-9"
                />
              </div>
              <Button
                className="w-full gap-2 bg-prats-navy hover:bg-prats-navy-light"
                disabled={isCreatingClient || !newClientForm.first_name.trim() || !newClientForm.last_name.trim()}
                onClick={() => {
                  createClient({
                    first_name: newClientForm.first_name.trim(),
                    last_name: newClientForm.last_name.trim(),
                    email: newClientForm.email.trim() || undefined,
                    phone: newClientForm.phone.trim() || undefined,
                  })
                }}
              >
                {isCreatingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Crear y asignar a la venta
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={(open) => { setShowPayment(open); if (!open) { setPayments([]); setWantPartialPayment(false) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cobrar {formatCurrency(total)}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              {([
                { method: 'cash' as const, label: 'Efectivo', icon: Banknote, color: 'bg-green-50 hover:bg-green-100 border-green-200' },
                { method: 'card' as const, label: 'Tarjeta', icon: CreditCard, color: 'bg-blue-50 hover:bg-blue-100 border-blue-200' },
                { method: 'bizum' as const, label: 'Bizum', icon: Smartphone, color: 'bg-purple-50 hover:bg-purple-100 border-purple-200' },
                { method: 'transfer' as const, label: 'Transferencia', icon: ArrowRightLeft, color: 'bg-amber-50 hover:bg-amber-100 border-amber-200' },
              ] as const).map(({ method, label, icon: Icon, color }) => (
                <Button key={method} variant="outline" className={`h-16 flex-col gap-1 ${color}`}
                  onClick={() => { quickPay(method) }}>
                  <Icon className="h-5 w-5" /><span className="text-sm">{label}</span>
                </Button>
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm text-muted-foreground hover:text-foreground border border-dashed"
              onClick={() => setWantPartialPayment(!wantPartialPayment)}
            >
              ¿Quieres hacer un cobro parcial?
            </Button>

            {wantPartialPayment && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Importe a cobrar ahora (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={remaining}
                    value={paymentAmountInput}
                    onChange={(e) => setPaymentAmountInput(e.target.value)}
                    placeholder={remaining.toFixed(2)}
                    className="text-lg font-mono h-11"
                  />
                  <p className="text-xs text-muted-foreground">Máximo {formatCurrency(remaining)}. Elige el importe y pulsa el método de pago arriba.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={leaveAsPending}
                    onCheckedChange={(c) => setLeaveAsPending(c === true)}
                  />
                  <span>Dejar el resto como cobro pendiente</span>
                </label>
                {leaveAsPending && (
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4" />
                      Fecha próximo cobro (alarma si se pasa)
                    </Label>
                    <DatePickerPopover
                      value={nextPaymentDate}
                      onChange={(date) => setNextPaymentDate(date)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                )}
              </div>
            )}

            <Separator />

            {payments.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Pagos aplicados:</p>
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-sm capitalize">{p.payment_method}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatCurrency(p.amount)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPayments(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {remaining > 0.01 ? (
              <div className="p-3 bg-amber-50 rounded text-center">
                <p className="text-sm text-amber-700">Falta por cobrar</p>
                <p className="text-2xl font-bold text-amber-700">{formatCurrency(remaining)}</p>
              </div>
            ) : change > 0 ? (
              <div className="p-3 bg-green-50 rounded text-center">
                <p className="text-sm text-green-700">Cambio a devolver</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(change)}</p>
              </div>
            ) : payments.length > 0 ? (
              <div className="p-3 bg-green-50 rounded text-center">
                <p className="text-sm text-green-700">Pago completo</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayments([]); setShowPayment(false) }}>Cancelar</Button>
            <Button
              onClick={handleProcessSale}
              disabled={!canPressComplete}
              className="bg-prats-navy hover:bg-prats-navy-light"
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
              Completar venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket completado: nº ticket, descargar PDF, nueva venta */}
      <Dialog open={showTicketModal} onOpenChange={(open) => !open && handleNewSale()}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-green-600" />
              Venta completada
            </DialogTitle>
          </DialogHeader>
          {completedSale && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Nº Ticket</p>
                <p className="text-xl font-mono font-bold">{completedSale.ticket_number}</p>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total cobrado</span>
                <span className="font-semibold">{formatCurrency(completedSale.total)}</span>
              </div>
              <div className="flex justify-between text-sm capitalize">
                <span>Método de pago</span>
                <span>{completedSale.payment_method === 'cash' ? 'Efectivo' : completedSale.payment_method === 'card' ? 'Tarjeta' : completedSale.payment_method}</span>
              </div>
              {selectedClientName && (
                <p className="text-xs text-muted-foreground">Cliente: {selectedClientName} · Ticket guardado en su perfil</p>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto gap-2" onClick={handleDownloadTicketPdf}>
              <Receipt className="h-4 w-4" />
              Descargar ticket PDF
            </Button>
            <Button variant="outline" className="w-full sm:w-auto gap-2" onClick={handleDownloadFactura} disabled={downloadingInvoice}>
              {downloadingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Descargar factura
            </Button>
            <Button className="w-full sm:w-auto bg-prats-navy hover:bg-prats-navy-light" onClick={handleNewSale}>
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
          <p className="text-sm text-muted-foreground py-2">
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
    </div>
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
