'use client'

import { useRef, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'

/** Etiqueta Brother QL-700, papel DK 29x68mm (horizontal: 68mm ancho x 29mm alto) */
export function BarcodeLabel({
  barcode,
  productName,
  sku,
  price,
}: {
  barcode: string
  productName: string
  sku: string
  price: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!barcode || !canvasRef.current) return
    import('jsbarcode').then((JsBarcode) => {
      try {
        JsBarcode.default(canvasRef.current, barcode, {
          format: 'EAN13',
          width: 1.2,
          height: 28,
          displayValue: false,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        })
      } catch (e) {
        console.error('[BarcodeLabel] JsBarcode:', e)
      }
    })
  }, [barcode])

  return (
    <div
      className="barcode-label bg-white text-black flex flex-col justify-between p-1 box-border"
      style={{
        width: '68mm',
        height: '29mm',
        minWidth: '68mm',
        minHeight: '29mm',
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}
    >
      <div className="text-[7px] font-bold uppercase truncate leading-tight" style={{ maxHeight: '6mm' }}>
        {productName}
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0 py-0.5">
        <canvas ref={canvasRef} className="max-w-full max-h-full" />
      </div>
      <div className="flex justify-between items-end text-[6px] mt-0.5">
        <span className="font-mono">{sku}</span>
        <span>PVP {formatCurrency(price)}</span>
      </div>
    </div>
  )
}
