import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { client_id, first_name, last_name, phone, address, city, postal_code, province } = body

  if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('clients').update({
    first_name,
    last_name,
    phone: phone || null,
    address: address || null,
    city: city || null,
    postal_code: postal_code || null,
    province: province || null,
  }).eq('id', client_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
