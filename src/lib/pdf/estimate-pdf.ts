import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'documents'

const BLUE     = rgb(0.118, 0.227, 0.373)
const BLUE_MID = rgb(0.22,  0.42,  0.62)
const GRAY     = rgb(0.35,  0.35,  0.35)
const LGRAY    = rgb(0.6,   0.6,   0.6)
const WHITE    = rgb(1, 1, 1)
const BLACK    = rgb(0, 0, 0)
const BG_HEADER= rgb(0.118, 0.227, 0.373)
const BG_TABLE = rgb(0.92,  0.95,  0.98)

const W = PageSizes.A4[0]
const H = PageSizes.A4[1]
const ML = 45
const MR = W - 45

function n(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  return Number(String(v).replace(',', '.')) || 0
}

function eur(v: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €'
}

export async function generateEstimatePdf(estimateId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: est, error } = await admin
    .from('estimates')
    .select(`id, estimate_number, client_name, client_nif, client_address,
      estimate_date, valid_until, subtotal, tax_rate, tax_amount,
      irpf_rate, irpf_amount, total, notes, status`)
    .eq('id', estimateId)
    .single()

  if (error || !est) throw new Error('Presupuesto no encontrado')

  const { data: rawLines = [] } = await admin
    .from('estimate_lines')
    .select('description, quantity, unit_price, tax_rate, line_total')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true })

  const COMPANY_NAME    = 'Sastrería Prats'
  const COMPANY_NIF     = 'B12345678'
  const COMPANY_ADDRESS = 'Madrid, España'

  const doc = await PDFDocument.create()
  doc.setTitle(`Presupuesto ${est.estimate_number}`)
  doc.setAuthor('Sastrería Prats')

  const regular = doc.embedStandardFont(StandardFonts.Helvetica)
  const bold    = doc.embedStandardFont(StandardFonts.HelveticaBold)

  const page = doc.addPage(PageSizes.A4)

  // ── 1. CABECERA AZUL ────────────────────────────────────────────────────────
  const HEADER_H = 90
  page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: BG_HEADER })

  page.drawText('PRATS', { x: ML, y: H - 38, size: 28, font: bold, color: WHITE })
  page.drawText('SASTRERÍA', { x: ML, y: H - 54, size: 10, font: regular, color: rgb(0.7, 0.85, 1) })

  page.drawText('PRESUPUESTO', { x: MR - 140, y: H - 40, size: 20, font: bold, color: WHITE })

  const numBoxW = 140
  const numBoxX = MR - numBoxW
  page.drawRectangle({ x: numBoxX, y: H - HEADER_H + 8, width: numBoxW, height: 26, color: WHITE })
  page.drawText(`Nº: ${est.estimate_number}`, { x: numBoxX + 8, y: H - HEADER_H + 18, size: 12, font: bold, color: BLUE })

  let y = H - HEADER_H - 24

  // ── 2. FECHAS ────────────────────────────────────────────────────────────────
  page.drawText(`Fecha:`, { x: MR - 200, y, size: 9, font: regular, color: LGRAY })
  page.drawText(String(est.estimate_date || ''), { x: MR - 150, y, size: 9, font: bold, color: GRAY })
  if (est.valid_until) {
    y -= 14
    page.drawText(`Válido hasta:`, { x: MR - 200, y, size: 9, font: regular, color: LGRAY })
    page.drawText(String(est.valid_until), { x: MR - 150, y, size: 9, font: bold, color: GRAY })
  }

  // ── 3. DOS COLUMNAS ──────────────────────────────────────────────────────────
  const colTopY = H - HEADER_H - 20
  const colH    = 75
  const halfW   = (MR - ML - 8) / 2
  const c2X     = ML + halfW + 8

  page.drawText('EMPRESA', { x: ML, y: colTopY - 16, size: 8, font: bold, color: BLUE })
  page.drawLine({ start: { x: ML, y: colTopY - 19 }, end: { x: ML + halfW, y: colTopY - 19 }, thickness: 0.5, color: BLUE })
  page.drawText(COMPANY_NAME, { x: ML, y: colTopY - 31, size: 9, font: bold, color: BLACK })
  page.drawText(`NIF: ${COMPANY_NIF}`, { x: ML, y: colTopY - 43, size: 8, font: regular, color: GRAY })
  page.drawText(COMPANY_ADDRESS, { x: ML, y: colTopY - 54, size: 8, font: regular, color: GRAY })

  page.drawText('CLIENTE', { x: c2X, y: colTopY - 16, size: 8, font: bold, color: BLUE })
  page.drawLine({ start: { x: c2X, y: colTopY - 19 }, end: { x: MR, y: colTopY - 19 }, thickness: 0.5, color: BLUE })
  page.drawText(String(est.client_name || ''), { x: c2X, y: colTopY - 31, size: 9, font: bold, color: BLACK })
  if (est.client_nif) page.drawText(`NIF/CIF: ${est.client_nif}`, { x: c2X, y: colTopY - 43, size: 8, font: regular, color: GRAY })
  if (est.client_address) page.drawText(String(est.client_address).slice(0, 42), { x: c2X, y: colTopY - 54, size: 8, font: regular, color: GRAY })

  y = colTopY - colH - 20

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

  page.drawRectangle({ x: ML, y: y - HEAD_H, width: TABLE_W, height: HEAD_H, color: BG_TABLE })
  page.drawText('CONCEPTO',  { x: cDesc + 4,    y: y - 15, size: 8, font: bold, color: BLUE })
  page.drawText('CANT.',     { x: cQty + 4,     y: y - 15, size: 8, font: bold, color: BLUE })
  page.drawText('PRECIO',    { x: cPrice + 4,   y: y - 15, size: 8, font: bold, color: BLUE })
  page.drawText('IVA',       { x: cTax + 4,     y: y - 15, size: 8, font: bold, color: BLUE })
  page.drawText('TOTAL',     { x: cLineTot + 4, y: y - 15, size: 8, font: bold, color: BLUE })
  y -= HEAD_H

  const lines = (rawLines || []) as { description: string; quantity: number; unit_price: number; tax_rate: number; line_total: number }[]
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

  page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: BLUE_MID })
  y -= 16

  // ── 5. TOTALES ───────────────────────────────────────────────────────────────
  const totLabelX = MR - 155
  const totValX   = MR - 60

  const drawTotalRow = (label: string, value: string, isBig = false) => {
    const size = isBig ? 11 : 9
    page.drawText(label, { x: totLabelX, y, size, font: isBig ? bold : regular, color: isBig ? BLUE : GRAY })
    page.drawText(value, { x: totValX,   y, size, font: isBig ? bold : regular, color: isBig ? BLUE : GRAY })
    y -= isBig ? 18 : 14
  }

  drawTotalRow('Subtotal:', eur(n(est.subtotal)))
  drawTotalRow(`IVA (${n(est.tax_rate)}%):`, eur(n(est.tax_amount)))
  if (n(est.irpf_amount) > 0) drawTotalRow(`IRPF (${n(est.irpf_rate)}%):`, `- ${eur(n(est.irpf_amount))}`)

  y -= 4
  page.drawRectangle({ x: totLabelX - 8, y: y - 22, width: MR - totLabelX + 8, height: 28, color: BLUE })
  page.drawText('TOTAL', { x: totLabelX,  y: y - 12, size: 12, font: bold, color: WHITE })
  page.drawText(eur(n(est.total)), { x: totValX, y: y - 12, size: 12, font: bold, color: WHITE })
  y -= 38

  // ── 6. NOTAS ─────────────────────────────────────────────────────────────────
  if (est.notes && y > 70) {
    page.drawText('Notas:', { x: ML, y, size: 8, font: bold, color: BLUE })
    y -= 12
    page.drawText(String(est.notes).slice(0, 200), { x: ML, y, size: 8, font: regular, color: GRAY })
  }

  // ── 7. PIE ───────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: ML, y: 35 }, end: { x: MR, y: 35 }, thickness: 0.4, color: BLUE })
  page.drawText(`Sastrería Prats  ·  ${COMPANY_NIF}  ·  ${COMPANY_ADDRESS}`,
    { x: ML, y: 22, size: 7, font: regular, color: LGRAY })
  page.drawText('Este presupuesto no tiene validez fiscal hasta su aceptación firmada.',
    { x: ML, y: 11, size: 6, font: regular, color: LGRAY })

  // ── 8. SUBIR A STORAGE ───────────────────────────────────────────────────────
  const pdfBytes = await doc.save()

  try { await admin.storage.createBucket(BUCKET, { public: true }) } catch { /* ya existe */ }

  const slug = `estimates/${String(est.estimate_number).replace(/\//g, '-')}.pdf`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(slug, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (uploadError) throw new Error(`Error al subir PDF: ${uploadError.message}`)

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(slug)

  try {
    await admin.from('estimates').update({ pdf_url: urlData.publicUrl }).eq('id', estimateId)
  } catch { /* columna puede no existir */ }

  return urlData.publicUrl
}
