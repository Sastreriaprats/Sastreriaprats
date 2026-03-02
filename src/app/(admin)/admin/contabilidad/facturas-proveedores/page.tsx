import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { SupplierInvoicesContent } from './supplier-invoices-content'

export const metadata: Metadata = { title: 'Facturas proveedores | Contabilidad' }

export default async function FacturasProveedoresPage() {
  await requirePermission('supplier_invoices.manage')
  return <SupplierInvoicesContent />
}
