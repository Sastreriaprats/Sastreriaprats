import type { Content } from 'pdfmake'
import { createAdminClient } from '@/lib/supabase/admin'
import { COMPANY, formatDateDDMMYYYY, eurFormat, getLogoBase64 } from './pdf-company'

const BUCKET = 'documents'

const HEADER_BG = '#1a1a2e'
const ROW_ALT = '#f5f5f5'

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

type EstimateLineRecord = {
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
 * Genera un PDF de presupuesto con pdfmake (mismo layout que factura).
 * Lo sube a Supabase Storage y actualiza estimates.pdf_url. Devuelve la URL pública.
 */
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

  const estimate = est as unknown as EstimateRecord
  const lines = (rawLines || []) as unknown as EstimateLineRecord[]
  const displayNumber = estimate.estimate_number ?? ''

  const logoData = getLogoBase64()

  const headerRight: Content[] = [
    { text: 'PRESUPUESTO', fontSize: 22, bold: true, color: 'white', margin: [0, 0, 0, 4] },
    { text: `Nº: ${displayNumber}`, fontSize: 11, bold: true, color: 'white', margin: [0, 0, 0, 2] },
    { text: `Fecha: ${formatDateDDMMYYYY(estimate.estimate_date)}`, fontSize: 9, color: 'white', margin: [0, 0, 0, 2] },
  ]
  if (estimate.valid_until) {
    headerRight.push({
      text: `Válido hasta: ${formatDateDDMMYYYY(estimate.valid_until)}`,
      fontSize: 9,
      color: 'white',
    })
  }

  const headerTable: Content = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            fillColor: HEADER_BG,
            columns: [
              logoData
                ? { image: logoData, width: 100, margin: [0, 8, 0, 8] }
                : { text: 'Sastrería Prats', fontSize: 18, bold: true, color: 'white', margin: [0, 8, 0, 8] },
              { stack: headerRight, alignment: 'right', margin: [0, 8, 0, 8] },
            ],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 16],
  }

  const companyBlock: Content = {
    stack: [
      { text: 'Empresa:', fontSize: 8, bold: true, color: '#333', margin: [0, 0, 0, 2] },
      { text: COMPANY.name, fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
      { text: `NIF / CIF: ${COMPANY.nif}`, fontSize: 9, margin: [0, 0, 0, 2] },
      { text: COMPANY.fullAddress, fontSize: 9 },
    ],
  }

  const clientLines: Content[] = [
    { text: 'Cliente:', fontSize: 8, bold: true, color: '#333', margin: [0, 0, 0, 2] },
    { text: estimate.client_name || '—', fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
  ]
  if (estimate.client_nif)
    clientLines.push({
      text: `NIF / CIF: ${estimate.client_nif}`,
      fontSize: 9,
      margin: [0, 0, 0, 2],
    })
  if (estimate.client_address)
    clientLines.push({
      text: `Dirección: ${String(estimate.client_address)}`,
      fontSize: 9,
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
            text: `Subtotal: ${eurFormat(n(estimate.subtotal))}`,
            alignment: 'right',
            margin: [0, 0, 0, 4],
          },
          {
            text: `IVA (${n(estimate.tax_rate)}%): ${eurFormat(n(estimate.tax_amount))}`,
            alignment: 'right',
            margin: [0, 0, 0, 4],
          },
          ...(n(estimate.irpf_amount) > 0
            ? [
                {
                  text: `IRPF (${n(estimate.irpf_rate)}%): - ${eurFormat(n(estimate.irpf_amount))}`,
                  alignment: 'right' as const,
                  margin: [0, 0, 0, 4] as [number, number, number, number],
                },
              ]
            : []),
          {
            text: `TOTAL: ${eurFormat(n(estimate.total))}`,
            fontSize: 12,
            bold: true,
            alignment: 'right',
            margin: [0, 8, 0, 0] as [number, number, number, number],
          },
        ],
        width: 180,
      },
    ],
    margin: [0, 12, 0, 0],
  }

  const validityBlock: Content = {
    text: COMPANY.estimateValidity,
    fontSize: 9,
    margin: [0, 16, 0, 0],
    italics: true,
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
      layout: { hLineWidth: () => 0.3, vLineWidth: () => 0.3 },
    },
    totals,
    validityBlock,
  ]
  if (estimate.notes) {
    content.push({
      text: [
        { text: 'Notas: ', bold: true },
        { text: String(estimate.notes).slice(0, 300) },
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

  const slug = `estimates/${String(estimate.estimate_number).replace(/\//g, '-')}.pdf`
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
