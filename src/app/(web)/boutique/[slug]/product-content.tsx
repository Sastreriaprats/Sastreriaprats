'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ArrowLeft, ShoppingBag, Minus, Plus, Check, Truck, Shield, Ruler, Loader2, Heart,
} from 'lucide-react'
import { useCart } from '@/components/providers/cart-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ProductSchema, BreadcrumbSchema } from '@/components/seo/schema-org'
import { buildBreadcrumbs } from '@/lib/seo/metadata'
import { trackViewItem, trackAddToCart } from '@/lib/analytics/events'

export function ProductContent({ slug }: { slug: string }) {
  const { addItem } = useCart()
  const [product, setProduct] = useState<Record<string, unknown> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedVariant, setSelectedVariant] = useState<Record<string, unknown> | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [activeImage, setActiveImage] = useState(0)
  const [justAdded, setJustAdded] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  const [isInWishlist, setIsInWishlist] = useState(false)
  const [wishlistLoading, setWishlistLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => { if (data.clientId) setClientId(data.clientId) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/public/catalog/${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setIsLoading(false)
          return
        }
        setProduct(data)
        trackViewItem(data.name, data.price_with_tax || data.base_price)
        const variants = data.product_variants as Record<string, unknown>[] | undefined
        const colorsList = [...new Set(variants?.map((v) => v.color as string).filter(Boolean))]
        if (colorsList.length > 0) setSelectedColor(colorsList[0])
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [slug])

  useEffect(() => {
    if (!product) return
    const variants = product.product_variants as Record<string, unknown>[] | undefined
    const variant = variants?.find((v) =>
      (!selectedSize || v.size === selectedSize) && (!selectedColor || v.color === selectedColor)
    )
    setSelectedVariant(variant || null)
  }, [product, selectedSize, selectedColor])

  if (isLoading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-prats-navy" />
      </div>
    )
  }

  if (!product) {
    return <div className="text-center py-32 text-gray-400">Producto no encontrado</div>
  }

  const rawImages = product.images as string[] | { url: string; alt_text?: string }[] | null
  const images = rawImages && rawImages.length > 0
    ? rawImages.map((img) => typeof img === 'string' ? { url: img, alt_text: product.name as string } : img)
    : product.main_image_url
      ? [{ url: product.main_image_url as string, alt_text: product.name as string }]
      : []

  const variants = product.product_variants as Record<string, unknown>[] | undefined
  const sizes = [...new Set(variants?.map((v) => v.size as string).filter(Boolean))]
  const colors = variants
    ?.filter((v) => v.color_hex)
    .map((v) => ({ color: v.color as string, hex: v.color_hex as string }))
    .filter((v, i, arr) => arr.findIndex(a => a.hex === v.hex) === i)

  const price = (selectedVariant?.price_override as number) || (product.price_with_tax as number) || (product.base_price as number)
  const stock = (selectedVariant?.total_stock as number) || 0
  const canAdd = selectedVariant && stock > 0 && (sizes.length === 0 || selectedSize)

  const handleAddToWishlist = async () => {
    if (!product?.id) return
    if (!clientId) {
      toast.error('Inicia sesión para guardar favoritos')
      return
    }
    setWishlistLoading(true)
    const res = await fetch('/api/public/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id }),
    })
    setWishlistLoading(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setIsInWishlist(true)
      toast.success('Añadido a favoritos')
    } else {
      toast.error(data.error || 'Error al añadir')
    }
  }

  const handleAddToCart = () => {
    if (!canAdd || !selectedVariant) return
    addItem({
      variant_id: selectedVariant.id as string,
      product_id: product.id as string,
      product_name: product.name as string,
      variant_sku: selectedVariant.variant_sku as string,
      size: selectedVariant.size as string | undefined,
      color: selectedVariant.color as string | undefined,
      image_url: product.main_image_url as string | undefined,
      unit_price: price,
      max_stock: stock,
      quantity,
    })
    trackAddToCart(product.name as string, price, quantity)
    setJustAdded(true)
    toast.success('¡Añadido al carrito!')
    setTimeout(() => setJustAdded(false), 2000)
  }

  const formatPrice = (p: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(p)


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <ProductSchema product={product as Parameters<typeof ProductSchema>[0]['product']} />
      <BreadcrumbSchema items={buildBreadcrumbs([
        { label: 'Boutique', path: '/boutique' },
        { label: product.name as string, path: `/boutique/${slug}` },
      ])} />
      <Link
        href="/boutique"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-prats-navy transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a boutique
      </Link>

      <div className="grid gap-12 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="aspect-[3/4] bg-gray-50 rounded-2xl overflow-hidden mb-3 relative">
            {images[activeImage]?.url ? (
              <img
                src={images[activeImage].url}
                alt={images[activeImage].alt_text || (product.name as string)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <ShoppingBag className="h-16 w-16" />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    'w-20 h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors relative',
                    i === activeImage ? 'border-prats-navy' : 'border-transparent hover:border-gray-300'
                  )}
                >
                  <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product info */}
        <div>
          {(product.brand as string) && (
            <p className="text-xs text-prats-gold tracking-[0.3em] uppercase mb-2">{product.brand as string}</p>
          )}
          <h1 className="text-3xl font-bold text-prats-navy tracking-tight mb-2">{product.name as string}</h1>
          <p className="text-2xl font-bold text-prats-navy mb-6">{formatPrice(price)}</p>

          {colors && colors.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Color: <span className="text-gray-500">{selectedColor}</span>
              </p>
              <div className="flex gap-2">
                {colors.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => { setSelectedColor(c.color); setSelectedSize(null) }}
                    className={cn(
                      'h-8 w-8 rounded-full border-2 transition-all',
                      selectedColor === c.color ? 'border-prats-navy scale-110' : 'border-gray-200 hover:border-gray-400'
                    )}
                    style={{ backgroundColor: c.hex }}
                    title={c.color}
                  />
                ))}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Talla</p>
                <button type="button" className="text-xs text-prats-gold hover:underline flex items-center gap-1" onClick={() => setSizeGuideOpen(true)}>
                  <Ruler className="h-3 w-3" />Guía de tallas
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map(size => {
                  const variant = variants?.find((v) =>
                    v.size === size && (!selectedColor || v.color === selectedColor)
                  )
                  const available = (variant?.total_stock as number) > 0
                  return (
                    <button
                      key={size}
                      onClick={() => available && setSelectedSize(size)}
                      disabled={!available}
                      className={cn(
                        'h-10 min-w-[44px] px-3 rounded-lg border text-sm font-medium transition-all',
                        selectedSize === size
                          ? 'border-prats-navy bg-prats-navy text-white'
                          : available
                            ? 'border-gray-200 hover:border-prats-navy text-gray-700'
                            : 'border-gray-100 text-gray-300 line-through cursor-not-allowed'
                      )}
                    >
                      {size}
                    </button>
                  )
                })}
              </div>
              {!selectedSize && sizes.length > 0 && (
                <p className="text-xs text-amber-600 mt-2">Selecciona una talla</p>
              )}
            </div>
          )}

          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center border rounded-lg">
                <button
                  className="h-10 w-10 flex items-center justify-center text-gray-500 hover:text-prats-navy"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-sm font-medium">{quantity}</span>
                <button
                  className="h-10 w-10 flex items-center justify-center text-gray-500 hover:text-prats-navy"
                  onClick={() => setQuantity(q => Math.min(stock, q + 1))}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {selectedVariant && (
                <span className="text-xs text-gray-400">{stock} disponibles</span>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              size="lg"
              className={cn(
                'flex-1 h-14 text-sm tracking-wide uppercase transition-all',
                justAdded ? 'bg-green-600 hover:bg-green-700' : 'bg-prats-navy hover:bg-prats-navy-light'
              )}
              disabled={!canAdd}
              onClick={handleAddToCart}
            >
              {justAdded ? (
                <><Check className="h-4 w-4 mr-2" />¡Añadido!</>
              ) : (
                <><ShoppingBag className="h-4 w-4 mr-2" />{canAdd ? 'Añadir al carrito' : stock <= 0 ? 'Agotado' : 'Selecciona una talla'}</>
              )}
            </Button>
            {clientId && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-14 px-4 border-prats-navy text-prats-navy hover:bg-prats-navy/5"
                disabled={wishlistLoading}
                onClick={handleAddToWishlist}
                title={isInWishlist ? 'En favoritos' : 'Añadir a favoritos'}
              >
                {wishlistLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Heart className={cn('h-5 w-5', isInWishlist && 'fill-red-500 text-red-500')} />
                )}
              </Button>
            )}
          </div>
          {!clientId && (
            <p className="text-xs text-gray-400 mt-2">
              <Link href={`/auth/login?mode=client&redirectTo=${encodeURIComponent(`/boutique/${slug}`)}`} className="text-prats-gold hover:underline">
                Inicia sesión
              </Link>
              {' '}para guardar productos en favoritos.
            </p>
          )}

          <Separator className="my-8" />

          <div className="space-y-3 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-prats-gold" />Envío gratuito a partir de 200€
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-prats-gold" />Devolución en 30 días
            </div>
          </div>

          <Separator className="my-8" />

          {(product.description as string) && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-prats-navy mb-2">Descripción</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{product.description as string}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {(product.material as string) && (
              <div>
                <span className="text-gray-400">Material:</span>{' '}
                <span className="text-gray-700">{product.material as string}</span>
              </div>
            )}
            {(product.brand as string) && (
              <div>
                <span className="text-gray-400">Marca:</span>{' '}
                <span className="text-gray-700">{product.brand as string}</span>
              </div>
            )}
            {(product.collection as string) && (
              <div>
                <span className="text-gray-400">Colección:</span>{' '}
                <span className="text-gray-700">{product.collection as string}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={sizeGuideOpen} onOpenChange={setSizeGuideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Guía de tallas</DialogTitle></DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-3 text-left font-medium">Talla ES</th>
                  <th className="py-2 px-3">Pecho (cm)</th>
                  <th className="py-2 px-3">Cintura (cm)</th>
                  <th className="py-2 px-3">Cadera (cm)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['44', '88–92', '76–80', '94–98'],
                  ['46', '92–96', '80–84', '98–102'],
                  ['48', '96–100', '84–88', '102–106'],
                  ['50', '100–104', '88–92', '106–110'],
                  ['52', '104–108', '92–96', '110–114'],
                  ['54', '108–112', '96–100', '114–118'],
                  ['56', '112–116', '100–104', '118–122'],
                ].map(([size, chest, waist, hip]) => (
                  <tr key={size} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-left font-medium text-[#1a2744]">{size}</td>
                    <td className="py-2 px-3 text-gray-600">{chest}</td>
                    <td className="py-2 px-3 text-gray-600">{waist}</td>
                    <td className="py-2 px-3 text-gray-600">{hip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-4">Las medidas son orientativas. Si tienes dudas, visítanos en cualquiera de nuestras boutiques.</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
