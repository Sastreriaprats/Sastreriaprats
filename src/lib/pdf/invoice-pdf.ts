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
  invoice_series: string | null
  client_name: string
  client_nif: string | null
  client_address: string | null
  client_email: string | null
  client_phone: string | null
  payment_method: string | null
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
  is_rectifying: boolean
  rectifies_invoice_id: string | null
  rectification_reason: string | null
  sale_id: string | null
  online_order_id: string | null
}

/**
 * Documento(s) del que sale la factura, para dejarlo impreso en el PDF: el
 * ticket de la venta, los pedidos de sastrería o reservas (puente N:M, mig 269)
 * y el pedido de la web. Sin origen (factura hecha a mano) devuelve [].
 */
async function loadOriginRows(
  admin: ReturnType<typeof createAdminClient>,
  invoice: Pick<InvoiceRecord, 'id' | 'sale_id' | 'online_order_id'>,
): Promise<{ label: string; value: string }[]> {
  const [saleRes, ordersRes, reservationsRes, onlineRes] = await Promise.all([
    invoice.sale_id
      ? admin.from('sales').select('ticket_number').eq('id', invoice.sale_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('invoice_tailoring_orders').select('tailoring_orders(order_number)').eq('invoice_id', invoice.id),
    admin.from('invoice_reservations').select('product_reservations(reservation_number)').eq('invoice_id', invoice.id),
    invoice.online_order_id
      ? admin.from('online_orders').select('order_number').eq('id', invoice.online_order_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const rows: { label: string; value: string }[] = []
  const ticket = (saleRes.data as { ticket_number?: string } | null)?.ticket_number
  if (ticket) rows.push({ label: 'Ticket:', value: String(ticket) })

  const nested = (res: { data: unknown }, embed: string, field: string): string[] => {
    const list = (res.data ?? []) as Record<string, unknown>[]
    return list
      .map((r) => {
        const e = r[embed] as Record<string, unknown> | Record<string, unknown>[] | null
        const one = Array.isArray(e) ? e[0] : e
        return String(one?.[field] ?? '').trim()
      })
      .filter(Boolean)
  }
  const orders = nested(ordersRes, 'tailoring_orders', 'order_number')
  if (orders.length) rows.push({ label: orders.length > 1 ? 'Pedidos:' : 'Pedido:', value: orders.join(', ') })
  const reservations = nested(reservationsRes, 'product_reservations', 'reservation_number')
  if (reservations.length) rows.push({ label: reservations.length > 1 ? 'Reservas:' : 'Reserva:', value: reservations.join(', ') })

  const online = (onlineRes.data as { order_number?: string } | null)?.order_number
  if (online) rows.push({ label: 'Pedido web:', value: String(online) })

  return rows
}

/**
 * Genera un PDF de factura con pdfmake según el diseño indicado.
 * Lo sube a Supabase Storage y actualiza invoices.pdf_url. Devuelve la URL pública.
 */
export async function generateInvoicePdf(invoiceId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: inv, error: invError } = await admin
    .from('invoices')
    .select(`id, status, invoice_number, invoice_series, client_name, client_nif, client_address,
      client_email, client_phone, payment_method,
      company_name, company_nif, company_address,
      invoice_date, due_date, subtotal, tax_rate, tax_amount,
      irpf_rate, irpf_amount, total, notes,
      is_rectifying, rectifies_invoice_id, rectification_reason,
      sale_id, online_order_id`)
    .eq('id', invoiceId)
    .single()

  if (invError || !inv) throw new Error('Factura no encontrada')

  const { data: rawLines = [] } = await admin
    .from('invoice_lines')
    .select('description, quantity, unit_price, tax_rate, line_total')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true })

  const invoice = inv as unknown as InvoiceRecord
  const isDraft = invoice.status === 'draft'
  const isRectifying = invoice.is_rectifying === true
  const displayNumber =
    isDraft && (!invoice.invoice_number || !String(invoice.invoice_number).trim())
      ? 'BORRADOR'
      : invoice.invoice_number ?? ''
  const docTitle = isDraft ? 'BORRADOR' : isRectifying ? 'FACTURA RECTIFICATIVA' : 'FACTURA'

  // Para rectificativas: cargar referencia a la factura original (nº + fecha)
  // para el bloque "Rectifica a F2026-XXXX (fecha)".
  let originalRef: { number: string; date: string } | null = null
  if (isRectifying && invoice.rectifies_invoice_id) {
    const { data: orig } = await admin
      .from('invoices')
      .select('invoice_number, invoice_date')
      .eq('id', invoice.rectifies_invoice_id)
      .single()
    if (orig) {
      originalRef = {
        number: String((orig as { invoice_number?: string }).invoice_number ?? '—'),
        date: String((orig as { invoice_date?: string }).invoice_date ?? ''),
      }
    }
  }

  // Anotar líneas con cantidad decimal en rectificativas: "(rectif. parcial)".
  // Las líneas con cantidad entera muestran "-1 ud × 50 €" naturalmente.
  const lines = (rawLines || []).map((l) => {
    const li = l as Record<string, unknown>
    if (isRectifying) {
      const q = Number(li.quantity ?? 0)
      const hasDecimals = q !== Math.trunc(q)
      if (hasDecimals) {
        return { ...li, description: `${String(li.description ?? '')} (rectif. parcial)` }
      }
    }
    return li
  }) as unknown as PdfLine[]

  // Documento de origen (ticket / pedido / reserva / web): va impreso en la
  // factura para poder casarla con su ticket sin entrar en la plataforma.
  const originRows = await loadOriginRows(admin, invoice)

  const logoData = await getLogoBase64Processed()

  const formatDateES = (s: string | null | undefined): string => {
    if (!s) return '—'
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s)
  }

  // A qué factura rectifica: dato que identifica el documento, así que sigue
  // impreso, pero como una referencia más (misma fila que Ticket / Pedido) en
  // vez de en un recuadro destacado.
  if (isRectifying) {
    originRows.unshift({
      label: 'Rectifica a:',
      value: originalRef
        ? `${originalRef.number} (${formatDateES(originalRef.date)})`
        : 'Factura previa',
    })
  }

  // NO hay cuadro de aviso en la rectificativa (petición de David, 23/24-sep-2026:
  // «en las facturas y facturas rectificativas en el PDF no tiene que salir el
  // motivo, el cuadro morado»). El motivo se sigue guardando en
  // `invoices.rectification_reason` y se consulta en la plataforma, pero es una
  // nota interna y no se imprime. La referencia a la factura rectificada —que sí
  // identifica el documento— baja a la zona de datos, junto a Ticket/Pedido.

  const paymentBlock = buildSectionBox('CONDICIONES DE PAGO', [
    { text: 'Forma de pago:', margin: [8, 6, 8, 2] as [number, number, number, number], fontSize: 9, bold: true },
    { text: invoice.payment_method || COMPANY.payment.form, margin: [8, 0, 8, 4] as [number, number, number, number], fontSize: 9, color: HEADER_BG },
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
      clientEmail: invoice.client_email,
      clientPhone: invoice.client_phone,
      label1: 'Fecha:',
      date1: invoice.invoice_date,
      label2: 'Vencimiento:',
      date2: invoice.due_date,
      extraRows: originRows,
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
      // El rótulo del IVA se deriva de las líneas: la cabecera está fijada a 21%.
      lines,
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
        { text: String(invoice.notes) },
      ],
      margin: [0, 12, 0, 0] as [number, number, number, number],
      fontSize: 9,
    })
  }

  const content: Content[] = [
    buildHeader(docTitle, displayNumber, logoData),
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

  // El nombre lleva un tramo del id (un uuid aleatorio) para que la ruta NO sea
  // adivinable: con `factura-F2026-0001.pdf` en un bucket público bastaba
  // contar hacia arriba para descargarse el histórico entero de facturas sin
  // sesión. El id es estable, así que el slug sigue siéndolo: `upsert` sigue
  // sobrescribiendo el mismo objeto al reeditar la factura y las URLs ya
  // enviadas por email no caducan.
  const slug = isDraft
    ? `invoices/factura-borrador-${invoice.id.slice(0, 8)}-${Date.now()}.pdf`
    : `invoices/factura-${(invoice.invoice_number ?? '').replace(/\//g, '-')}-${invoice.id.slice(0, 12)}.pdf`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(slug, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
    // Las facturas EMITIDAS se suben a un slug ESTABLE (factura-F2026-XXXX.pdf) y
    // se sobrescriben con upsert al reeditarlas. Sin esto, Supabase sirve el objeto
    // con Cache-Control por defecto (3600s) y el navegador/CDN seguían mostrando el
    // PDF ANTIGUO tras editar la factura (p. ej. cambiar la forma de pago y verla
    // igual). max-age=0 fuerza revalidación en cada acceso.
    cacheControl: '0',
  })
  if (uploadError) throw new Error(`Error al subir PDF: ${uploadError.message}`)

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(slug)
  // Cache-buster por versión: aunque el slug sea estable, la URL cambia en cada
  // regeneración, así que invalida cualquier copia ya cacheada por el navegador o
  // el CDN de la edición anterior. El PDF se regenera fresco en cada acceso.
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`
  await admin.from('invoices').update({ pdf_url: publicUrl }).eq('id', invoiceId)
  return publicUrl
}
