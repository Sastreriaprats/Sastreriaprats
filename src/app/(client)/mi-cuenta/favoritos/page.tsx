import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WishlistContent } from './wishlist-content'

export default async function WishlistPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  const { data: wishlist } = await admin
    .from('client_wishlist')
    .select('*, products(id, name, web_slug, base_price, main_image_url, brand)')
    .eq('client_id', client?.id)
    .order('created_at', { ascending: false })

  return <WishlistContent items={wishlist || []} clientId={client?.id || ''} />
}
