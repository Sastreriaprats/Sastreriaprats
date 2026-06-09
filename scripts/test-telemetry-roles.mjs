// Test 3: el predicado userIsFullAdmin (que gatea getClientErrors) contra datos
// reales. Confirma que un admin -> true (lee) y un no-admin -> false (FORBIDDEN).
// Replica EXACTAMENTE la query de src/actions/client-errors.ts.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Mismo cálculo que userIsFullAdmin(ctx) en la action.
async function userIsFullAdmin(userId) {
  const { data: roleRows } = await sb
    .from('user_roles').select('roles!inner(name)').eq('user_id', userId)
  return (roleRows ?? []).some((ur) => {
    const r = ur.roles
    const name = Array.isArray(r) ? r[0]?.name : r?.name
    return name === 'administrador' || name === 'super_admin'
  })
}

// Buscar un usuario admin y uno no-admin reales.
const { data: allRoles } = await sb.from('user_roles').select('user_id, roles!inner(name)')
const byUser = new Map()
for (const row of allRoles ?? []) {
  const name = Array.isArray(row.roles) ? row.roles[0]?.name : row.roles?.name
  if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Set())
  byUser.get(row.user_id).add(name)
}
const adminUser = [...byUser.entries()].find(([, names]) => names.has('administrador') || names.has('super_admin'))?.[0]
const nonAdminUser = [...byUser.entries()].find(([, names]) => !names.has('administrador') && !names.has('super_admin'))?.[0]

let failed = 0
const check = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) failed++ }

console.log('admin de prueba:', adminUser ?? '(ninguno)', '| no-admin de prueba:', nonAdminUser ?? '(ninguno)')

if (adminUser) check('admin -> userIsFullAdmin = true (puede leer)', (await userIsFullAdmin(adminUser)) === true)
else console.log('SKIP admin: no hay usuario con rol administrador/super_admin')

if (nonAdminUser) check('no-admin -> userIsFullAdmin = false (FORBIDDEN)', (await userIsFullAdmin(nonAdminUser)) === false)
else console.log('SKIP no-admin: todos los usuarios con rol son admin')

// Usuario inexistente (sin roles) -> false
check('usuario sin roles -> false (FORBIDDEN)', (await userIsFullAdmin('00000000-0000-0000-0000-000000000000')) === false)

console.log(failed === 0 ? '\nTEST 3: PASS' : `\nTEST 3: FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
