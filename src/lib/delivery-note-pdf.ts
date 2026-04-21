type DeliveryNotePdfLine = {
  product_name?: string | null
  sku?: string | null
  quantity?: number | null
  unit_price?: number | null
  unit_price_with_tax?: number | null
  tax_rate?: number | null
}

type DeliveryNotePdfData = {
  number: string
  created_at?: string | null
  notes?: string | null
  from_warehouse?: { name?: string | null; code?: string | null } | null
  to_warehouse?: { name?: string | null; code?: string | null } | null
  lines?: DeliveryNotePdfLine[]
}

function euro(v: number): string {
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} €`
}

function fmtDate(v?: string | null): string {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('es-ES')
}

export async function generateDeliveryNotePdf(data: DeliveryNotePdfData): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  const margin = 14
  const pageW = 210
  const right = pageW - margin
  let y = 18

  doc.setFont('times', 'bold')
  doc.setFontSize(18)
  doc.text('SASTRERÍA PRATS', margin, y)
  y += 6
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.text('ALBARÁN DE ENTREGA', margin, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`Nº ${data.number || '-'}`, right, 18, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text(`Fecha: ${fmtDate(data.created_at)}`, right, 24, { align: 'right' })

  y += 12
  doc.setDrawColor(150)
  doc.line(margin, y, right, y)
  y += 8

  const fromText = data.from_warehouse?.name || data.from_warehouse?.code || '-'
  const toText = data.to_warehouse?.name || data.to_warehouse?.code || '-'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Origen:', margin, y)
  doc.text('Destino:', 110, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(fromText, margin, y)
  doc.text(toText, 110, y)
  y += 8

  // Cabecera de tabla
  const colX = { product: margin, sku: 92, qty: 126, unit: 146, total: 172 }
  doc.setFillColor(238, 241, 246)
  doc.rect(margin, y, right - margin, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Producto', colX.product + 1, y + 5.4)
  doc.text('SKU', colX.sku + 1, y + 5.4)
  doc.text('Cantidad', colX.qty + 1, y + 5.4)
  doc.text('P.Unit. (IVA)', colX.unit + 1, y + 5.4)
  doc.text('Total (IVA)', colX.total + 1, y + 5.4)
  y += 8

  let grandTotal = 0
  doc.setFont('helvetica', 'normal')
  const lines = data.lines || []
  for (const line of lines) {
    const qty = Number(line.quantity || 0)
    const net = Number(line.unit_price || 0)
    const taxRate = Number(line.tax_rate ?? 21)
    const unitPrice = line.unit_price_with_tax != null
      ? Number(line.unit_price_with_tax)
      : net * (1 + taxRate / 100)
    const lineTotal = qty * unitPrice
    grandTotal += lineTotal

    doc.setFontSize(8.7)
    doc.text(String(line.product_name || '-').slice(0, 38), colX.product + 1, y + 5.2)
    doc.text(String(line.sku || '-').slice(0, 18), colX.sku + 1, y + 5.2)
    doc.text(String(qty), colX.qty + 1, y + 5.2)
    doc.text(net ? euro(unitPrice) : '-', colX.unit + 1, y + 5.2)
    doc.text(net ? euro(lineTotal) : '-', colX.total + 1, y + 5.2)
    doc.setDrawColor(230)
    doc.line(margin, y + 7, right, y + 7)
    y += 7
    if (y > 255) break
  }

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Total general: ${euro(grandTotal)}`, right, y, { align: 'right' })
  y += 10

  if (data.notes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Notas:', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    const noteLines = doc.splitTextToSize(data.notes.trim(), right - margin)
    doc.text(noteLines, margin, y)
    y += Math.min(24, noteLines.length * 4.2)
  }

  y = Math.max(y + 10, 245)
  doc.setDrawColor(140)
  doc.line(120, y, right, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Recibido:', 120, y + 5)

  doc.setFont('times', 'italic')
  doc.setFontSize(8)
  doc.text('SASTRERÍA PRATS MADRID · sastreriaprats.com', pageW / 2, 287, { align: 'center' })

  const safeNumber = (data.number || 'albaran').replace(/[^\w-]/g, '-')
  doc.save(`${safeNumber}.pdf`)
}
