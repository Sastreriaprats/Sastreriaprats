import type { Content } from 'pdfmake'
import { createAdminClient } from '@/lib/supabase/admin'
import { COMPANY } from './pdf-company'
import { getLogoBase64Processed } from './pdf-company-server'
import {
  n,
  buildHeader,
  buildInfoSection,
  buildTableBody,
  buildTotals,
  buildSectionBox,
  buildPageFooter,
  initPdfMake,
  type PdfLine,
} from './pdf-layout'

const BUCKET = 'documents'

type EstimateRecord = {
  id: string
  estimate_number: string | null
  client_name: string | null
  client_nif: string | null
  client_address: string | null
  estimate_date: string | null
  valid_until: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  irpf_rate: number
  irpf_amount: number
  total: number
  notes: string | null
}

/**
 * Genera un PDF de presupuesto con pdfmake (mismo diseño que factura).
 * Lo sube a Supabase Storage y actualiza estimates.pdf_url. Devuelve la URL pública.
 */
export async function generateEstimatePdf(estimateId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: est, error } = await admin
    .from('estimates')
    .select(`id, estimate_number, client_name, client_nif, client_address,
      estimate_date, valid_until, subtotal, tax_rate, tax_amount,
      irpf_rate, irpf_amount, total, notes`)
    .eq('id', estimateId)
    .single()

  if (error || !est) throw new Error('Presupuesto no encontrado')

  const { data: rawLines = [] } = await admin
    .from('estimate_lines')
    .select('description, quantity, unit_price, tax_rate, line_total')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true })

  const estimate = est as unknown as EstimateRecord
  const lines = (rawLines || []) as unknown as PdfLine[]
  const displayNumber = estimate.estimate_number ?? ''

  const logoData = await getLogoBase64Processed()

  const validityBlock = buildSectionBox('VALIDEZ DEL PRESUPUESTO', [
    { text: COMPANY.estimateValidity, margin: [8, 6, 8, 6] as [number, number, number, number], fontSize: 9 },
  ])

  const bodyContent: Content[] = [
    ...buildInfoSection({
      clientName: estimate.client_name,
      clientNif: estimate.client_nif,
      clientAddress: estimate.client_address,
      label1: 'Fecha:',
      date1: estimate.estimate_date,
    }),
    {
      table: {
        widths: ['*', 40, 55, 35, 55],
        body: buildTableBody(lines) as Content[][],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0' },
    },
    buildTotals({
      subtotal: n(estimate.subtotal),
      taxRate: n(estimate.tax_rate),
      taxAmount: n(estimate.tax_amount),
      irpfRate: n(estimate.irpf_rate),
      irpfAmount: n(estimate.irpf_amount),
      total: n(estimate.total),
    }),
    validityBlock,
  ]

  if (estimate.notes) {
    bodyContent.push({
      text: [
        { text: 'Notas: ', bold: true },
        { text: String(estimate.notes).slice(0, 300) },
      ],
      margin: [0, 12, 0, 0] as [number, number, number, number],
      fontSize: 9,
    })
  }

  const content: Content[] = [
    buildHeader('PRESUPUESTO', displayNumber, logoData),
    {
      stack: bodyContent,
      margin: [40, 16, 40, 0] as [number, number, number, number],
    },
  ]

  const pdfMake = await initPdfMake()
  const pdf = pdfMake.createPdf({
    pageSize: 'A4',
    pageMargins: [0, 0, 0, 60] as [number, number, number, number],
    footer: buildPageFooter(),
    content,
  } as Parameters<typeof pdfMake.createPdf>[0])
  const pdfBuffer = await (pdf as { getBuffer(): Promise<Buffer> }).getBuffer()

  try {
    await admin.storage.createBucket(BUCKET, { public: true })
  } catch {
    /* ya existe */
  }

  const slug = `estimates/presupuesto-${estimate.id.slice(0, 8)}-${Date.now()}.pdf`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(slug, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (uploadError) throw new Error(`Error al subir PDF: ${uploadError.message}`)

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(slug)

  try {
    await admin.from('estimates').update({ pdf_url: urlData.publicUrl }).eq('id', estimateId)
  } catch {
    /* columna puede no existir */
  }

  return urlData.publicUrl
}
