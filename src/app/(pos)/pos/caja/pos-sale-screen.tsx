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
  LogOut, Clock, BarChart3, Loader2, Percent, UserPlus, CalendarClock, AlertCircle, Lock, Check,
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
  const integroSubmitRef = useRef(false)

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
  const [paymentTab, setPaymentTab] = useState<'integro' | 'mixto' | 'parcial'>('integro')

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
  const totalUnits = ticketLines.reduce((s, l) => s + l.quantity, 0)
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
      setPaymentTab('integro')
      integroSubmitRef.current = false
    }
    paymentDialogOpenedRef.current = !!showPayment
  }, [showPayment, remaining])

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
    lastPaymentsRef.current = paymentsToSend
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

  const totalCashInDrawer = (session?.opening_amount ?? 0) + sessionTotals.total_cash_sales - (session?.total_returns ?? 0) - (session?.total_withdrawals ?? 0)
  const clientDebtTotal = clientPendingDebt.reduce((s, i) => s + i.total_pending, 0)

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* FILA 1 — Cabecera */}
      <div className="bg-[#1B2A4A] h-14 px-5 flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] text-white/50 uppercase tracking-wider">ESTADO</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" aria-hidden />
            <span className="text-emerald-400 font-semibold text-base">Caja abierta</span>
          </div>
          {profile?.fullName && <span className="text-white/60 text-xs mt-0.5">{profile.fullName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 min-h-[44px] border border-slate-400/50 bg-slate-500/20 text-white font-medium hover:bg-slate-500/30 hover:text-white hover:border-slate-400"
            onClick={() => router.push('/admin/perfil')}
          >
            <User className="h-4 w-4" />
            Volver a mi perfil
          </Button>
          <Button size="sm" className="gap-1.5 min-h-[44px] bg-red-700 hover:bg-red-800 text-white font-medium border-0" onClick={onCloseCash}>
            <Lock className="h-4 w-4" />
            Cerrar caja
          </Button>
        </div>
      </div>
      {/* FILA 2 — Totales */}
      <div className="bg-[#111d33] h-12 flex shrink-0">
        {[
          { label: 'VENTAS TOTAL', value: sessionTotals.total_sales },
          { label: 'EFECTIVO', value: totalCashInDrawer },
          { label: 'TARJETA', value: sessionTotals.total_card_sales },
          { label: 'BIZUM', value: sessionTotals.total_bizum_sales },
          { label: 'TRANSFERENCIA', value: sessionTotals.total_transfer_sales },
        ].map(({ label, value }) => (
          <div key={label} className="flex-1 flex flex-col items-center justify-center border-r border-slate-500/30 last:border-r-0">
            <span className="text-[10px] uppercase tracking-widest text-white/40">{label}</span>
            <span className="text-white font-bold text-sm tabular-nums">{formatCurrency(value ?? 0)}</span>
          </div>
        ))}
      </div>

      {/* BODY — 3 columnas */}
      <div className="flex-1 flex flex-row min-h-0">
        {/* COLUMNA IZQUIERDA */}
        <div className="w-52 bg-[#f5f5f5] border-r border-slate-200 flex flex-col overflow-y-auto shrink-0">
          <div className="p-4 border-b border-slate-200">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Cajero</p>
            <div className="w-full h-16 rounded-lg bg-[#4a6fa5] text-white text-2xl font-black flex items-center justify-center">
              {(profile?.fullName ?? 'AP').slice(0, 2).toUpperCase()}
            </div>
            <p className="text-xs text-slate-500 mt-2">F3 Venta</p>
            <p className="text-xs text-slate-500">F5 Ticket</p>
          </div>
          <div className="p-4 border-b border-slate-200">
            <p className="text-xs text-slate-500 mb-2">Tipo de venta</p>
            <Select value={saleType} onValueChange={(v) => { if (v === 'manual') { addManualLine(); setSaleType('boutique') } else setSaleType(v) }}>
              <SelectTrigger className="w-full border border-slate-200 rounded-md h-9 text-sm bg-slate-200 text-slate-800">
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
              <div className="rounded-lg bg-slate-200 border border-slate-300 p-2.5">
                <p className="text-sm font-medium text-slate-800 truncate">{selectedClientName}</p>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-600 font-medium hover:text-slate-800 hover:bg-slate-300 mt-1" onClick={() => { setSelectedClientId(null); setSelectedClientName('') }}>Cambiar</Button>
              </div>
            )}
            {clientDebtLoading && selectedClientId && <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Comprobando...</div>}
            {!clientDebtLoading && clientPendingDebt.length > 0 && selectedClientId && <p className="text-amber-700 text-xs mt-1">Pendiente: {formatCurrency(clientDebtTotal)}</p>}
          </div>
          <div className="p-4 border-b border-slate-200">
            <label className="flex flex-col gap-1 cursor-pointer rounded-lg bg-slate-200 border border-slate-300 px-3 py-2.5">
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
              placeholder="Escanea código de barras o busca producto..."
              className="h-12 pl-10 text-sm border-0 rounded-none focus:ring-0 bg-slate-100 placeholder:text-slate-500 text-slate-800"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-slate-400" />}
          </div>
          {searchResults.length > 0 && (
            <div className="bg-white border-b border-slate-200 max-h-48 overflow-y-auto shrink-0">
              {searchResults.map((v: any) => {
                const stock = Array.isArray(v.stock_levels) ? (v.stock_levels[0]?.available ?? 0) : (v.stock_levels?.[0]?.available || 0)
                const price = v.price_override ?? v.products?.base_price ?? 0
                const name = v.products?.name ?? ''
                return (
                  <button key={v.id} type="button" className="w-full flex justify-between px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-200 last:border-b-0 text-left disabled:opacity-60" onClick={() => stock > 0 && addToTicket(v)} disabled={stock <= 0}>
                    <span className="text-sm font-medium text-slate-800 truncate">{name}</span>
                    <span className="text-xs text-slate-400 shrink-0 ml-2">{v.variant_sku}</span>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums shrink-0 ml-2">{formatCurrency(price)}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="bg-red-700 text-white text-xs uppercase tracking-wide px-4 py-2.5 shrink-0 grid grid-cols-[48px_90px_1fr_40px_1fr_90px_56px_80px_40px] gap-2 items-center">
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
                const lineTotal = line.unit_price * line.quantity * (1 - (line.discount_percentage || 0) / 100) * (1 + (line.tax_rate || 21) / 100)
                const pvpConIva = line.unit_price * (1 + (line.tax_rate || 21) / 100)
                const ivaIncl = line.unit_price * ((line.tax_rate || 21) / 100)
                return (
                <div key={line.id} className="group flex px-4 py-2 border-b border-slate-200 hover:bg-slate-50 items-center gap-3 text-sm grid grid-cols-[48px_90px_1fr_40px_1fr_90px_56px_80px_40px] gap-2">
                  <div className="flex items-center gap-0">
                    <Button variant="ghost" size="icon" className="rounded-full w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-600" onClick={() => updateLine(line.id, 'quantity', Math.max(1, line.quantity - 1))}><Minus className="h-2.5 w-2.5" /></Button>
                    <span className="w-5 text-center text-xs tabular-nums text-slate-700">{line.quantity}</span>
                    <Button variant="ghost" size="icon" className="rounded-full w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-600" onClick={() => updateLine(line.id, 'quantity', line.quantity + 1)}><Plus className="h-2.5 w-2.5" /></Button>
                  </div>
                  <span className="text-slate-500 text-xs truncate">{line.sku || '—'}</span>
                  <div className="min-w-0">
                    {line.product_variant_id ? <p className="font-medium truncate text-slate-800">{line.description}</p> : <Input value={line.description} onChange={(e) => updateLine(line.id, 'description', e.target.value)} className="h-7 text-sm border-slate-200 placeholder:text-slate-400" placeholder="Artículo..." />}
                  </div>
                  <span className="text-slate-400 text-xs">—</span>
                  <div className="min-w-0"><span className="text-xs text-slate-400 truncate">—</span></div>
                  <div className="text-slate-700 text-xs">
                    {line.product_variant_id ? (
                      <div>
                        <span className="tabular-nums font-medium">{formatCurrency(pvpConIva)}</span>
                        <p className="text-slate-500 text-[10px] mt-0.5">IVA incl. {formatCurrency(ivaIncl)}</p>
                      </div>
                    ) : (
                      <Input type="number" step="0.01" value={line.unit_price || ''} onChange={(e) => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)} className="h-6 w-14 text-xs text-right border-slate-200" />
                    )}
                  </div>
                  <Input type="number" min={0} max={100} value={line.discount_percentage || ''} onChange={(e) => updateLine(line.id, 'discount_percentage', parseFloat(e.target.value) || 0)} className="h-6 w-12 text-xs text-center rounded border-slate-200" />
                  <span className="text-slate-800 font-medium tabular-nums text-xs">{formatCurrency(lineTotal)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-700" onClick={() => removeLine(line.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )})}
            </div>
            <div className="border-t border-slate-200 px-4 py-2.5 bg-slate-100 text-xs text-slate-500 shrink-0">
              {ticketLines.length} líneas | {totalUnits} unidades | Total: {formatCurrency(total)}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div className="w-64 bg-[#f5f5f5] border-l border-slate-200 flex flex-col p-4 gap-4 shrink-0 overflow-y-auto">
          <div className="bg-[#4a6fa5] rounded-xl p-4 text-white shrink-0">
            <p className="text-xs uppercase tracking-widest text-slate-200">TOTAL A COBRAR</p>
            <p className="text-4xl font-black text-center mt-1 tabular-nums">{formatCurrency(total)}</p>
          </div>
          <div className="space-y-3 rounded-lg bg-slate-200 p-3 border border-slate-300">
            <p className="text-sm text-slate-600">Tarifa CT: 1</p>
            <div>
              <Label className="text-sm text-slate-500">% Descuento</Label>
              <Input type="number" min={0} max={100} value={globalDiscount || ''} onChange={(e) => setGlobalDiscount(parseFloat(e.target.value) || 0)} className="w-full h-9 mt-1 border-slate-300 bg-slate-200 text-slate-800 placeholder:text-slate-500" />
            </div>
          </div>
          <div className="flex-1" />
        </div>
      </div>

      {/* Barra inferior azul — Resumen, Devoluciones, Retirada efectivo + PAGAR */}
      <div className="bg-[#1B2A4A] h-14 px-4 flex items-center justify-between shrink-0 border-t border-slate-500/30">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-2 text-white hover:bg-white/10 min-h-[44px]" onClick={() => router.push('/pos/resumen')}>
            <BarChart3 className="h-5 w-5" />
            <span className="text-sm font-medium">Resumen</span>
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 text-white hover:bg-white/10 min-h-[44px]" onClick={() => router.push('/pos/devoluciones')}>
            <ArrowRightLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Devoluciones</span>
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 text-white hover:bg-white/10 min-h-[44px]" onClick={() => setShowWithdrawal(true)}>
            <Banknote className="h-5 w-5" />
            <span className="text-sm font-medium">Retirada efectivo</span>
          </Button>
        </div>
        <Button
          onClick={() => { if (ticketLines.length === 0) { toast.error('Ticket vacío'); return } if (!canCobrar) { toast.error('Selecciona un cliente o activa "Venta sin cliente"'); return } setShowPayment(true) }}
          disabled={!canCobrar || ticketLines.length === 0}
          className="gap-2 h-12 px-6 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg min-h-[44px] disabled:opacity-50"
        >
          <Check className="h-5 w-5" />
          <span>PAGAR</span>
          <span className="text-xs font-normal opacity-80">(F2)</span>
        </Button>
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

      {/* Payment Dialog — 3 tabs */}
      <Dialog open={showPayment} onOpenChange={(open) => { setShowPayment(open); if (!open) { setPayments([]); setWantPartialPayment(false); setPaymentTab('integro') } }}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-[#1B2A4A]">Cobrar {formatCurrency(total)}</DialogTitle>
          </DialogHeader>
          <Tabs value={paymentTab} onValueChange={(v) => setPaymentTab(v as 'integro' | 'mixto' | 'parcial')}>
            <TabsList className="bg-slate-100 rounded-xl p-1 w-full grid grid-cols-3">
              <TabsTrigger value="integro" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#1B2A4A] data-[state=active]:font-semibold data-[state=inactive]:text-slate-500 text-xs">
                COBRO ÍNTEGRO
              </TabsTrigger>
              <TabsTrigger value="mixto" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#1B2A4A] data-[state=active]:font-semibold data-[state=inactive]:text-slate-500 text-xs">
                PAGO MIXTO
              </TabsTrigger>
              <TabsTrigger value="parcial" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#1B2A4A] data-[state=active]:font-semibold data-[state=inactive]:text-slate-500 text-xs">
                COBRO PARCIAL
              </TabsTrigger>
            </TabsList>
            <TabsContent value="integro" className="space-y-4 pt-4">
              <p className="text-2xl font-bold text-center text-[#1B2A4A]">{formatCurrency(total)}</p>
              <p className="text-sm text-slate-500 text-center">Total a cobrar</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { method: 'cash' as const, label: 'Efectivo', icon: Banknote, hoverIcon: 'hover:text-emerald-600' },
                  { method: 'card' as const, label: 'Tarjeta', icon: CreditCard, hoverIcon: 'hover:text-blue-600' },
                  { method: 'bizum' as const, label: 'Bizum', icon: Smartphone, hoverIcon: 'hover:text-purple-600' },
                  { method: 'transfer' as const, label: 'Transferencia', icon: ArrowRightLeft, hoverIcon: 'hover:text-amber-600' },
                ] as const).map(({ method, label, icon: Icon, hoverIcon }) => (
                  <Button
                    key={method}
                    variant="outline"
                    className={`h-20 rounded-2xl flex-col gap-2 border-2 border-transparent hover:border-[#1B2A4A]/20 hover:bg-slate-50 bg-white ${hoverIcon}`}
                    onClick={() => {
                      setPayments([{ payment_method: method, amount: total }])
                      integroSubmitRef.current = true
                    }}
                  >
                    <Icon className="h-7 w-7 transition-colors" />
                    <span className="text-sm font-medium">{label}</span>
                  </Button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="mixto" className="space-y-4 pt-4">
              <div className="flex gap-2 items-center">
                <Label className="text-sm shrink-0">Importe (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  className="h-9 w-24 font-mono"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(['cash', 'card', 'bizum', 'transfer'] as const).map((method) => {
                  const Icon = method === 'cash' ? Banknote : method === 'card' ? CreditCard : method === 'bizum' ? Smartphone : ArrowRightLeft
                  const label = method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : method === 'bizum' ? 'Bizum' : 'Transfer.'
                  return (
                    <Button
                      key={method}
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        const amount = Math.min(Math.max(0, parseFloat(String(paymentAmountInput).replace(',', '.')) || 0), remaining)
                        if (amount >= 0.01) {
                          setPayments(prev => [...prev, { payment_method: method, amount }])
                          setPaymentAmountInput((remaining - amount).toFixed(2))
                        }
                      }}
                    >
                      <Icon className="h-3 w-3" /> +{label}
                    </Button>
                  )
                })}
              </div>
              {payments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Pagos aplicados</p>
                  {payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-100 rounded-lg">
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
              <div className="space-y-1">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${total > 0 ? Math.min(100, (totalPaid / total) * 100) : 0}%` }} />
                </div>
                <p className="text-xs text-center text-slate-500">
                  Cubierto {formatCurrency(totalPaid)} / Pendiente {formatCurrency(remaining)}€
                </p>
              </div>
              <Button
                className="w-full h-12 rounded-xl bg-[#1B2A4A] hover:bg-[#243860] text-white font-bold disabled:opacity-40"
                disabled={remaining > 0.01 || isProcessing}
                onClick={handleProcessSale}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                Completar venta
              </Button>
            </TabsContent>
            <TabsContent value="parcial" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="text-sm">Importe a cobrar ahora (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={total}
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  placeholder={total.toFixed(2)}
                  className="text-lg font-mono h-11"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(['cash', 'card', 'bizum', 'transfer'] as const).map((method) => {
                  const Icon = method === 'cash' ? Banknote : method === 'card' ? CreditCard : method === 'bizum' ? Smartphone : ArrowRightLeft
                  const label = method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : method === 'bizum' ? 'Bizum' : 'Transfer.'
                  return (
                    <Button
                      key={method}
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        const amount = Math.min(Math.max(0, parseFloat(String(paymentAmountInput).replace(',', '.')) || 0), total)
                        if (amount >= 0.01) {
                          setPayments(prev => [...prev, { payment_method: method, amount }])
                        }
                      }}
                    >
                      <Icon className="h-3 w-3" /> {label}
                    </Button>
                  )
                })}
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={leaveAsPending} onCheckedChange={(c) => setLeaveAsPending(c === true)} />
                <span>Dejar resto como cobro pendiente</span>
              </label>
              {leaveAsPending && (
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4" />
                    Fecha próximo cobro
                  </Label>
                  <DatePickerPopover
                    value={nextPaymentDate}
                    onChange={(date) => setNextPaymentDate(date)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              )}
              {payments.length > 0 && (
                <div className="space-y-1">
                  {payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-100 rounded-lg text-sm">
                      <span className="capitalize">{p.payment_method}</span>
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
              <Button
                className="w-full h-12 rounded-xl bg-[#1B2A4A] hover:bg-[#243860] text-white font-bold disabled:opacity-40"
                disabled={payments.length === 0 || isProcessing}
                onClick={() => handleProcessSale()}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                Registrar cobro parcial
              </Button>
            </TabsContent>
          </Tabs>
          <DialogFooter className="sm:justify-start pt-2">
            <Button variant="outline" onClick={() => { setPayments([]); setShowPayment(false) }}>
              Cancelar
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
                <p className="text-sm font-medium text-slate-600">Nº Ticket</p>
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
                <p className="text-xs text-slate-600">Cliente: {selectedClientName} · Ticket guardado en su perfil</p>
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
