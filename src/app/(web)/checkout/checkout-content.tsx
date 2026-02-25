'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { CreditCard, Loader2, Lock, ShoppingBag, Truck, Store, AlertCircle, FlaskConical } from 'lucide-react'
import { useCart } from '@/components/providers/cart-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { trackBeginCheckout } from '@/lib/analytics/events'

type ClientProfile = {
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  province: string | null
  country: string | null
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  shipping_province: string | null
  shipping_country: string | null
}

export function CheckoutContent() {
  const { items, subtotal, clearCart } = useCart()
  const enableDemoPayment = process.env.NEXT_PUBLIC_ENABLE_DEMO_PAYMENT !== 'false'
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'redsys' | 'demo'>(
    enableDemoPayment ? 'demo' : 'stripe'
  )
  const [deliveryMethod, setDeliveryMethod] = useState<'home' | 'store'>('home')
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    address: '', city: '', postal_code: '', province: '', country: 'ES',
  })

  const freeShippingByAmount = subtotal >= 200
  const isStorePickup = deliveryMethod === 'store'
  const shippingCost = isStorePickup ? 0 : (freeShippingByAmount ? 0 : 9.90)
  const freeShipping = shippingCost === 0
  const taxAmount = Math.round(subtotal * 0.21 * 100) / 100
  const total = subtotal + shippingCost

  useEffect(() => {
    if (subtotal > 0) trackBeginCheckout(subtotal)
  }, [subtotal])

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(res => res.json())
      .then((data: { clientProfile?: ClientProfile | null }) => {
        if (cancelled || !data.clientProfile) return
        const p = data.clientProfile
        const hasShipping = !!(p.shipping_address || p.shipping_city || p.shipping_postal_code)
        const addr = hasShipping
          ? {
              address: p.shipping_address ?? '',
              city: p.shipping_city ?? '',
              postal_code: p.shipping_postal_code ?? '',
              province: p.shipping_province ?? '',
              country: p.shipping_country ?? 'ES',
            }
          : {
              address: p.address ?? '',
              city: p.city ?? '',
              postal_code: p.postal_code ?? '',
              province: p.province ?? '',
              country: p.country ?? 'ES',
            }
        setClientProfile(p)
        setForm(prev => ({
          ...prev,
          first_name: p.first_name ?? '',
          last_name: p.last_name ?? '',
          email: p.email ?? '',
          phone: p.phone ?? '',
          ...addr,
        }))
      })
      .finally(() => setProfileLoaded(true))
    return () => { cancelled = true }
  }, [])

  const formatPrice = (p: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(p)

  const handlePay = async () => {
    if (!form.first_name || !form.last_name || !form.email) {
      toast.error('Completa los datos de contacto')
      return
    }
    if (deliveryMethod === 'home') {
      if (!form.address?.trim() || !form.city?.trim() || !form.postal_code?.trim()) {
        toast.error('Falta información de envío. Complétala arriba o añádela en Mi perfil.')
        return
      }
    }

    const customerPayload = deliveryMethod === 'store'
      ? { ...form, address: 'Recoger en tienda', city: '', postal_code: '', province: '' }
      : form

    setIsProcessing(true)
    try {
      const res = await fetch('/api/public/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            variant_id: i.variant_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
            product_name: i.product_name,
          })),
          customer: customerPayload,
          payment_method: paymentMethod,
          shipping_cost: shippingCost,
          delivery_method: deliveryMethod,
          locale: 'es',
        }),
      })
      const data = await res.json()

      if (data.checkout_url) {
        clearCart()
        window.location.href = data.checkout_url
      } else if (data.error) {
        toast.error(data.error)
      }
    } catch {
      toast.error('Error procesando el pago')
    }
    setIsProcessing(false)
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <ShoppingBag className="mx-auto h-16 w-16 text-gray-200 mb-4" />
        <p className="text-gray-400">No hay productos en el carrito</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Checkout</h1>

      <div className="grid gap-10 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-8">
          {/* Delivery method */}
          <section>
            <h2 className="text-lg font-semibold text-prats-navy mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5" />Tipo de entrega
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryMethod('home')}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  deliveryMethod === 'home' ? 'border-prats-navy bg-prats-navy/5' : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <Truck className="h-5 w-5 text-prats-navy mb-2" />
                <p className="text-sm font-medium">Envío a domicilio</p>
                <p className="text-xs text-gray-400">Recibe tu pedido en casa</p>
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod('store')}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  deliveryMethod === 'store' ? 'border-prats-navy bg-prats-navy/5' : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <Store className="h-5 w-5 text-prats-navy mb-2" />
                <p className="text-sm font-medium">Recoger en tienda</p>
                <p className="text-xs text-gray-400">Sin coste de envío</p>
              </button>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-lg font-semibold text-prats-navy mb-4">Contacto</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Nombre *</Label>
                <Input
                  value={form.first_name}
                  onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Apellidos *</Label>
                <Input
                  value={form.last_name}
                  onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="h-11"
                />
              </div>
            </div>
          </section>

          {/* Shipping - only for home delivery */}
          {deliveryMethod === 'home' && (
          <section>
            <h2 className="text-lg font-semibold text-prats-navy mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5" />Dirección de envío
            </h2>
            {profileLoaded && clientProfile && !form.address?.trim() && !form.city?.trim() && !form.postal_code?.trim() && (
              <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600" />
                <p>
                  Falta información de envío en tu perfil. Añádela en{' '}
                  <Link href="/mi-cuenta/datos" className="font-medium text-prats-navy underline">
                    Mi perfil
                  </Link>
                  {' '}o complétala a continuación para este pedido.
                </p>
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Dirección *</Label>
                <Input
                  value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Ciudad *</Label>
                  <Input
                    value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Código postal *</Label>
                  <Input
                    value={form.postal_code}
                    onChange={e => setForm(p => ({ ...p, postal_code: e.target.value }))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Provincia</Label>
                  <Input
                    value={form.province}
                    onChange={e => setForm(p => ({ ...p, province: e.target.value }))}
                    className="h-11"
                  />
                </div>
              </div>
            </div>
          </section>
          )}

          {/* Payment method */}
          <section>
            <h2 className="text-lg font-semibold text-prats-navy mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5" />Método de pago
            </h2>
            <div className={cn('grid gap-3', enableDemoPayment ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
              <button
                onClick={() => setPaymentMethod('stripe')}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  paymentMethod === 'stripe' ? 'border-prats-navy bg-prats-navy/5' : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <CreditCard className="h-5 w-5 text-prats-navy mb-2" />
                <p className="text-sm font-medium">Tarjeta de crédito/débito</p>
                <p className="text-xs text-gray-400">Visa, Mastercard, Amex</p>
              </button>
              <button
                onClick={() => setPaymentMethod('redsys')}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  paymentMethod === 'redsys' ? 'border-prats-navy bg-prats-navy/5' : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="h-5 w-5 bg-red-600 rounded text-white text-[8px] font-bold flex items-center justify-center mb-2">
                  RS
                </div>
                <p className="text-sm font-medium">TPV Virtual (Redsys)</p>
                <p className="text-xs text-gray-400">Tarjetas españolas</p>
              </button>
              {enableDemoPayment && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('demo')}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all border-amber-200 bg-amber-50/50',
                    paymentMethod === 'demo' ? 'border-amber-500 bg-amber-100 ring-2 ring-amber-500/30' : 'hover:border-amber-300'
                  )}
                >
                  <FlaskConical className="h-5 w-5 text-amber-600 mb-2" />
                  <p className="text-sm font-medium text-amber-800">Modo demo</p>
                  <p className="text-xs text-amber-600">Sin cobro real, para pruebas</p>
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Order summary */}
        <div className="lg:col-span-2">
          <div className="bg-gray-50 rounded-2xl p-6 sticky top-24">
            <h2 className="font-semibold text-prats-navy mb-4">Resumen del pedido</h2>
            <div className="space-y-3 mb-4">
              {items.map(item => (
                <div key={item.variant_id} className="flex items-center gap-3">
                  <div className="w-12 h-14 bg-gray-200 rounded overflow-hidden flex-shrink-0 relative">
                    {item.image_url && (
                      <Image src={item.image_url} alt="" fill className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-400">
                      {item.size && `T.${item.size}`} {item.color && `· ${item.color}`} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-medium">{formatPrice(item.unit_price * item.quantity)}</p>
                </div>
              ))}
            </div>
            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Envío</span>
                <span>{freeShipping ? 'Gratuito' : formatPrice(shippingCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IVA (21%)</span>
                <span>{formatPrice(taxAmount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold text-prats-navy">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Button
              size="lg"
              className="w-full mt-6 h-14 bg-prats-navy hover:bg-prats-navy-light text-sm tracking-wide uppercase"
              disabled={isProcessing}
              onClick={handlePay}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              {isProcessing ? 'Procesando...' : `Pagar ${formatPrice(total)}`}
            </Button>
            <p className="text-xs text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" />Pago seguro
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
