import type { Content } from 'pdfmake'
import { createAdminClient } from '@/lib/supabase/admin'
import { COMPANY, formatDateDDMMYYYY, eurFormat, getLogoBase64 } from './pdf-company'

const BUCKET = 'documents'

const HEADER_BG = '#1a1a2e'
const ROW_ALT = '#f9f9f9'

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
  const lines = (rawLines || []) as unknown as InvoiceLineRecord[]
  const isDraft = invoice.status === 'draft'
  const displayNumber =
    isDraft && (!invoice.invoice_number || !String(invoice.invoice_number).trim())
      ? 'BORRADOR'
      : invoice.invoice_number ?? ''

  const logoData = getLogoBase64()

  const headerRight: Content[] = [
    { text: isDraft ? 'BORRADOR' : 'FACTURA', fontSize: 28, bold: true, color: 'white', alignment: 'right', margin: [0, 0, 0, 4] },
    { text: `Nº: ${displayNumber}`, fontSize: 10, color: 'white', alignment: 'right', margin: [0, 0, 0, 2] },
    { text: `Fecha: ${formatDateDDMMYYYY(invoice.invoice_date)}`, fontSize: 10, color: 'white', alignment: 'right', margin: [0, 0, 0, 2] },
  ]
  if (invoice.due_date) {
    headerRight.push({
      text: `Vencimiento: ${formatDateDDMMYYYY(invoice.due_date)}`,
      fontSize: 10,
      color: 'white',
      alignment: 'right',
    })
  }

  const headerTable: Content = {
    table: {
      widths: ['40%', '60%'],
      body: [
        [
          {
            fillColor: '#ffffff',
            margin: [10, 10, 10, 10] as [number, number, number, number],
            ...(logoData
              ? { image: logoData, width: 140, alignment: 'center' as const }
              : { text: 'SASTRERÍA PRATS', fontSize: 18, bold: true, color: '#1a1a2e', alignment: 'center' as const }),
          },
          {
            fillColor: HEADER_BG,
            stack: headerRight,
            alignment: 'right',
            margin: [0, 8, 0, 8] as [number, number, number, number],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 0],
  }

  const headerGoldenLine: Content = {
    table: {
      widths: ['*'],
      body: [[{ fillColor: '#c9a96e', text: '', height: 2 }]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 16],
  }

  const companyBlock: Content = {
    stack: [
      { text: 'EMPRESA', fontSize: 8, bold: true, color: '#666', margin: [0, 0, 0, 2] },
      { text: COMPANY.name, fontSize: 10, bold: true, color: 'black', margin: [0, 0, 0, 2] },
      { text: `NIF / CIF: ${COMPANY.nif}`, fontSize: 9, color: 'black', margin: [0, 0, 0, 2] },
      { text: COMPANY.address, fontSize: 9, color: 'black', margin: [0, 0, 0, 2] },
      { text: `${COMPANY.postalCode}, ${COMPANY.city}, ${COMPANY.country}`, fontSize: 9, color: 'black' },
    ],
  }

  const clientLines: Content[] = [
    { text: 'CLIENTE', fontSize: 8, bold: true, color: '#666', margin: [0, 0, 0, 2] },
    { text: invoice.client_name || '—', fontSize: 10, bold: true, color: 'black', margin: [0, 0, 0, 2] },
  ]
  if (invoice.client_nif)
    clientLines.push({
      text: `NIF / CIF: ${invoice.client_nif}`,
      fontSize: 9,
      color: 'black',
      margin: [0, 0, 0, 2],
    })
  if (invoice.client_address)
    clientLines.push({
      text: `Dirección: ${String(invoice.client_address)}`,
      fontSize: 9,
      color: 'black',
    })

  const clientBlock: Content = { stack: clientLines }

  const tableHeader = [
    { text: 'CONCEPTO', fillColor: HEADER_BG, color: 'white', bold: true },
    { text: 'CANT.', fillColor: HEADER_BG, color: 'white', bold: true },
    { text: 'PRECIO', fillColor: HEADER_BG, color: 'white', bold: true },
    { text: 'IVA', fillColor: HEADER_BG, color: 'white', bold: true },
    { text: 'TOTAL', fillColor: HEADER_BG, color: 'white', bold: true },
  ]
  const tableBody: unknown[][] = [tableHeader]
  lines.forEach((ln, i) => {
    tableBody.push([
      {
        text: String(ln.description ?? '').slice(0, 50),
        fillColor: i % 2 === 1 ? ROW_ALT : undefined,
      },
      { text: String(n(ln.quantity)), fillColor: i % 2 === 1 ? ROW_ALT : undefined },
      { text: eurFormat(n(ln.unit_price)), fillColor: i % 2 === 1 ? ROW_ALT : undefined },
      { text: `${n(ln.tax_rate)}%`, fillColor: i % 2 === 1 ? ROW_ALT : undefined },
      {
        text: eurFormat(n(ln.line_total)),
        fillColor: i % 2 === 1 ? ROW_ALT : undefined,
        bold: true,
      },
    ])
  })

  const totals: Content = {
    columns: [
      { text: '' },
      {
        stack: [
          {
            text: `Subtotal: ${eurFormat(n(invoice.subtotal))}`,
            alignment: 'right',
            margin: [0, 0, 0, 4],
            fontSize: 10,
          },
          {
            text: `IVA (${n(invoice.tax_rate)}%): ${eurFormat(n(invoice.tax_amount))}`,
            alignment: 'right',
            margin: [0, 0, 0, 4],
            fontSize: 10,
          },
          ...(n(invoice.irpf_amount) > 0
            ? [
                {
                  text: `IRPF (${n(invoice.irpf_rate)}%): - ${eurFormat(n(invoice.irpf_amount))}`,
                  alignment: 'right' as const,
                  margin: [0, 0, 0, 4] as [number, number, number, number],
                  fontSize: 10,
                },
              ]
            : []),
          {
            text: `TOTAL: ${eurFormat(n(invoice.total))}`,
            fontSize: 14,
            bold: true,
            alignment: 'right',
            margin: [0, 8, 0, 0] as [number, number, number, number],
          },
        ],
        width: 200,
      },
    ],
    margin: [0, 12, 0, 0],
  }

  const paymentBlock: Content = {
    stack: [
      { text: 'CONDICIONES DE PAGO', fontSize: 8, bold: true, color: '#666', margin: [0, 0, 0, 6] },
      { text: `Forma de pago: ${COMPANY.payment.form}`, fontSize: 9, margin: [0, 0, 0, 2] },
      { text: `Beneficiario: ${COMPANY.payment.beneficiary}`, fontSize: 9, margin: [0, 0, 0, 2] },
      { text: `Banco: ${COMPANY.payment.bank}`, fontSize: 9, margin: [0, 0, 0, 2] },
      { text: `IBAN: ${COMPANY.payment.iban}`, fontSize: 9, margin: [0, 0, 0, 2] },
      { text: `BIC: ${COMPANY.payment.bic}`, fontSize: 9 },
    ],
    margin: [0, 16, 0, 0],
  }

  const footerContent: Content = {
    stack: [
      {
        text: COMPANY.footerLine1,
        fontSize: 7,
        color: '#666',
        alignment: 'center',
        margin: [0, 0, 0, 2],
      },
      {
        text: COMPANY.registroMercantil,
        fontSize: 6,
        color: '#666',
        alignment: 'center',
        margin: [0, 0, 0, 2],
      },
      {
        text: `Teléfono: ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}`,
        fontSize: 6,
        color: '#666',
        alignment: 'center',
      },
    ],
    margin: [40, 20, 40, 0],
  }

  const content: Content[] = [
    headerTable,
    headerGoldenLine,
    {
      columns: [
        { width: '*', ...companyBlock },
        { width: '*', ...clientBlock },
      ],
      margin: [0, 0, 0, 16],
    },
    {
      table: {
        widths: ['*', 40, 55, 35, 55],
        body: tableBody as Content[][],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
      },
    },
    totals,
  ]
  if (!isDraft) content.push(paymentBlock)
  if (invoice.notes) {
    content.push({
      text: [
        { text: 'Notas: ', bold: true },
        { text: String(invoice.notes).slice(0, 300) },
      ],
      margin: [0, 12, 0, 0],
      fontSize: 9,
    })
  }
  content.push(footerContent)

  const docDef = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 80],
    content,
  }

  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])
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
