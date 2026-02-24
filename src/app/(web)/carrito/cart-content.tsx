'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ShoppingBag, Minus, Plus, Trash2, ArrowLeft, ArrowRight } from 'lucide-react'
import { useCart } from '@/components/providers/cart-provider'

export function CartContent() {
  const { items, subtotal, updateQuantity, removeItem } = useCart()

  const formatPrice = (p: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(p)

  const freeShipping = subtotal >= 200

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <ShoppingBag className="mx-auto h-20 w-20 text-gray-200 mb-6" />
        <h1 className="text-2xl font-bold text-prats-navy mb-4">Tu carrito está vacío</h1>
        <Link href="/boutique">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />Seguir comprando
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Tu carrito</h1>

      <div className="grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => (
            <div key={item.variant_id} className="flex gap-4 p-4 rounded-xl border">
              <div className="w-24 h-32 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0 relative">
                {item.image_url ? (
                  <Image src={item.image_url} alt={item.product_name} fill className="object-cover" />
                ) : (
                  <ShoppingBag className="w-full h-full p-6 text-gray-200" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-prats-navy">{item.product_name}</h3>
                <p className="text-xs text-gray-400 font-mono">{item.variant_sku}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  {item.size && <span>Talla: {item.size}</span>}
                  {item.color && <span>Color: {item.color}</span>}
                </div>
                <p className="font-bold text-prats-navy mt-2">{formatPrice(item.unit_price)}</p>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center border rounded-lg">
                    <button
                      className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-prats-navy"
                      onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                    <button
                      className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-prats-navy"
                      onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.variant_id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <Link
            href="/boutique"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-prats-navy transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />Seguir comprando
          </Link>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-gray-50 rounded-2xl p-6 sticky top-24">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Envío</span>
                <span className="text-xs text-gray-400">
                  {freeShipping ? 'Gratuito' : 'Se calcula en checkout'}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg">
                <span className="font-bold text-prats-navy">Total estimado</span>
                <span className="font-bold text-prats-navy">{formatPrice(subtotal)}</span>
              </div>
            </div>
            {!freeShipping && (
              <p className="text-xs text-gray-400 mt-3">Envío gratuito a partir de 200€</p>
            )}
            <Link href="/checkout">
              <Button
                size="lg"
                className="w-full mt-6 h-14 bg-prats-navy hover:bg-prats-navy-light text-sm tracking-wide uppercase"
              >
                Ir al checkout <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
