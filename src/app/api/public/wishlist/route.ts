import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('id').eq('profile_id', user.id).single()
  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 403 })

  const { error } = await admin
    .from('client_wishlist')
    .delete()
    .eq('id', id)
    .eq('client_id', client.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const product_id = body.product_id ?? body.productId
  if (!product_id) {
    return NextResponse.json({ error: 'product_id required' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Inicia sesión para guardar favoritos' }, { status: 401 })

  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('id').eq('profile_id', user.id).single()
  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 403 })

  const { error } = await admin.from('client_wishlist').upsert(
    { client_id: client.id, product_id },
    { onConflict: 'client_id,product_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
