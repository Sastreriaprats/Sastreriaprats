import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { getVoucherDetail } from '@/actions/vouchers'
import { VoucherDetailContent } from './voucher-detail-content'

export const metadata: Metadata = { title: 'Detalle de vale' }

export default async function VoucherDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('pos.access')
  const { id } = await props.params
  const res = await getVoucherDetail(id)
  if (!res.success || !res.data) notFound()
  return <VoucherDetailContent voucher={res.data} />
}
