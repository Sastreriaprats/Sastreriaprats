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

  // Sin ficha enlazada no hay client_id: la consulta mandaba
  // client_id=eq.undefined a PostgREST (22P02 sobre columna uuid) y el error se
  // tragaba, quedando un falso "no tienes favoritos".
  if (!client?.id) {
    return <WishlistContent items={[]} clientId="" />
  }

  const { data: wishlist, error: wishlistError } = await admin
    .from('client_wishlist')
    .select('*, products(id, name, web_slug, base_price, price_with_tax, main_image_url, brand)')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  if (wishlistError) console.error('[favoritos] client_wishlist:', wishlistError.message)

  return <WishlistContent items={wishlist || []} clientId={client.id} />
}
