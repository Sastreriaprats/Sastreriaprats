'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Printer, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getVariantsByIdsForLabels } from '@/actions/products'
import { BarcodeLabel } from '@/components/barcode/barcode-label'

type VariantForLabel = {
  id: string
  variant_sku: string
  size: string | null
  color: string | null
  sku: string
  name: string
  barcode: string | null
  base_price: number
  price_with_tax?: number
}

export function ImprimirEtiquetasContent({ variantIdsParam, legacyIdsParam }: { variantIdsParam: string; legacyIdsParam?: string }) {
  const router = useRouter()
  const [variants, setVariants] = useState<VariantForLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const variantIds = variantIdsParam ? variantIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : []

  useEffect(() => {
    if (!variantIds.length) {
      setLoading(false)
      return
    }
    getVariantsByIdsForLabels(variantIds)
      .then((result) => {
        if (result.success && result.data) {
          const list = result.data
          setVariants(list)
          const initial: Record<string, number> = {}
          list.forEach((v) => { initial[v.id] = 1 })
          setQuantities(initial)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [variantIdsParam])

  const setQuantity = (variantId: string, value: number) => {
    const n = Math.max(1, Math.min(999, Math.floor(value)))
    setQuantities((prev) => ({ ...prev, [variantId]: n }))
  }

  const totalLabels = useMemo(() => {
    return variants.reduce((sum, v) => sum + (quantities[v.id] ?? 1), 0)
  }, [variants, quantities])

  const labelsToPrint = useMemo(() => {
    const out: { variant: VariantForLabel; index: number }[] = []
    variants.forEach((v) => {
      const q = quantities[v.id] ?? 1
      for (let i = 0; i < q; i++) out.push({ variant: v, index: i })
    })
    return out
  }, [variants, quantities])

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-prats-navy" />
        <p className="text-muted-foreground">Cargando etiquetas...</p>
      </div>
    )
  }

  if (!variants.length) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          {variantIds.length === 0 && legacyIdsParam
            ? 'Use la lista de Códigos de barras y seleccione variantes (producto + talla) para imprimir. Cada talla tiene su propio código.'
            : 'No hay variantes con código de barras para los IDs indicados.'}
        </p>
        <Button variant="outline" onClick={() => router.back()}>Volver a Códigos de barras</Button>
      </div>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          .print-only, .print-only * { visibility: visible; }
          .print-only { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: 80mm 30mm; margin: 0; }
          .barcode-label { break-after: page; }
        }
      `}} />

      <div className="no-print space-y-6 mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Imprimir etiquetas</h1>
            <p className="text-muted-foreground">
              Configure su impresora Brother QL-700 con papel DK 29×68mm. Indique cuántas etiquetas quiere de cada variante (producto + talla).
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3 max-w-xl">
          <p className="text-sm font-medium text-muted-foreground">Cantidad por variante (producto + talla)</p>
          {variants.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
              <span className="text-sm truncate flex-1 min-w-0" title={`${v.name} ${v.size ? `Talla ${v.size}` : ''}`}>
                {v.name}{v.size ? ` · Talla ${v.size}` : ''}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor={`qty-${v.id}`} className="text-sm text-muted-foreground">Cantidad</label>
                <Input
                  id={`qty-${v.id}`}
                  type="number"
                  min={1}
                  max={999}
                  value={quantities[v.id] ?? 1}
                  onChange={(e) => setQuantity(v.id, parseInt(e.target.value, 10) || 1)}
                  className="w-20 h-9 text-center"
                />
              </div>
            </div>
          ))}
          <p className="text-sm font-semibold pt-2">
            Total: {totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}
          </p>
        </div>

        <Button onClick={handlePrint} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
          <Printer className="h-4 w-4" /> Imprimir {totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}
        </Button>
      </div>

      <div className="print-only flex flex-wrap gap-0">
        {labelsToPrint.map(({ variant: v, index }) => (
          <BarcodeLabel
            key={`${v.id}-${index}`}
            barcode={v.barcode!}
            productName={v.name}
            sku={v.variant_sku || v.sku}
            price={v.price_with_tax ?? v.base_price}
            size={v.size}
          />
        ))}
      </div>
    </>
  )
}
