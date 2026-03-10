import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Panel Sastre' }

export default async function SastreDashboardPage() {
  redirect('/sastre/nueva-venta')
}
