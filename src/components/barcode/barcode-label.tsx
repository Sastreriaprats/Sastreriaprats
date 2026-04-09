'use client'

import { useRef, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'

/** Etiqueta Brother QL-700, papel DK 29x68mm (horizontal: 68mm ancho x 29mm alto) */
export function BarcodeLabel({
  barcode,
  productName,
  sku,
  price,
  size,
}: {
  barcode: string
  productName: string
  sku: string
  price: number
  size?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!barcode || !canvasRef.current) return
    import('jsbarcode').then((JsBarcode) => {
      try {
        JsBarcode.default(canvasRef.current, barcode, {
          format: 'EAN13',
          width: 1.8,
          height: 40,
          displayValue: false,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        })
      } catch {
        // Fallback: Code128 si EAN13 falla
        try {
          JsBarcode.default(canvasRef.current, barcode, {
            format: 'CODE128',
            width: 1.5,
            height: 40,
            displayValue: false,
            margin: 0,
            background: '#ffffff',
            lineColor: '#000000',
          })
        } catch { /* barcode inválido */ }
      }
    })
  }, [barcode])

  return (
    <div
      className="barcode-label bg-white text-black flex flex-col justify-between box-border"
      style={{
        width: '68mm',
        height: '29mm',
        minWidth: '68mm',
        minHeight: '29mm',
        padding: '2mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      {/* SKU */}
      <div style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '0.02em' }} className="truncate">
        {sku}
      </div>

      {/* Barcode */}
      <div className="flex-1 flex items-center justify-center min-h-0" style={{ margin: '1mm 0' }}>
        <canvas ref={canvasRef} style={{ width: '60mm', height: 'auto', maxHeight: '100%' }} />
      </div>

      {/* Nombre + PVP */}
      <div className="flex justify-between items-baseline gap-1" style={{ fontSize: '8px', lineHeight: 1.1 }}>
        <span className="truncate min-w-0 flex-1">
          {productName}
        </span>
        <span className="shrink-0 font-bold">
          {formatCurrency(price)}
        </span>
      </div>

      {/* Talla */}
      {size && size !== 'U' && (
        <div style={{ fontSize: '8px', fontWeight: 600, lineHeight: 1.1 }}>
          T:{size}
        </div>
      )}
    </div>
  )
}
