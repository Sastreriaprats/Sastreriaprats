import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function PUT(request: NextRequest) {
  try {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    client_id,
    first_name,
    last_name,
    phone,
    address,
    city,
    postal_code,
    province,
    shipping_address,
    shipping_city,
    shipping_postal_code,
    shipping_province,
    shipping_country,
  } = body

  if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Verificar que el client_id pertenece al usuario autenticado
  const { data: ownerCheck } = await admin
    .from('clients')
    .select('id')
    .eq('id', client_id)
    .eq('profile_id', user.id)
    .single()

  if (!ownerCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { error } = await admin.from('clients').update({
    first_name,
    last_name,
    phone: phone || null,
    address: address || null,
    city: city || null,
    postal_code: postal_code || null,
    province: province || null,
    shipping_address: shipping_address ?? null,
    shipping_city: shipping_city ?? null,
    shipping_postal_code: shipping_postal_code ?? null,
    shipping_province: shipping_province ?? null,
    shipping_country: shipping_country ?? null,
  }).eq('id', client_id)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[update-client]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
