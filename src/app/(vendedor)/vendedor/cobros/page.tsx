import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { CobrosContent } from '@/app/(admin)/admin/cobros/cobros-content'

export const metadata: Metadata = { title: 'Cobros Pendientes' }

export default async function VendedorCobrosPage() {
  await requirePermission('orders.view')
  // Sin basePath, CobrosContent usa '/admin' por defecto y al pinchar un
  // arreglo mandaba al vendedor a /admin/arreglos, ruta que el middleware le
  // bloquea: acababa expulsado a su panel. /vendedor/arreglos/[id] si existe.
  return <CobrosContent basePath="/vendedor" />
}
