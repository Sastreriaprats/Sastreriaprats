'use client'

import { useRef, useEffect } from 'react'

/**
 * Etiqueta de código de barras — réplica exacta del diseño físico de tienda.
 * Tamaño: 80mm x 30mm. Para Brother QL-700 u similar.
 */
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

  // Nombre completo con talla al final (como en la etiqueta física)
  const fullName = size && size !== 'U'
    ? `${productName} ${size}`.toUpperCase()
    : productName.toUpperCase()

  // Tamaño de fuente adaptativo: cuanto más largo el nombre, más pequeño.
  // Evita que textos largos se corten por la derecha.
  const nameLen = fullName.length
  const nameFontSize =
    nameLen <= 20 ? 15 :
    nameLen <= 28 ? 13 :
    nameLen <= 36 ? 11 :
    nameLen <= 44 ? 10 : 9
  const nameLineHeight = 1.15

  // Código numérico: extraer números del SKU y padear a 6 dígitos
  const numericCode = (sku.replace(/\D/g, '') || '0').padStart(6, '0')

  // PVP con formato español: "PVP € 590,00"
  const pvpFormatted = `PVP € ${price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Determinar formato del barcode
  const isEan = barcode && /^\d{13}$/.test(barcode)

  useEffect(() => {
    if (!barcode || !canvasRef.current) return
    import('jsbarcode').then((JsBarcode) => {
      try {
        JsBarcode.default(canvasRef.current, barcode, {
          format: isEan ? 'EAN13' : 'CODE128',
          width: isEan ? 2.0 : 1.6,
          height: 40,
          displayValue: true,
          fontSize: 13,
          font: 'Arial',
          textMargin: 1,
          margin: 5,
          background: '#ffffff',
          lineColor: '#000000',
        })
      } catch {
        try {
          JsBarcode.default(canvasRef.current, barcode, {
            format: 'CODE128',
            width: 1.6,
            height: 40,
            displayValue: true,
            fontSize: 13,
            font: 'Arial',
            textMargin: 1,
            margin: 5,
            background: '#ffffff',
            lineColor: '#000000',
          })
        } catch { /* barcode inválido */ }
      }
    })
  }, [barcode, isEan])

  return (
    <div
      className="barcode-label bg-white text-black flex flex-col justify-between box-border"
      style={{
        width: '80mm',
        height: '30mm',
        minWidth: '80mm',
        minHeight: '30mm',
        padding: '2mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      {/* NOMBRE — centrado, uppercase, bold, tamaño adaptativo, wrap a 2 líneas */}
      <div
        style={{
          fontSize: `${nameFontSize}px`,
          fontWeight: 700,
          lineHeight: nameLineHeight,
          textAlign: 'center',
          textTransform: 'uppercase',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          maxHeight: `${nameFontSize * nameLineHeight * 2}px`,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {fullName}
      </div>

      {/* BARCODE — centrado */}
      <div className="flex items-center justify-center" style={{ flex: 1, minHeight: 0, padding: '0.5mm 0' }}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
      </div>

      {/* CÓDIGO + PVP — fila inferior */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: '14px',
          lineHeight: 1.1,
        }}
      >
        <span>{numericCode}</span>
        <span style={{ fontWeight: 700 }}>{pvpFormatted}</span>
      </div>
    </div>
  )
}
