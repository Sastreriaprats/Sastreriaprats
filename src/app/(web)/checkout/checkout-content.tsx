'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Lock, ShoppingBag, Truck, Store, AlertCircle, Tag, X } from 'lucide-react'
import { COUNTRY_CODES, countryName, sortByCountryName, toCountryCode } from '@/lib/countries'
import { AcceptedCards } from './accepted-cards'
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
  const [isProcessing, setIsProcessing] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState<'home' | 'store'>('home')
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    address: '', city: '', postal_code: '', province: '', country: 'ES',
  })

  // Descuento
  const [discountInput, setDiscountInput] = useState('')
  const [discountLoading, setDiscountLoading] = useState(false)
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string; discount_type: string; discount_value: number; discount_amount: number; free_shipping?: boolean; description: string | null
  } | null>(null)

  // Envío por zona: países disponibles + tarifa del servidor (la cifra que
  // vale la recalcula igualmente /api/public/checkout; esto es solo UX).
  // La tarifa guarda la clave país|subtotal para la que se pidió: si cambian,
  // cuenta como "calculando" hasta que llegue la nueva (sin resets síncronos).
  const [countryOptions, setCountryOptions] = useState<string[] | null>(null)
  const [quoteResult, setQuoteResult] = useState<{
    key: string; available: boolean; shipping_cost?: number; free_shipping_threshold?: number | null
  } | null>(null)

  const isStorePickup = deliveryMethod === 'store'
  const freeShippingByCoupon = !!appliedDiscount?.free_shipping
  // El CP entra en la clave: hay subzonas por prefijo postal (Baleares, Madrid…).
  const quoteKey = `${form.country || 'ES'}|${form.postal_code.trim()}|${subtotal}`
  const shippingQuote = quoteResult?.key === quoteKey ? quoteResult : null
  const shippingPending = !isStorePickup && shippingQuote === null
  const shippingUnavailable = !isStorePickup && shippingQuote?.available === false
  const shippingCost = isStorePickup || freeShippingByCoupon
    ? 0
    : (shippingQuote?.available ? shippingQuote.shipping_cost ?? 0 : 0)
  const freeShipping = !shippingPending && !shippingUnavailable && shippingCost === 0
  const discountAmount = appliedDiscount?.discount_amount || 0
  const afterDiscount = subtotal - discountAmount
  const taxAmount = Math.round(afterDiscount * 0.21 * 100) / 100
  const total = afterDiscount + shippingCost

  useEffect(() => {
    if (subtotal > 0) trackBeginCheckout(subtotal)
  }, [subtotal])

  // Países con zona de envío activa (si hay zona catch-all, todos).
  useEffect(() => {
    let cancelled = false
    fetch('/api/public/shipping')
      .then(res => res.json())
      .then((data: { countries?: string[]; has_default?: boolean }) => {
        if (cancelled) return
        const list = data.has_default ? COUNTRY_CODES : (data.countries?.length ? data.countries : ['ES'])
        setCountryOptions(sortByCountryName(list))
      })
      .catch(() => { if (!cancelled) setCountryOptions(['ES']) })
    return () => { cancelled = true }
  }, [])

  // Tarifa de envío según país, CP y subtotal. Pequeño debounce: el CP se
  // teclea carácter a carácter y no queremos una petición por pulsación.
  useEffect(() => {
    if (isStorePickup) return
    let cancelled = false
    const country = form.country || 'ES'
    const postal = form.postal_code.trim()
    const key = `${country}|${postal}|${subtotal}`
    const timer = setTimeout(() => {
      fetch(`/api/public/shipping?country=${encodeURIComponent(country)}&subtotal=${subtotal}&postal=${encodeURIComponent(postal)}`)
        .then(res => res.json())
        .then((quote: { available: boolean; shipping_cost?: number; free_shipping_threshold?: number | null }) => {
          if (!cancelled) setQuoteResult({ ...quote, key })
        })
        .catch(() => {
          // Sin tarifa no dejamos pagar (el botón queda en "Calculando…"):
          // mejor bloquear que enseñar un total que el servidor no va a cobrar.
        })
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [form.country, form.postal_code, subtotal, isStorePickup])

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
              // El perfil guarda el país en texto libre ("España") → a ISO-2.
              country: toCountryCode(p.shipping_country) ?? 'ES',
            }
          : {
              address: p.address ?? '',
              city: p.city ?? '',
              postal_code: p.postal_code ?? '',
              province: p.province ?? '',
              country: toCountryCode(p.country) ?? 'ES',
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

  const applyDiscount = async () => {
    const code = discountInput.trim()
    if (!code) return
    setDiscountLoading(true)
    try {
      const res = await fetch(`/api/public/discount?code=${encodeURIComponent(code)}&subtotal=${subtotal}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Código no válido')
        setAppliedDiscount(null)
      } else {
        setAppliedDiscount(data)
        toast.success(`Descuento "${data.code}" aplicado`)
      }
    } catch {
      toast.error('Error al validar el código')
    }
    setDiscountLoading(false)
  }

  const removeDiscount = () => {
    setAppliedDiscount(null)
    setDiscountInput('')
  }

  const handlePay = async () => {
    if (!form.first_name || !form.last_name || !form.email) {
      toast.error('Completa los datos de contacto')
      return
    }
    if (!acceptedTerms) {
      toast.error('Debes aceptar los términos y condiciones')
      return
    }
    if (deliveryMethod === 'home') {
      if (!form.address?.trim() || !form.city?.trim() || !form.postal_code?.trim()) {
        toast.error('Falta información de envío. Complétala arriba o añádela en Mi perfil.')
        return
      }
      if (shippingUnavailable) {
        toast.error(`De momento no hacemos envíos a ${countryName(form.country)}.`)
        return
      }
      if (shippingPending) {
        toast.error('Calculando el envío, un momento…')
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
          payment_method: 'redsys',
          shipping_cost: shippingCost,
          delivery_method: deliveryMethod,
          discount_code: appliedDiscount?.code || null,
          discount_amount: discountAmount,
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
                <p className="text-xs text-gray-500">Recibe tu pedido en casa</p>
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
                <p className="text-xs text-gray-500">Sin coste de envío</p>
              </button>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-lg font-semibold text-prats-navy mb-4">Contacto</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="checkout-first-name">Nombre *</Label>
                <Input
                  id="checkout-first-name"
                  value={form.first_name}
                  onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="checkout-last-name">Apellidos *</Label>
                <Input
                  id="checkout-last-name"
                  value={form.last_name}
                  onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="checkout-email">Email *</Label>
                <Input
                  id="checkout-email"
                  type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="checkout-phone">Teléfono</Label>
                <Input
                  id="checkout-phone"
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
                <Label className="text-xs" htmlFor="checkout-address">Dirección *</Label>
                <Input
                  id="checkout-address"
                  value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="checkout-city">Ciudad *</Label>
                  <Input
                    id="checkout-city"
                    value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="checkout-postal-code">Código postal *</Label>
                  <Input
                    id="checkout-postal-code"
                    value={form.postal_code}
                    onChange={e => setForm(p => ({ ...p, postal_code: e.target.value }))}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="checkout-province">Provincia</Label>
                  <Input
                    id="checkout-province"
                    value={form.province}
                    onChange={e => setForm(p => ({ ...p, province: e.target.value }))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="checkout-country">País *</Label>
                  <Select
                    value={form.country || 'ES'}
                    onValueChange={v => setForm(p => ({ ...p, country: v }))}
                  >
                    <SelectTrigger id="checkout-country" className="h-11">
                      <SelectValue placeholder="Selecciona país" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(countryOptions ?? ['ES']).map(code => (
                        <SelectItem key={code} value={code}>{countryName(code)}</SelectItem>
                      ))}
                      {/* Si el país del perfil no está entre los disponibles, lo mostramos
                          igualmente para no dejar el selector vacío (el aviso de abajo explica). */}
                      {form.country && countryOptions && !countryOptions.includes(form.country) && (
                        <SelectItem value={form.country}>{countryName(form.country)}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {shippingUnavailable && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600" />
                  <p>
                    De momento no hacemos envíos a <strong>{countryName(form.country)}</strong>.
                    Escríbenos y lo miramos, o elige &ldquo;Recoger en tienda&rdquo;.
                  </p>
                </div>
              )}
            </div>
          </section>
          )}

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
                      <Image src={item.image_url} alt={item.product_name} fill className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-500">
                      {item.size && `T.${item.size}`} {item.color && `· ${item.color}`} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-medium">{formatPrice(item.unit_price * item.quantity)}</p>
                </div>
              ))}
            </div>
            {/* Código de descuento */}
            <div className="mt-4 mb-2">
              {appliedDiscount ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Tag className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{appliedDiscount.code}</span>
                    <span className="text-xs text-green-600">
                      −{appliedDiscount.discount_type === 'percentage' ? `${appliedDiscount.discount_value}%` : formatPrice(appliedDiscount.discount_value)}
                    </span>
                    {appliedDiscount.free_shipping && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                        <Truck className="h-3 w-3" /> Envío gratis
                      </span>
                    )}
                  </div>
                  <button onClick={removeDiscount} className="text-green-600 hover:text-green-800">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Código de descuento"
                    value={discountInput}
                    onChange={e => setDiscountInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && applyDiscount()}
                    className="uppercase text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={applyDiscount} disabled={discountLoading || !discountInput.trim()}>
                    {discountLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                  </Button>
                </div>
              )}
            </div>

            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento</span>
                  <span>−{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Envío{freeShippingByCoupon ? ' (cupón)' : ''}
                </span>
                <span>
                  {shippingUnavailable
                    ? 'No disponible'
                    : shippingPending
                      ? 'Calculando…'
                      : freeShipping ? 'Gratuito' : formatPrice(shippingCost)}
                </span>
              </div>
              {!isStorePickup && !freeShipping && shippingQuote?.available && shippingQuote.free_shipping_threshold != null && (
                <p className="text-xs text-gray-400">
                  Envío gratuito a partir de {formatPrice(shippingQuote.free_shipping_threshold)}
                </p>
              )}
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
            <div className="mt-6 flex items-start gap-2.5">
              <Checkbox
                id="checkout-terms"
                checked={acceptedTerms}
                onCheckedChange={v => setAcceptedTerms(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="checkout-terms" className="text-xs font-normal leading-snug text-gray-600 cursor-pointer">
                He leído y acepto los{' '}
                <Link
                  href="/terminos"
                  target="_blank"
                  className="font-medium text-prats-navy underline underline-offset-2 hover:text-prats-navy-light"
                >
                  términos y condiciones
                </Link>
                {' '}y la{' '}
                <Link
                  href="/privacidad"
                  target="_blank"
                  className="font-medium text-prats-navy underline underline-offset-2 hover:text-prats-navy-light"
                >
                  política de privacidad
                </Link>
                .
              </Label>
            </div>
            <Button
              size="lg"
              className="w-full mt-4 h-14 bg-prats-navy hover:bg-prats-navy-light text-sm tracking-wide uppercase"
              disabled={isProcessing || !acceptedTerms || shippingPending || shippingUnavailable}
              onClick={handlePay}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              {isProcessing ? 'Procesando...' : `Pagar ${formatPrice(total)}`}
            </Button>
            <p className="text-xs text-gray-500 text-center mt-3 flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" />Pago seguro
            </p>
            <AcceptedCards className="mt-3" />
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              Aceptamos Visa, Mastercard, American Express y Maestro
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
