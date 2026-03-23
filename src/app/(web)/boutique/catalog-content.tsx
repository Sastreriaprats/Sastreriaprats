'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Loader2, ShoppingBag, Heart, ChevronDown } from 'lucide-react'
import { trackAddToCart } from '@/lib/analytics/events'
import { useCart } from '@/components/providers/cart-provider'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'

export function CatalogContent() {
  const { addItem } = useCart()
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category') || ''

  const [products, setProducts] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [showSort, setShowSort] = useState(false)
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
    if (categoryParam) params.set('category', categoryParam)

    const res = await fetch(`/api/public/catalog?${params}`)
    const data = await res.json()
    setProducts(data.products || [])
    setTotal(data.total || 0)
    setTotalPages(data.totalPages || 1)
    setIsLoading(false)
  }, [page, sort, search, categoryParam])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Reset page when category changes
  useEffect(() => { setPage(1) }, [categoryParam])

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

  const handleQuickAdd = (e: React.MouseEvent, product: Record<string, unknown>) => {
    e.preventDefault()
    e.stopPropagation()
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

  const sortLabels: Record<string, string> = {
    newest: 'Novedades',
    price_asc: 'Precio: menor a mayor',
    price_desc: 'Precio: mayor a menor',
    name: 'Nombre A-Z',
  }

  return (
    <div className="bg-white min-h-screen">
      {/* Barra superior: búsqueda + ordenar + contador */}
      <div className="border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Buscar"
              className="w-full pl-6 pr-2 py-1 text-sm bg-transparent border-none outline-none placeholder:text-gray-400"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSort(!showSort)}
                className="flex items-center gap-1 text-sm text-black"
              >
                Ordenar <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSort ? 'rotate-180' : ''}`} />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 shadow-sm z-20 min-w-[180px]">
                  {Object.entries(sortLabels).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setSort(key); setShowSort(false); setPage(1) }}
                      className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${sort === key ? 'font-medium text-black' : 'text-gray-600'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-sm text-gray-400">{total} productos</span>
          </div>
        </div>
      </div>

      {/* Grid de productos */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20">
          <ShoppingBag className="mx-auto h-12 w-12 text-gray-200 mb-4" />
          <p className="text-gray-400 text-sm">No se encontraron productos</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => {
              const variants = product.product_variants as Record<string, unknown>[] | undefined
              const minPrice = (product.price_with_tax as number) || (product.base_price as number)
              const hasStock = variants?.some((v) => (v.total_stock as number) > 0)
              const productId = product.id as string
              const isFavorite = favoriteIds.has(productId)

              return (
                <Link
                  key={productId}
                  href={`/boutique/${product.slug || product.web_slug}`}
                  className="group block border-b border-r border-gray-100"
                >
                  {/* Imagen */}
                  <div className="aspect-[3/4] relative overflow-hidden bg-gray-50">
                    {/* Wishlist */}
                    <button
                      type="button"
                      onClick={(e) => handleAddToWishlist(e, productId)}
                      className="absolute top-3 right-3 z-10 text-gray-400 hover:text-red-500 transition-colors"
                      title={clientId ? (isFavorite ? 'En favoritos' : 'Añadir a favoritos') : 'Inicia sesión'}
                    >
                      {wishlistLoading === productId ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Heart className={`h-5 w-5 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                      )}
                    </button>

                    {product.main_image_url ? (
                      <Image
                        src={product.main_image_url as string}
                        alt={product.name as string}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-200">
                        <ShoppingBag className="h-10 w-10" />
                      </div>
                    )}

                    {!hasStock && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <span className="text-xs tracking-[0.2em] text-gray-500 uppercase">Agotado</span>
                      </div>
                    )}

                    {/* Quick add */}
                    {hasStock && (
                      <button
                        type="button"
                        onClick={(e) => handleQuickAdd(e, product)}
                        className="absolute bottom-3 right-3 z-10 h-9 w-9 rounded-full bg-black text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-gray-800"
                        title="Añadir al carrito"
                      >
                        <ShoppingBag className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Info */}
                  <div className="px-3 py-3">
                    <h3 className="text-sm font-medium text-black leading-tight">{product.name as string}</h3>
                    <p className="text-sm text-gray-500 mt-1">{formatPrice(minPrice)}</p>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-8 py-12 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="text-xs tracking-[0.2em] uppercase text-black disabled:opacity-20 hover:opacity-60 transition-opacity"
              >
                ← Anterior
              </button>
              <span className="text-xs text-gray-400">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="text-xs tracking-[0.2em] uppercase text-black disabled:opacity-20 hover:opacity-60 transition-opacity"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
