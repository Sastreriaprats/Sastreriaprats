import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRateLimited } from '@/lib/rate-limit'

/** GET /api/public/discount?code=XXX&subtotal=123.45 — valida un código de descuento */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isRateLimited(ip, 'discount', 20, 60)) {
      return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 })
    }

    const { searchParams } = new URL(request.url)
    const code = (searchParams.get('code') || '').trim().toUpperCase()
    const subtotal = parseFloat(searchParams.get('subtotal') || '0')

    if (!code) {
      return NextResponse.json({ error: 'Código requerido' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: dc } = await admin
      .from('discount_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single()

    if (!dc) {
      return NextResponse.json({ error: 'Código no válido o no activo' }, { status: 404 })
    }

    // Verificar fechas
    const now = new Date().toISOString().split('T')[0]
    if (dc.valid_from && now < dc.valid_from) {
      return NextResponse.json({ error: 'Este código aún no es válido' }, { status: 400 })
    }
    if (dc.valid_until && now > dc.valid_until) {
      return NextResponse.json({ error: 'Este código ha expirado' }, { status: 400 })
    }

    // Verificar límite de usos
    if (dc.max_uses && dc.current_uses >= dc.max_uses) {
      return NextResponse.json({ error: 'Este código ha alcanzado su límite de usos' }, { status: 400 })
    }

    // Verificar compra mínima
    if (dc.min_purchase && subtotal < parseFloat(dc.min_purchase)) {
      return NextResponse.json(
        { error: `Compra mínima de ${parseFloat(dc.min_purchase).toFixed(2)}€ requerida` },
        { status: 400 }
      )
    }

    // Verificar si aplica a online
    if (dc.applies_to && dc.applies_to !== 'all' && dc.applies_to !== 'online' && dc.applies_to !== 'boutique') {
      return NextResponse.json({ error: 'Este código no aplica a compras online' }, { status: 400 })
    }

    // Calcular descuento
    let discountAmount = 0
    if (dc.discount_type === 'percentage') {
      discountAmount = Math.round(subtotal * (parseFloat(dc.discount_value) / 100) * 100) / 100
    } else {
      discountAmount = Math.min(parseFloat(dc.discount_value), subtotal)
    }

    return NextResponse.json({
      valid: true,
      code: dc.code,
      discount_type: dc.discount_type,
      discount_value: parseFloat(dc.discount_value),
      discount_amount: discountAmount,
      description: dc.description,
    })
  } catch (err) {
    console.error('[discount-validate]', err)
    return NextResponse.json({ error: 'Error al validar el código' }, { status: 500 })
  }
}
