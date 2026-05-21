import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

function box(t) { console.log('\n' + '='.repeat(70) + '\n  ' + t + '\n' + '='.repeat(70)) }

// 1) cash_session bf3139eb
box('cash_session bf3139eb (la del tailoring_order_payments de PIN-2026-0082)')
{
  const { data } = await sb
    .from('cash_sessions')
    .select('*')
    .eq('id', 'bf3139eb-a95b-492f-8558-2f3caee55720')
    .single()
  console.log(JSON.stringify(data, null, 2))
}

// 2) Todos los pagos vinculados a esa sesión bf3139eb
box('tailoring_order_payments en sesión bf3139eb')
{
  const { data } = await sb
    .from('tailoring_order_payments')
    .select('id, tailoring_order_id, payment_method, amount, payment_date, created_at, reference, notes')
    .eq('cash_session_id', 'bf3139eb-a95b-492f-8558-2f3caee55720')
    .order('created_at')
  console.log(JSON.stringify(data, null, 2))
}

// 3) manual_transactions en sesión bf3139eb
box('manual_transactions en sesión bf3139eb')
{
  const { data } = await sb
    .from('manual_transactions')
    .select('id, type, date, description, category, total, notes, cash_session_id, created_at')
    .eq('cash_session_id', 'bf3139eb-a95b-492f-8558-2f3caee55720')
    .order('created_at')
  console.log(JSON.stringify(data, null, 2))
}

// 4) Sales en sesión bf3139eb
box('sales en sesión bf3139eb')
{
  const { data } = await sb
    .from('sales')
    .select('id, ticket_number, sale_type, payment_method, total, created_at, tailoring_order_id')
    .eq('cash_session_id', 'bf3139eb-a95b-492f-8558-2f3caee55720')
    .order('created_at')
  console.log(JSON.stringify(data, null, 2))
}

// 5) cash_withdrawals en sesión eb2a2ceb (la abierta el 20-may con cash_sales=925)
box('cash_withdrawals en sesión eb2a2ceb del 20-may')
{
  const { data } = await sb
    .from('cash_withdrawals')
    .select('*')
    .eq('cash_session_id', 'eb2a2ceb-3490-4f73-b092-96397e4abbc3')
    .order('withdrawn_at')
  console.log(JSON.stringify(data, null, 2))
}

// 6) ¿Hay manual_transactions con notes "efectivo" o "cash" para PIN-2026-0082?
box('manual_transactions todos con "PIN-2026-0082" en notes o description')
{
  const { data } = await sb
    .from('manual_transactions')
    .select('*')
    .or('notes.ilike.%PIN-2026-0082%,description.ilike.%PIN-2026-0082%')
    .order('created_at')
  console.log(JSON.stringify(data, null, 2))
}

// 7) tailoring_orders del pedido (ver fechas, totales y status)
box('tailoring_orders PIN-2026-0082 (datos generales)')
{
  const { data } = await sb
    .from('tailoring_orders')
    .select('id, order_number, store_id, total, total_paid, status, created_at, updated_at, created_by')
    .eq('id', '7a6170aa-3bab-4c4c-af5a-866a9b22503c')
    .single()
  console.log(JSON.stringify(data, null, 2))
}
