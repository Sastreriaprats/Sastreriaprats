import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

console.log('=== RESERVA RSV-2026-0051 ===')
const { data: res, error: e1 } = await sb
  .from('product_reservations')
  .select('*')
  .eq('reservation_number', 'RSV-2026-0051')
  .maybeSingle()
if (e1) console.error(e1)
console.log(JSON.stringify(res, null, 2))

if (res?.id) {
  console.log('\n=== PAGOS DE LA RESERVA ===')
  const { data: pays } = await sb
    .from('product_reservation_payments')
    .select('*')
    .eq('product_reservation_id', res.id)
    .order('payment_date')
  console.log(JSON.stringify(pays, null, 2))

  console.log('\n=== MANUAL_TRANSACTIONS QUE LA MENCIONAN ===')
  const { data: mt } = await sb
    .from('manual_transactions')
    .select('id, type, date, description, category, amount, total, cash_session_id, created_at')
    .or(`description.ilike.%RSV-2026-0051%,notes.ilike.%RSV-2026-0051%`)
    .order('created_at')
  console.log(JSON.stringify(mt, null, 2))
}

console.log('\n=== CASH SESSION bf3139eb-a95b-492f-8558-2f3caee55720 ===')
const { data: cs, error: e2 } = await sb
  .from('cash_sessions')
  .select('id, status, store_id, cashier_id, opened_at, closed_at, total_sales, total_cash_sales, total_card_sales, total_bizum_sales, total_transfer_sales, total_voucher_sales, opening_balance, closing_balance, stores:store_id(name), cashier:cashier_id(full_name)')
  .eq('id', 'bf3139eb-a95b-492f-8558-2f3caee55720')
  .maybeSingle()
if (e2) console.error(e2)
console.log(JSON.stringify(cs, null, 2))
