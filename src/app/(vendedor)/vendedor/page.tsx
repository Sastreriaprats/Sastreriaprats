import { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { VendedorDashboardContent } from './vendedor-dashboard-content'

export const metadata: Metadata = { title: 'Dashboard — Sastrería Prats' }

export default async function VendedorDashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <VendedorDashboardContent />
}
