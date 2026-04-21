import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { VencimientosContent } from './vencimientos-content'

export const metadata: Metadata = { title: 'Vencimientos proveedores | Contabilidad' }

export default async function VencimientosProveedoresPage() {
  await requirePermission('supplier_invoices.manage')
  return <VencimientosContent />
}
