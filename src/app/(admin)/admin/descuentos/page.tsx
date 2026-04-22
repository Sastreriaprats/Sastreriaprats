import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { listDiscountCodes } from '@/actions/discounts'
import { DescuentosContent, type DiscountCode } from './descuentos-content'

export const metadata: Metadata = { title: 'Códigos de descuento' }

export default async function DescuentosPage() {
  await requirePermission('pos.apply_discount')
  const res = await listDiscountCodes()
  const initialCodes = res.success && Array.isArray(res.data) ? (res.data as unknown as DiscountCode[]) : []
  return <DescuentosContent initialCodes={initialCodes} />
}
