import type { Content } from 'pdfmake'
import { createAdminClient } from '@/lib/supabase/admin'
import { COMPANY } from './pdf-company'
import { getLogoBase64Processed } from './pdf-company-server'
import {
  HEADER_BG,
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

type InvoiceRecord = {
  id: string
  status: string
  invoice_number: string | null
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

/**
 * Genera un PDF de factura con pdfmake según el diseño indicado.
 * Lo sube a Supabase Storage y actualiza invoices.pdf_url. Devuelve la URL pública.
 */
export async function generateInvoicePdf(invoiceId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: inv, error: invError } = await admin
    .from('invoices')
    .select(`id, status, invoice_number, client_name, client_nif, client_address,
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

  const invoice = inv as unknown as InvoiceRecord
  const lines = (rawLines || []) as unknown as PdfLine[]
  const isDraft = invoice.status === 'draft'
  const displayNumber =
    isDraft && (!invoice.invoice_number || !String(invoice.invoice_number).trim())
      ? 'BORRADOR'
      : invoice.invoice_number ?? ''

  const logoData = await getLogoBase64Processed()

  const paymentBlock = buildSectionBox('CONDICIONES DE PAGO', [
    { text: 'Forma de pago:', margin: [8, 6, 8, 2] as [number, number, number, number], fontSize: 9, bold: true },
    { text: COMPANY.payment.form, margin: [8, 0, 8, 4] as [number, number, number, number], fontSize: 9, color: HEADER_BG },
    { text: 'Nº Cuenta para ingreso:', margin: [8, 4, 8, 2] as [number, number, number, number], fontSize: 9, bold: true },
    { text: `Beneficiario: ${COMPANY.payment.beneficiary}`, margin: [8, 0, 8, 2] as [number, number, number, number], fontSize: 9 },
    { text: `Banco: ${COMPANY.payment.bank}`, margin: [8, 0, 8, 2] as [number, number, number, number], fontSize: 9 },
    { text: `IBAN: ${COMPANY.payment.iban}`, margin: [8, 0, 8, 2] as [number, number, number, number], fontSize: 9 },
    { text: `BIC: ${COMPANY.payment.bic}`, margin: [8, 0, 8, 6] as [number, number, number, number], fontSize: 9 },
  ])

  const bodyContent: Content[] = [
    ...buildInfoSection({
      clientName: invoice.client_name,
      clientNif: invoice.client_nif,
      clientAddress: invoice.client_address,
      label1: 'Fecha:',
      date1: invoice.invoice_date,
      label2: 'Vencimiento:',
      date2: invoice.due_date,
    }),
    {
      table: {
        widths: ['*', 40, 55, 35, 55],
        body: buildTableBody(lines) as Content[][],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0' },
    },
    buildTotals({
      subtotal: n(invoice.subtotal),
      taxRate: n(invoice.tax_rate),
      taxAmount: n(invoice.tax_amount),
      irpfRate: n(invoice.irpf_rate),
      irpfAmount: n(invoice.irpf_amount),
      total: n(invoice.total),
    }),
  ]

  if (!isDraft) bodyContent.push(paymentBlock)

  if (invoice.notes) {
    bodyContent.push({
      text: [
        { text: 'Notas: ', bold: true },
        { text: String(invoice.notes).slice(0, 300) },
      ],
      margin: [0, 12, 0, 0] as [number, number, number, number],
      fontSize: 9,
    })
  }

  const content: Content[] = [
    buildHeader(isDraft ? 'BORRADOR' : 'FACTURA', displayNumber, logoData),
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

  const slug = isDraft
    ? `invoices/factura-borrador-${invoice.id.slice(0, 8)}-${Date.now()}.pdf`
    : `invoices/factura-${(invoice.invoice_number ?? '').replace(/\//g, '-')}.pdf`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(slug, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (uploadError) throw new Error(`Error al subir PDF: ${uploadError.message}`)

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(slug)
  await admin.from('invoices').update({ pdf_url: urlData.publicUrl }).eq('id', invoiceId)
  return urlData.publicUrl
}
