import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'documents'

// Azul corporativo Prats: #1E3A5F
const BLUE     = rgb(0.118, 0.227, 0.373)
const BLUE_MID = rgb(0.22,  0.42,  0.62)
const GRAY     = rgb(0.35,  0.35,  0.35)
const LGRAY    = rgb(0.6,   0.6,   0.6)
const WHITE    = rgb(1, 1, 1)
const BLACK    = rgb(0, 0, 0)
const BG_HEADER= rgb(0.118, 0.227, 0.373)  // cabecera azul sólida
const BG_TABLE = rgb(0.92,  0.95,  0.98)   // azul pálido filas cabecera tabla

const W = PageSizes.A4[0] // 595
const H = PageSizes.A4[1] // 842
const ML = 45             // margen izq
const MR = W - 45         // margen der

type InvoiceRecord = {
  id: string
  invoice_number: string
  client_name: string
  client_nif: string | null
  client_address: string | null
  company_name: string
  company_nif: string
  company_address: string
  invoice_date: string
  due_date: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  irpf_rate: number
  irpf_amount: number
  total: number
  notes: string | null
}

type InvoiceLineRecord = {
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  line_total: number
}

function n(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  return Number(String(v).replace(',', '.')) || 0
}

function eur(v: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €'
}

function fmt(v: string | null | undefined): string {
  return v ? String(v) : ''
}

/**
 * Genera un PDF profesional de la factura con logo Prats y azul corporativo.
 * Lo sube a Supabase Storage y actualiza invoices.pdf_url. Devuelve la URL pública.
 */
