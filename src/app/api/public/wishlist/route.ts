import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Favoritos del cliente que tiene la sesion abierta.
 *
 * Sin este GET la tienda no tenia forma de saber que habia guardado ya: el
 * corazon de la ficha y del catalogo nacia siempre "vacio" aunque el producto
 * estuviera en favoritos, y no se podia quitar desde la tienda.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ productIds: [] })

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients').select('id').eq('profile_id', user.id).maybeSingle()
  if (!client) return NextResponse.json({ productIds: [] })

  const { data, error } = await admin
    .from('client_wishlist')
    .select('product_id')
    .eq('client_id', client.id)
  if (error) {
    console.error('[wishlist/GET]', error)
    return NextResponse.json({ error: 'No se pudieron cargar los favoritos' }, { status: 500 })
  }
  return NextResponse.json({ productIds: (data ?? []).map((r) => r.product_id) })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id = body.id
  // La tienda solo conoce el producto, no el id de la fila de favoritos.
  const productId = body.product_id ?? body.productId
  if (!id && !productId) {
    return NextResponse.json({ error: 'id o product_id required' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('id').eq('profile_id', user.id).single()
  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 403 })

  let del = admin.from('client_wishlist').delete().eq('client_id', client.id)
  del = id ? del.eq('id', id) : del.eq('product_id', productId)
  const { error } = await del

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
