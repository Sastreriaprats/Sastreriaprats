'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Trash2, Search } from 'lucide-react'

export type ComplementoItem = {
  id: string
  product_variant_id: string
  nombre: string
  cantidad: number
  precio: number
  cost_price?: number
}

export type ComplementResult = {
  id: string
  name: string
  sku: string
  price_with_tax: number
  tax_rate: number
  cost_price: number
  stock: number
}

interface Props {
  complementos: ComplementoItem[]
  removeComplement: (id: string) => void
  updateComplementPrecio: (id: string, precio: number) => void
  // Dialog de búsqueda
  showComplementSearch: boolean
  setShowComplementSearch: (open: boolean) => void
  complementSearchQuery: string
  setComplementSearchQuery: (q: string) => void
  complementResults: ComplementResult[]
  complementSearchLoading: boolean
  addingComplementQty: Record<string, number>
  setAddingComplementQty: React.Dispatch<React.SetStateAction<Record<string, number>>>
  addComplementFromSearch: (item: ComplementResult, cantidad: number) => void
  addComplementAsFreeText: () => void
}

export function FichaComplementosSection({
  complementos, removeComplement, updateComplementPrecio,
  showComplementSearch, setShowComplementSearch,
  complementSearchQuery, setComplementSearchQuery,
  complementResults, complementSearchLoading,
  addingComplementQty, setAddingComplementQty,
  addComplementFromSearch, addComplementAsFreeText,
}: Props) {
  return (
    <>
      <section className="rounded-xl border border-[#c9a96e]/20 bg-[#1a2744]/80 p-5 space-y-4">
        <h2 className="font-serif text-lg text-[#c9a96e]">Complementos boutique</h2>
        <Button type="button" className="min-h-[48px] gap-2 bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 transition-all" onClick={() => setShowComplementSearch(true)}>
          <Plus className="h-5 w-5" /> Añadir complemento
        </Button>
        {complementos.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#c9a96e]/15 bg-[#0d1629] p-3">
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{c.nombre}</p>
              <p className="text-white/60 text-sm">Cantidad: {c.cantidad}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input type="number" min={0} step={0.01} className="w-20 min-h-[44px] bg-[#1a2744] border-[#c9a96e]/20 text-white text-right" value={c.precio || ''} onChange={(e) => updateComplementPrecio(c.id, parseFloat(e.target.value) || 0)} />
              <span className="text-white/60">€</span>
              <Button type="button" variant="ghost" size="sm" className="text-red-400" onClick={() => removeComplement(c.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </section>

      <Dialog open={showComplementSearch} onOpenChange={setShowComplementSearch}>
        <DialogContent className="max-w-md bg-[#0f1e35] border-[#2a3a5c] text-white">
          <DialogHeader>
            <DialogTitle className="text-[#c9a96e]">Buscar complemento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
              <Input placeholder="Nombre o SKU..." className="pl-9 bg-[#0d1629] border border-[#2a3a5c] text-white" value={complementSearchQuery} onChange={(e) => setComplementSearchQuery(e.target.value)} />
            </div>
            {complementSearchLoading && <p className="text-white/60 text-sm">Buscando...</p>}
            <ul className="max-h-60 overflow-auto space-y-2">
              {complementResults.map((item) => {
                const qty = addingComplementQty[item.id] ?? 1
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#2a3a5c] bg-[#0d1629] p-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-white/60 text-xs">SKU: {item.sku} · {item.price_with_tax.toFixed(2)} € · Stock: {item.stock}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input type="number" min={1} className="w-14 h-8 text-center bg-[#1a2744] text-gray-300 border border-[#2a3a5c] rounded text-sm" value={qty} onChange={(e) => setAddingComplementQty((p) => ({ ...p, [item.id]: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                      <Button type="button" size="sm" className="min-h-[32px] bg-[#c9a96e]/20 text-[#c9a96e] hover:bg-[#c9a96e]/30" onClick={() => addComplementFromSearch(item, qty)}>Añadir</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
            {!complementSearchLoading && complementSearchQuery.length >= 2 && complementResults.length === 0 && (
              <p className="text-white/60 text-sm">No hay resultados.</p>
            )}
            {!complementSearchLoading && complementSearchQuery.trim().length >= 2 && (
              <div className="pt-2 border-t border-[#c9a96e]/20">
                <p className="text-white/60 text-sm mb-2">¿No encuentras el producto?</p>
                <Button type="button" size="sm" className="bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 transition-all" onClick={addComplementAsFreeText}>Añadir como texto libre</Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="px-4 py-2 rounded bg-[#1a2744] text-gray-300 border border-[#2a3a5c] hover:bg-[#243255] transition-colors" onClick={() => setShowComplementSearch(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
