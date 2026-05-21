#!/usr/bin/env node
// Diagnostica el descuadre de cierre de caja de Mónica:
// PIN-2026-0082, anticipo 925€ con tarjeta el 20-may-2026 que aparece en
// total_cash_sales en vez de total_card_sales.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const TAILORING_ORDER_ID = '7a6170aa-3bab-4c4c-af5a-866a9b22503c'

function box(t) { console.log('\n' + '='.repeat(70) + '\n  ' + t + '\n' + '='.repeat(70)) }

// 1) Schema cash_sessions
box('cash_sessions columnas (información de schema)')
{
  const { data, error } = await sb.rpc('exec_sql', { sql: `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'cash_sessions'
    ORDER BY ordinal_position;
  `}).then(r => r).catch(() => ({ data: null, error: 'no rpc exec_sql' }))
  if (error) {
    console.log('  (no hay RPC exec_sql, voy a inferir desde un select *)')
    const { data: s } = await sb.from('cash_sessions').select('*').limit(1)
    if (s && s[0]) {
      console.log('  Columnas detectadas:')
      for (const k of Object.keys(s[0])) console.log('    -', k)
    }
  } else {
    console.table(data)
  }
}

// 2) ¿La tabla tailoring_order_payments existe?
box('tailoring_order_payments del pedido PIN-2026-0082')
{
  const { data, error } = await sb
    .from('tailoring_order_payments')
    .select('*')
    .eq('tailoring_order_id', TAILORING_ORDER_ID)
    .order('created_at', { ascending: true })
  if (error) console.log('ERR:', error.message)
  else console.log(JSON.stringify(data, null, 2))
}

// 3) Sales relacionadas con la ficha
box('sales con tailoring_order_id = ese o total 925 el 20-may')
{
  const { data: byOrder } = await sb
    .from('sales')
    .select('id, ticket_number, sale_type, payment_method, total, cash_session_id, created_at, tailoring_order_id')
    .eq('tailoring_order_id', TAILORING_ORDER_ID)
  console.log('  por tailoring_order_id:', JSON.stringify(byOrder, null, 2))

  const { data: byTotal } = await sb
    .from('sales')
    .select('id, ticket_number, sale_type, payment_method, total, cash_session_id, created_at, tailoring_order_id')
    .gte('created_at', '2026-05-20T00:00:00')
    .lt('created_at', '2026-05-21T00:00:00')
    .eq('total', 925)
  console.log('  por total=925 el 20-may:', JSON.stringify(byTotal, null, 2))
}

// 4) sale_payments con amount 925 el 20-may
box('sale_payments con 925€ el 20-may')
{
  const { data } = await sb
    .from('sale_payments')
    .select('id, sale_id, payment_method, amount, created_at')
    .gte('created_at', '2026-05-20T00:00:00')
    .lt('created_at', '2026-05-21T00:00:00')
    .eq('amount', 925)
  console.log(JSON.stringify(data, null, 2))
}

// 5) cash_sessions del 20-may
box('cash_sessions abiertas/cerradas el 20-may')
{
  const { data } = await sb
    .from('cash_sessions')
    .select('id, store_id, status, opened_at, closed_at, opening_amount, total_cash_sales, total_card_sales, total_bizum_sales, total_transfer_sales, total_voucher_sales, total_sales, total_returns, total_withdrawals, total_deposits_collected, expected_cash, counted_cash, cash_difference')
    .gte('opened_at', '2026-05-20T00:00:00')
    .lt('opened_at', '2026-05-21T23:59:59')
    .order('opened_at', { ascending: false })
  console.log(JSON.stringify(data, null, 2))
}

// 6) manual_transactions del 20-may con total 925
box('manual_transactions con total 925 el 20-may')
{
  const { data } = await sb
    .from('manual_transactions')
    .select('*')
    .gte('date', '2026-05-20')
    .lte('date', '2026-05-20')
    .eq('total', 925)
  console.log(JSON.stringify(data, null, 2))
}

// 7) Todos los movimientos a 925€ del 20-may en distintas tablas
box('tailoring_order_payments del 20-may con cash_session relacionada')
{
  const { data } = await sb
    .from('tailoring_order_payments')
    .select('id, tailoring_order_id, payment_method, amount, payment_date, cash_session_id, created_at, reference, notes')
    .gte('payment_date', '2026-05-20')
    .lte('payment_date', '2026-05-20')
  console.log(JSON.stringify(data, null, 2))
}

// 8) ¿Hay trigger sobre tailoring_order_payments?
box('triggers sobre tailoring_order_payments (vía pg_trigger)')
{
  const { data, error } = await sb.rpc('exec_sql', { sql: `
    SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
    FROM pg_trigger
    WHERE tgrelid = 'public.tailoring_order_payments'::regclass
      AND tgisinternal = false;
  `}).then(r => r).catch(() => ({ data: null, error: 'sin exec_sql' }))
  if (error) console.log('  (no se puede consultar pg_trigger sin RPC custom)')
  else console.log(JSON.stringify(data, null, 2))
}
