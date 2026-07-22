import { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MisVentasContent } from './mis-ventas-content'

export const metadata: Metadata = { title: 'Mis ventas — Sastrería Prats' }

export default async function MisVentasPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <MisVentasContent />
}
