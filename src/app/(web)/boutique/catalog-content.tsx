'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, Loader2, ShoppingBag, Heart } from 'lucide-react'
import { trackAddToCart } from '@/lib/analytics/events'
import { useCart } from '@/components/providers/cart-provider'
import { toast } from 'sonner'

export function CatalogContent() {
  const { addItem } = useCart()
  const [products, setProducts] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [clientId, setClientId] = useState<string | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [wishlistLoading, setWishlistLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.clientId) setClientId(data.clientId)
      })
      .catch(() => {})
  }, [])

  const fetchProducts = useCallback(async () => {
    setIsLoading(true)
    const params = new URLSearchParams({ page: page.toString(), sort })
    if (search) params.set('search', search)

    const res = await fetch(`/api/public/catalog?${params}`)
    const data = await res.json()
    setProducts(data.products || [])
    setTotal(data.total || 0)
    setTotalPages(data.totalPages || 1)
    setIsLoading(false)
  }, [page, sort, search])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const handleAddToWishlist = async (e: React.MouseEvent, productId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!clientId) {
      toast.error('Inicia sesión para guardar favoritos')
      return
    }
    setWishlistLoading(productId)
    const res = await fetch('/api/public/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId }),
    })
    setWishlistLoading(null)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setFavoriteIds((prev) => new Set(prev).add(productId))
      toast.success('Añadido a favoritos')
    } else {
      toast.error(data.error || 'Error al añadir')
    }
  }

  const handleQuickAdd = (product: Record<string, unknown>) => {
    const variants = product.product_variants as Record<string, unknown>[] | undefined
    const variant = variants?.[0]
    if (!variant || (variant.total_stock as number) <= 0) return
    addItem({
      variant_id: variant.id as string,
      product_id: product.id as string,
      product_name: product.name as string,
      variant_sku: variant.variant_sku as string,
      size: variant.size as string | undefined,
      color: variant.color as string | undefined,
      image_url: product.main_image_url as string | undefined,
      unit_price: (variant.price_override as number) || (product.price_with_tax as number) || (product.base_price as number),
      max_stock: variant.total_stock as number,
    })
    trackAddToCart(product.name as string, (variant.price_override as number) || (product.price_with_tax as number) || (product.base_price as number), 1)
    toast.success('Añadido al carrito')
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price)

  return (
    <div className="bg-white">
      {/* Hero */}
      <div className="relative h-56 overflow-hidden">
        <img
          src="https://www.sastreriaprats.com/cdn/shop/files/AW25_-_DIEGO_MARTIN-191.jpg?v=1762421411&width=2000"
          alt="Boutique"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-[#1a2744]/70" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-xs tracking-[0.5em] text-white/50 mb-3">SASTRERÍA PRATS</p>
          <h1 className="font-serif text-5xl font-light text-white tracking-wide">Boutique</h1>
        </div>
      </div>

      {/* Barra de filtros sticky */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
            <input
              placeholder="Buscar..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 focus:outline-none focus:border-[#1a2744] transition-colors"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex items-center gap-6">
            <select
              className="text-xs text-[#1a2744] border-none outline-none cursor-pointer bg-transparent"
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1) }}
            >
              <option value="newest">Novedades</option>
              <option value="price_asc">Precio ↑</option>
              <option value="price_desc">Precio ↓</option>
              <option value="name">Nombre A-Z</option>
            </select>
            <span className="text-xs text-gray-300">{total} prendas</span>
          </div>
        </div>
      </div>

      {/* Contenido */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#1a2744]" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20">
          <ShoppingBag className="mx-auto h-16 w-16 text-gray-200 mb-4" />
          <p className="text-gray-400 text-sm">No se encontraron productos</p>
        </div>
      ) : (
        <>
          <div className="max-w-7xl mx-auto px-8 py-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
            {products.map((product) => {
              const variants = product.product_variants as Record<string, unknown>[] | undefined
              const minPrice = (product.price_with_tax as number) || (product.base_price as number)
              const hasStock = variants?.some((v) => (v.total_stock as number) > 0)
              const sizes = [...new Set(variants?.map((v) => v.size as string).filter(Boolean))]
              const colors = variants
                ?.filter((v) => v.color_hex)
                .map((v) => ({ color: v.color as string, hex: v.color_hex as string }))
                .filter((v, i, arr) => arr.findIndex(a => a.hex === v.hex) === i)

              const productId = product.id as string
              const isFavorite = favoriteIds.has(productId)

              return (
                <div key={productId} className="group">
                  <Link href={`/boutique/${product.slug || product.web_slug}`}>
                    <div className="aspect-[3/4] overflow-hidden relative bg-gray-100">
                      <button
                        type="button"
                        onClick={(e) => handleAddToWishlist(e, productId)}
                        className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shadow-sm"
                        title={clientId ? (isFavorite ? 'En favoritos' : 'Añadir a favoritos') : 'Inicia sesión para guardar favoritos'}
                      >
                        {wishlistLoading === productId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Heart className={`h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                        )}
                      </button>
                      {product.main_image_url ? (
                        <img
                          src={product.main_image_url as string}
                          alt={product.name as string}
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <ShoppingBag className="h-12 w-12" />
                        </div>
                      )}
                      {!hasStock && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                          <span className="text-xs tracking-[0.3em] text-gray-400 uppercase">Agotado</span>
                        </div>
                      )}
                      {hasStock && (
                        <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); handleQuickAdd(product) }}
                            className="w-full py-2.5 bg-[#1a2744] text-xs tracking-[0.2em] text-white hover:bg-[#1a2744]/90 transition-colors"
                          >
                            Añadir
                          </button>
                        </div>
                      )}
                    </div>
                  </Link>
                  <Link href={`/boutique/${product.slug || product.web_slug}`} className="block mt-3">
                    {(product.brand as string) && (
                      <p className="text-[10px] tracking-[0.3em] text-[#c9a96e] uppercase">{product.brand as string}</p>
                    )}
                    <h3 className="text-sm font-light text-[#1a2744] mt-1">{product.name as string}</h3>
                    <p className="text-sm text-[#1a2744] mt-1">{formatPrice(minPrice)}</p>
                    {colors && colors.length > 1 && (
                      <div className="flex gap-1 mt-2">
                        {colors.slice(0, 5).map((c, i) => (
                          <div
                            key={i}
                            className="h-3 w-3 rounded-full border border-gray-200"
                            style={{ backgroundColor: c.hex }}
                            title={c.color}
                          />
                        ))}
                        {colors.length > 5 && <span className="text-[10px] text-gray-400">+{colors.length - 5}</span>}
                      </div>
                    )}
                    {sizes.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">{sizes.join(' · ')}</p>
                    )}
                  </Link>
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-8 py-16">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="text-xs tracking-[0.3em] text-[#1a2744] disabled:opacity-20 hover:opacity-60 transition-opacity"
              >
                ← ANTERIOR
              </button>
              <span className="text-xs text-gray-300">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="text-xs tracking-[0.3em] text-[#1a2744] disabled:opacity-20 hover:opacity-60 transition-opacity"
              >
                SIGUIENTE →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
