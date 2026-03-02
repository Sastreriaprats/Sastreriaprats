import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { SupplierInvoicesCalendarContent } from './calendar-content'

export const metadata: Metadata = { title: 'Calendario vencimientos | Facturas proveedores' }

export default async function CalendarioVencimientosPage() {
  await requirePermission('supplier_invoices.manage')
  return <SupplierInvoicesCalendarContent />
}
