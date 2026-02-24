import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('client_wishlist').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function POST(request: NextRequest) {
  const { client_id, product_id } = await request.json()
  if (!client_id || !product_id) {
    return NextResponse.json({ error: 'client_id and product_id required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('client_wishlist').upsert(
    { client_id, product_id },
    { onConflict: 'client_id,product_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
