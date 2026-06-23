// Carga inicial de reglas de comisión (jun-2026). Idempotente: aborta si ya hay planes.
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const WEL = 'f658df67-3111-4dc0-9633-372f89b8d07f'
const PIN = '0e5d1693-6398-4460-98a4-1ffeaa55ad59'
const ELENA = '0ef90210-d7ee-409c-b70d-d097779b4461'
const DARIO = '1e14cdf9-f628-4ee1-87ba-49bfa6ca786e'

// Asignaciones report-sellers → tienda primaria (Ismael = plan especial).
const PINZON_EMP = [
  '2f2f2521-3b97-4961-8b10-afc5d2c63602', // Teresa Mansueli
  ELENA,                                   // Elena Pinardo
  'b6b24cfb-9bba-4454-a429-bd02c5c9dfd0', // Maryana Dyrbavka
  'ed1aeaac-1f30-4d55-b949-38b3a106643c', // Roberto Ferreira
  'c8707796-3308-4afa-aacd-d2cf81f9f602', // Mónica Magariños
]
const WELLINGTON_EMP = [ DARIO ]          // Dario Urriola
const ISMAEL_EMP = [ '2d7126a1-4657-432f-b426-a2d5db36c9a4' ]

try {
  await c.query('BEGIN')
  const { rows: existing } = await c.query('SELECT count(*)::int n FROM commission_plans')
  if (existing[0].n > 0) { console.log('Ya hay planes cargados, abortando para no duplicar.'); await c.query('ROLLBACK'); await c.end(); process.exit(2) }

  const ins = async (sql, params) => (await c.query(sql, params)).rows[0].id

  const planWel = await ins(
    `INSERT INTO commission_plans (name, store_id, base_boutique, base_gift_cards, base_sastreria, rate_below, rate_above, use_target, is_active)
     VALUES ('Wellington', $1, true, true, true, 1, 1.5, true, true) RETURNING id`, [WEL])
  const planPin = await ins(
    `INSERT INTO commission_plans (name, store_id, base_boutique, base_gift_cards, base_sastreria, rate_below, rate_above, use_target, is_active)
     VALUES ('Pinzón', $1, true, true, true, 1.5, 2, true, true) RETURNING id`, [PIN])
  const planIsm = await ins(
    `INSERT INTO commission_plans (name, store_id, base_boutique, base_gift_cards, base_sastreria, rate_below, rate_above, use_target, is_active)
     VALUES ('Ismael (1% boutique)', $1, true, false, false, 1, 0, false, true) RETURNING id`, [PIN])

  const assign = async (emp, plan) => c.query(
    `INSERT INTO commission_assignments (employee_id, plan_id, is_active) VALUES ($1,$2,true)
     ON CONFLICT (employee_id) DO UPDATE SET plan_id=EXCLUDED.plan_id, is_active=true, updated_at=now()`, [emp, plan])
  for (const e of PINZON_EMP) await assign(e, planPin)
  for (const e of WELLINGTON_EMP) await assign(e, planWel)
  for (const e of ISMAEL_EMP) await assign(e, planIsm)

  const bonusId = await ins(
    `INSERT INTO commission_group_bonuses (name, period_type, rate, base_type, goal_types, is_active)
     VALUES ('Bonus trimestral tiendas', 'quarter', 1.5, 'excess', ARRAY['boutique','sastreria'], true) RETURNING id`, [])
  await c.query(`INSERT INTO commission_group_bonus_stores (bonus_id, store_id) VALUES ($1,$2),($1,$3)`, [bonusId, WEL, PIN])
  await c.query(`INSERT INTO commission_group_bonus_members (bonus_id, employee_id) VALUES ($1,$2),($1,$3)`, [bonusId, ELENA, DARIO])

  await c.query('COMMIT')
  console.log('✔ Cargado:')
  console.log('  Planes: Wellington (1/1.5), Pinzón (1.5/2), Ismael (1% boutique plano)')
  console.log('  Asignados a Pinzón:', PINZON_EMP.length, '| Wellington:', WELLINGTON_EMP.length, '| Ismael: 1')
  console.log('  Bonus trimestral: Wellington+Pinzón, 1.5% exceso, Elena+Dario')
} catch (e) {
  await c.query('ROLLBACK')
  console.error('ERROR, revertido:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
