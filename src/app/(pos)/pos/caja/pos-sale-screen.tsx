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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Search, X, Plus, Minus, Trash2, User, ShoppingBag, CreditCard,
  Banknote, Smartphone, ArrowRightLeft, Receipt,
  LogOut, Settings, Clock, BarChart3, Loader2, Percent,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import { searchProductsForPos, createSale, cashWithdrawal } from '@/actions/pos'
import { formatCurrency } from '@/lib/utils'

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
}

export function PosSaleScreen({ session, onCloseCash }: { session: any; onCloseCash: () => void }) {
  const router = useRouter()
  const { profile, activeStoreId } = useAuth()
  const searchRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const timeout = setTimeout(async () => {
      setIsSearching(true)
      const result = await searchProductsForPos({ query: searchQuery, storeId: activeStoreId! })
      if (result.success) setSearchResults(result.data)
      setIsSearching(false)
    }, 200)
    return () => clearTimeout(timeout)
  }, [searchQuery, activeStoreId])

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
    setPayments([{ payment_method: method, amount: total }])
  }

  const { execute: submitSale, isLoading: isProcessing } = useAction(createSale, {
    successMessage: 'Venta completada',
    onSuccess: () => {
      setTicketLines([]); setPayments([]); setSelectedClientId(null); setSelectedClientName('')
      setGlobalDiscount(0); setIsTaxFree(false); setShowPayment(false); setSaleType('boutique')
      searchRef.current?.focus()
    },
  })

  const handleProcessSale = () => {
    if (remaining > 0.01) { toast.error('Falta completar el pago'); return }
    submitSale({
      sale: {
        cash_session_id: session.id,
        store_id: activeStoreId,
        client_id: selectedClientId,
        sale_type: saleType,
        discount_percentage: globalDiscount,
        is_tax_free: isTaxFree,
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
      payments,
    })
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2' && ticketLines.length > 0) { e.preventDefault(); setShowPayment(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ticketLines])

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="w-14 bg-prats-navy flex flex-col items-center py-4 gap-3">
        <div className="text-white text-xs font-bold tracking-widest mb-4" style={{ writingMode: 'vertical-rl' }}>PRATS</div>
        <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10" title="Resumen" onClick={() => router.push('/pos/resumen')}>
          <BarChart3 className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10" title="Devoluciones" onClick={() => router.push('/pos/devoluciones')}>
          <ArrowRightLeft className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10" title="Retirada efectivo" onClick={() => setShowWithdrawal(true)}>
          <Banknote className="h-5 w-5" />
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10" title="Cerrar caja" onClick={onCloseCash}>
          <LogOut className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10" title="Volver al admin" onClick={() => router.push('/admin/dashboard')}>
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* Center - Product search */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchRef} placeholder="Escanea código de barras o busca producto... (nombre, SKU, EAN)"
            className="pl-10 h-12 text-lg" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
          {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin" />}
        </div>

        {searchResults.length > 0 ? (
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {searchResults.map((v: any) => {
                const stock = v.stock_levels?.[0]?.available || 0
                return (
                  <Card key={v.id} className={`cursor-pointer hover:shadow-md transition-shadow ${stock <= 0 ? 'opacity-50' : ''}`}
                    onClick={() => stock > 0 && addToTicket(v)}>
                    <CardContent className="p-3">
                      {v.products.main_image_url && (
                        <div className="aspect-square bg-gray-100 rounded mb-2 overflow-hidden">
                          <img src={v.products.main_image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <p className="font-medium text-sm truncate">{v.products.name}</p>
                      <p className="text-xs text-muted-foreground">{v.variant_sku}</p>
                      <div className="flex items-center justify-between mt-1">
                        <div>
                          {v.size && <Badge variant="outline" className="text-xs mr-1">T.{v.size}</Badge>}
                          {v.color && <Badge variant="outline" className="text-xs">{v.color}</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold">{formatCurrency(v.price_override || v.products.base_price)}</span>
                        <span className={`text-xs ${stock <= 0 ? 'text-red-500' : stock <= 2 ? 'text-amber-500' : 'text-green-600'}`}>
                          Stock: {stock}
                        </span>
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
      <div className="w-[380px] bg-white border-l flex flex-col">
        <div className="p-4 border-b">
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
            <Button variant="outline" size="sm" className="w-full text-xs gap-1 h-8"><User className="h-3 w-3" /> Asignar cliente</Button>
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

          <Button onClick={() => { if (ticketLines.length === 0) { toast.error('Ticket vacío'); return }; setShowPayment(true) }}
            disabled={ticketLines.length === 0}
            className="w-full h-14 text-lg bg-prats-navy hover:bg-prats-navy-light gap-2">
            <CreditCard className="h-5 w-5" /> Cobrar {formatCurrency(total)} <span className="text-xs opacity-70">(F2)</span>
          </Button>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
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
            <Button onClick={handleProcessSale} disabled={isProcessing || remaining > 0.01}
              className="bg-prats-navy hover:bg-prats-navy-light">
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
              Completar venta
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
