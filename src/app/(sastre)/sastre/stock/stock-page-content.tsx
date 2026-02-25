'use client'

import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { useList } from '@/hooks/use-list'
import { listProductsForSastre } from '@/actions/products'
import { SastreHeader } from '../../components/sastre-header'
import { formatCurrency } from '@/lib/utils'

const TAB_TELAS = 'telas' as const
const TAB_BOUTIQUE = 'boutique' as const
type TabKey = typeof TAB_TELAS | typeof TAB_BOUTIQUE

const PRODUCT_TYPE_TELAS = 'tailoring_fabric'
const PRODUCT_TYPE_BOUTIQUE = 'boutique'

function getStockTotal(product: Record<string, unknown>): number {
  const variants = (product.product_variants as Array<Record<string, unknown>>) || []
  let total = 0
  for (const v of variants) {
    const levels = (v.stock_levels as Array<Record<string, unknown>>) || []
    for (const sl of levels) {
      total += Number(sl.quantity ?? 0)
    }
  }
  return total
}

export function StockPageContent({ sastreName }: { sastreName: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>(TAB_TELAS)

  const {
    data: products,
    total,
    search,
    setSearch,
    isLoading,
    setFilters,
  } = useList(listProductsForSastre, {
    pageSize: 50,
    defaultSort: 'name',
    defaultOrder: 'asc',
    defaultFilters: { product_type: PRODUCT_TYPE_TELAS },
  })

  useEffect(() => {
    setFilters(activeTab === TAB_TELAS ? { product_type: PRODUCT_TYPE_TELAS } : { product_type: PRODUCT_TYPE_BOUTIQUE })
  }, [activeTab, setFilters])

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
    >
      <SastreHeader sastreName={sastreName} sectionTitle="Stock" backHref="/sastre" />
      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Tabs */}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab(TAB_TELAS)}
              className={`px-5 h-12 rounded-xl font-serif text-lg transition-all touch-manipulation ${
                activeTab === TAB_TELAS
                  ? 'bg-transparent text-white font-medium border-2 border-white/70'
                  : 'bg-transparent border border-[#c9a96e]/40 text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              Telas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(TAB_BOUTIQUE)}
              className={`px-5 h-12 rounded-xl font-serif text-lg transition-all touch-manipulation ${
                activeTab === TAB_BOUTIQUE
                  ? 'bg-transparent text-white font-medium border-2 border-white/70'
                  : 'bg-transparent border border-[#c9a96e]/40 text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              Boutique
            </button>
          </div>

          <div className="relative flex items-center">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#c9a96e]/80 pointer-events-none" />
            <input
              type="search"
              placeholder={
                activeTab === TAB_TELAS
                  ? 'Buscar telas por nombre, referencia, marca...'
                  : 'Buscar productos por nombre, referencia, marca...'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-12 py-3 pl-12 pr-4 leading-none rounded-xl border border-[#c9a96e]/20 bg-[#1a2744] text-white placeholder:text-white/40 focus:outline-none focus:border-[#c9a96e]/60 transition-colors touch-manipulation"
              autoComplete="off"
            />
          </div>

          <p className="text-white/70 text-sm">
            {total} {activeTab === TAB_TELAS ? 'telas' : 'productos'}
          </p>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629]"
                  style={{ opacity: 0.7 }}
                />
              ))}
            </div>
          ) : (
            <ul className="space-y-3">
              {products.map((p: Record<string, unknown>) => {
                const categoryName = (p.product_categories as Record<string, unknown> | null)?.name
                const stockTotal = getStockTotal(p)
                const isTela = p.product_type === PRODUCT_TYPE_TELAS
                const material = p.material != null && String(p.material).trim() !== '' ? String(p.material) : null
                const fabricMetersUsed = p.fabric_meters_used != null ? Number(p.fabric_meters_used) : null

                return (
                  <li
                    key={String(p.id)}
                    className="p-5 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-lg text-white truncate">{String(p.name ?? '—')}</p>
                        <p className="text-sm text-white/60 mt-0.5">Ref. {String(p.sku ?? '—')}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          {categoryName ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-medium bg-[#c9a96e]/20 text-[#c9a96e] border border-[#c9a96e]/30">
                              {String(categoryName)}
                            </span>
                          ) : null}
                          {isTela ? (
                            <>
                              {material ? (
                                <span className="text-white/60 text-sm">Composición: {material}</span>
                              ) : null}
                              <span className="text-white/60 text-sm">
                                <span className="text-white font-medium">{stockTotal}</span> metros
                              </span>
                            </>
                          ) : (
                            <span className="text-white/60 text-sm">
                              Stock: <span className="text-white font-medium">{stockTotal}</span>
                            </span>
                          )}
                        </div>
                        {isTela && (material || fabricMetersUsed != null) && (
                          <p className="text-xs text-white/50 mt-1.5">
                            {fabricMetersUsed != null && fabricMetersUsed > 0 && (
                              <span>Metros por unidad: {fabricMetersUsed}</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-serif text-xl text-[#c9a96e]">
                          {formatCurrency(Number(p.base_price ?? 0))}
                        </p>
                        <p className="text-xs text-white/50 mt-0.5">PVP</p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {!isLoading && products.length === 0 && (
            <p className="text-center text-white/60 py-12">
              No hay {activeTab === TAB_TELAS ? 'telas' : 'productos'} que coincidan con la búsqueda.
            </p>
          )}
        </div>
      </main>

      <footer className="py-6 text-center shrink-0">
        <p className="text-xs text-white/20 tracking-widest">
          SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
        </p>
      </footer>
    </div>
  )
}