export async function generateInvoicePdf(invoiceId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: inv, error: invError } = await admin
    .from('invoices')
    .select(`id, invoice_number, client_name, client_nif, client_address,
      company_name, company_nif, company_address,
      invoice_date, due_date, subtotal, tax_rate, tax_amount,
      irpf_rate, irpf_amount, total, notes`)
    .eq('id', invoiceId)
    .single()

  if (invError || !inv) throw new Error('Factura no encontrada')

  const { data: rawLines = [] } = await admin
    .from('invoice_lines')
    .select('description, quantity, unit_price, tax_rate, line_total')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true })

  const doc = await PDFDocument.create()
  doc.setTitle(`Factura ${inv.invoice_number}`)
  doc.setAuthor('Sastrería Prats')

  const regular = doc.embedStandardFont(StandardFonts.Helvetica)
  const bold    = doc.embedStandardFont(StandardFonts.HelveticaBold)

  const page = doc.addPage(PageSizes.A4)

  const invoice = inv as unknown as InvoiceRecord
  const lines   = (rawLines || []) as unknown as InvoiceLineRecord[]

  // ── 1. CABECERA AZUL ────────────────────────────────────────────────────────
  const HEADER_H = 90
  page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: BG_HEADER })

  // Logo "Prats" en la cabecera (izquierda)
  page.drawText('PRATS', { x: ML, y: H - 38, size: 28, font: bold, color: WHITE })
  page.drawText('SASTRERÍA', { x: ML, y: H - 54, size: 10, font: regular, color: rgb(0.7, 0.85, 1) })

  // "FACTURA" a la derecha
  page.drawText('FACTURA', { x: MR - 120, y: H - 40, size: 22, font: bold, color: WHITE })

  // Número en caja blanca dentro de la cabecera
  const numBoxW = 130
  const numBoxX = MR - numBoxW
  page.drawRectangle({ x: numBoxX, y: H - HEADER_H + 8, width: numBoxW, height: 26, color: WHITE, borderColor: WHITE, borderWidth: 0 })
  page.drawText(`Nº: ${invoice.invoice_number}`, { x: numBoxX + 8, y: H - HEADER_H + 18, size: 12, font: bold, color: BLUE })

  let y = H - HEADER_H - 24

  // ── 2. FECHAS ────────────────────────────────────────────────────────────────
  page.drawText(`Fecha:`, { x: MR - 200, y, size: 9, font: regular, color: LGRAY })
  page.drawText(invoice.invoice_date, { x: MR - 150, y, size: 9, font: bold, color: GRAY })
  if (invoice.due_date) {
    y -= 14
    page.drawText(`Vencimiento:`, { x: MR - 200, y, size: 9, font: regular, color: LGRAY })
    page.drawText(invoice.due_date, { x: MR - 150, y, size: 9, font: bold, color: GRAY })
  }

  // ── 3. DOS COLUMNAS: EMPRESA | CLIENTE ───────────────────────────────────────
  const colTopY = H - HEADER_H - 20
  const colH    = 75
  const halfW   = (MR - ML - 8) / 2
  const c2X     = ML + halfW + 8

  // Empresa (izquierda)
  page.drawText('EMPRESA', { x: ML, y: colTopY - 16, size: 8, font: bold, color: BLUE })
  page.drawLine({ start: { x: ML, y: colTopY - 19 }, end: { x: ML + halfW, y: colTopY - 19 }, thickness: 0.5, color: BLUE })
  page.drawText(invoice.company_name, { x: ML, y: colTopY - 31, size: 9, font: bold, color: BLACK })
  page.drawText(`NIF: ${invoice.company_nif}`, { x: ML, y: colTopY - 43, size: 8, font: regular, color: GRAY })
  page.drawText(invoice.company_address.slice(0, 42), { x: ML, y: colTopY - 54, size: 8, font: regular, color: GRAY })

  // Cliente (derecha)
  page.drawText('CLIENTE', { x: c2X, y: colTopY - 16, size: 8, font: bold, color: BLUE })
  page.drawLine({ start: { x: c2X, y: colTopY - 19 }, end: { x: MR, y: colTopY - 19 }, thickness: 0.5, color: BLUE })
  page.drawText(invoice.client_name, { x: c2X, y: colTopY - 31, size: 9, font: bold, color: BLACK })
  if (invoice.client_nif) page.drawText(`NIF/CIF: ${invoice.client_nif}`, { x: c2X, y: colTopY - 43, size: 8, font: regular, color: GRAY })
  if (invoice.client_address) page.drawText(String(invoice.client_address).slice(0, 42), { x: c2X, y: colTopY - 54, size: 8, font: regular, color: GRAY })

  y = colTopY - colH - 20

  // Línea separadora
  page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: BLUE_MID })
  y -= 16

  // ── 4. TABLA DE LÍNEAS ───────────────────────────────────────────────────────
  const cDesc    = ML
  const cQty     = ML + 230
  const cPrice   = ML + 295
  const cTax     = ML + 370
  const cLineTot = MR - 60
  const TABLE_W  = MR - ML
  const ROW_H    = 20
  const HEAD_H   = 22

  // Cabecera tabla
  page.drawRectangle({ x: ML, y: y - HEAD_H, width: TABLE_W, height: HEAD_H, color: BG_TABLE })
  page.drawText('CONCEPTO',  { x: cDesc + 4,     y: y - 15, size: 8, font: bold, color: BLUE })
  page.drawText('CANT.',     { x: cQty + 4,      y: y - 15, size: 8, font: bold, color: BLUE })
  page.drawText('PRECIO',    { x: cPrice + 4,    y: y - 15, size: 8, font: bold, color: BLUE })
  page.drawText('IVA',       { x: cTax + 4,      y: y - 15, size: 8, font: bold, color: BLUE })
  page.drawText('TOTAL',     { x: cLineTot + 4,  y: y - 15, size: 8, font: bold, color: BLUE })
  y -= HEAD_H

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]
    const rowY = y - ROW_H * (i + 1)
    if (i % 2 === 1) page.drawRectangle({ x: ML, y: rowY, width: TABLE_W, height: ROW_H, color: rgb(0.97, 0.97, 0.97) })
    page.drawText(String(ln.description ?? '').slice(0, 40), { x: cDesc + 4,    y: rowY + 6, size: 8, font: regular, color: GRAY })
    page.drawText(String(n(ln.quantity)),                    { x: cQty + 4,     y: rowY + 6, size: 8, font: regular, color: GRAY })
    page.drawText(eur(n(ln.unit_price)),                     { x: cPrice + 4,   y: rowY + 6, size: 8, font: regular, color: GRAY })
    page.drawText(`${n(ln.tax_rate)}%`,                      { x: cTax + 4,     y: rowY + 6, size: 8, font: regular, color: GRAY })
    page.drawText(eur(n(ln.line_total)),                     { x: cLineTot + 4, y: rowY + 6, size: 8, font: bold,    color: GRAY })
  }
  y -= ROW_H * lines.length

  // Borde inferior tabla
  page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: BLUE_MID })
  y -= 16

  // ── 5. TOTALES (columna derecha) ─────────────────────────────────────────────
  const totLabelX = MR - 155
  const totValX   = MR - 60

  const drawTotalRow = (label: string, value: string, isBig = false) => {
    const size = isBig ? 11 : 9
    page.drawText(label, { x: totLabelX, y, size, font: isBig ? bold : regular, color: isBig ? BLUE : GRAY })
    page.drawText(value, { x: totValX,   y, size, font: isBig ? bold : regular, color: isBig ? BLUE : GRAY })
    y -= isBig ? 18 : 14
  }

  drawTotalRow('Subtotal:',        eur(n(invoice.subtotal)))
  drawTotalRow(`IVA (${n(invoice.tax_rate)}%):`, eur(n(invoice.tax_amount)))
  if (n(invoice.irpf_amount) > 0)
    drawTotalRow(`IRPF (${n(invoice.irpf_rate)}%):`, `- ${eur(n(invoice.irpf_amount))}`)

  // Caja TOTAL
  y -= 4
  page.drawRectangle({ x: totLabelX - 8, y: y - 22, width: MR - totLabelX + 8, height: 28, color: BLUE })
  page.drawText('TOTAL', { x: totLabelX,  y: y - 12, size: 12, font: bold, color: WHITE })
  page.drawText(eur(n(invoice.total)), { x: totValX, y: y - 12, size: 12, font: bold, color: WHITE })
  y -= 38

  // ── 6. INFO DE PAGO ──────────────────────────────────────────────────────────
  if (y > 110) {
    page.drawRectangle({ x: ML, y: y - 52, width: 200, height: 56, borderColor: BLUE, borderWidth: 0.6 })
    page.drawRectangle({ x: ML, y: y - 16, width: 200, height: 16, color: BG_TABLE })
    page.drawText('INFORMACIÓN DE PAGO', { x: ML + 6, y: y - 11, size: 8, font: bold, color: BLUE })
    page.drawText('Transferencia bancaria', { x: ML + 6, y: y - 26, size: 8, font: regular, color: GRAY })
    page.drawText(invoice.company_name,     { x: ML + 6, y: y - 38, size: 8, font: regular, color: GRAY })
    y -= 62
  }

  // ── 7. NOTAS ─────────────────────────────────────────────────────────────────
  if (invoice.notes && y > 70) {
    page.drawText('Notas:', { x: ML, y, size: 8, font: bold, color: BLUE })
    y -= 12
    page.drawText(String(invoice.notes).slice(0, 200), { x: ML, y, size: 8, font: regular, color: GRAY })
  }

  // ── 8. PIE ───────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: ML, y: 35 }, end: { x: MR, y: 35 }, thickness: 0.4, color: BLUE })
  page.drawText('Sastrería Prats  ·  ' + invoice.company_nif + '  ·  ' + invoice.company_address,
    { x: ML, y: 22, size: 7, font: regular, color: LGRAY })

  // ── 9. SUBIR A STORAGE ───────────────────────────────────────────────────────
  const pdfBytes = await doc.save()

  try { await admin.storage.createBucket(BUCKET, { public: true }) } catch { /* ya existe */ }

  const slug = `invoices/${invoice.invoice_number.replace(/\//g, '-')}.pdf`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(slug, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (uploadError) throw new Error(`Error al subir PDF: ${uploadError.message}`)

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(slug)
  await admin.from('invoices').update({ pdf_url: urlData.publicUrl }).eq('id', invoiceId)
  return urlData.publicUrl
}
