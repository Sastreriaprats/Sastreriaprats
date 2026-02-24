import { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardContent } from './dashboard-content'

export const metadata: Metadata = { title: 'Dashboard — Sastrería Prats' }

export default async function DashboardPage() {
  // El dashboard es accesible para cualquier usuario autenticado del panel
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <DashboardContent />
}
