import { Metadata } from 'next'
import { requireAnyPermission } from '@/actions/auth'
import { InventoryCountContent } from './inventory-count-content'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Recuento de inventario' }

export default async function InventoryDetailPage(props: { params: Promise<{ id: string }> }) {
  // Ver el recuento basta con stock.view; contar y cerrar exige stock.inventory
  // (lo comprueban las propias server actions).
  await requireAnyPermission(['stock.inventory', 'stock.view'])
  const params = await props.params
  return <InventoryCountContent inventoryId={params.id} />
}
