'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Heart, ShoppingBag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

export function WishlistContent({ items, clientId }: {
  items: Record<string, unknown>[]
  clientId: string
}) {
  const router = useRouter()

  const removeItem = async (id: string) => {
    const res = await fetch('/api/public/wishlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      toast.success('Eliminado de favoritos')
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-prats-navy flex items-center gap-2">
        <Heart className="h-6 w-6" />Favoritos
      </h1>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Heart className="mx-auto h-16 w-16 text-gray-200 mb-4" />
          <p className="text-gray-400 mb-4">No tienes favoritos todavía</p>
          <Link href="/boutique">
            <Button variant="outline" className="gap-2">
              <ShoppingBag className="h-4 w-4" />Ir a la boutique
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {items.map((item) => {
            const product = item.products as Record<string, unknown> | null
            if (!product) return null
            return (
              <div key={item.id as string} className="group relative">
                <Link href={`/boutique/${product.web_slug as string}`}>
                  <div className="aspect-[3/4] bg-gray-50 rounded-xl overflow-hidden mb-3 relative">
                    {(product.main_image_url as string) ? (
                      <Image
                        src={product.main_image_url as string}
                        alt={product.name as string}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <ShoppingBag className="h-12 w-12" />
                      </div>
                    )}
                  </div>
                  {(product.brand as string) && (
                    <p className="text-[10px] text-prats-gold tracking-wide uppercase">
                      {product.brand as string}
                    </p>
                  )}
                  <h3 className="text-sm font-medium text-prats-navy group-hover:text-prats-gold transition-colors">
                    {product.name as string}
                  </h3>
                  <p className="text-sm font-bold text-prats-navy mt-1">
                    {formatCurrency(product.base_price as number)}
                  </p>
                </Link>
                <button
                  onClick={() => removeItem(item.id as string)}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shadow-sm"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
