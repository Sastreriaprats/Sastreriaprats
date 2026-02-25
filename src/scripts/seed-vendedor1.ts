/**
 * Crea solo el usuario vendedor: vendedor1@vendedorcasico.com con rol vendedor_basico.
 * Contraseña: Prats2026!
 * Ejecutar: npx tsx src/scripts/seed-vendedor1.ts
 * Requiere: .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const EMAIL = 'vendedor1@vendedorcasico.com'
const PASSWORD = 'Prats2026!'

async function main() {
  console.log('Creando usuario vendedor:', EMAIL, '\n')

  const { data: roleRow } = await supabase.from('roles').select('id').eq('name', 'vendedor_basico').maybeSingle()
  if (!roleRow) {
    console.error('Rol vendedor_basico no encontrado. Ejecuta las migraciones 010 y 032.')
    process.exit(1)
  }

  const { data: mainStore } = await supabase.from('stores').select('id').limit(1).maybeSingle()
  if (!mainStore) {
    console.error('No hay ninguna tienda. Ejecuta el seed completo (npm run db:seed) primero.')
    process.exit(1)
  }

  const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', EMAIL).maybeSingle()
  let userId: string | null = existingProfile?.id ?? null

  if (!userId) {
    const { data: authUser, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Vendedor Básico', first_name: 'Vendedor', last_name: 'Básico' },
    })
    if (error) {
      if (error.message.includes('already') || error.message.includes('registered')) {
        const { data: list } = await supabase.auth.admin.listUsers()
        const found = list?.users?.find(u => u.email === EMAIL)
        userId = found?.id ?? null
        if (userId) {
          await supabase.auth.admin.updateUserById(userId, { password: PASSWORD })
          console.log('Usuario ya existía en Auth. Contraseña actualizada a Prats2026!')
        }
      } else {
        console.error('Error creando usuario:', error.message)
        process.exit(1)
      }
    } else {
      userId = authUser.user.id
      console.log('Usuario creado en Auth.')
    }
  } else {
    await supabase.auth.admin.updateUserById(userId, { password: PASSWORD })
    console.log('Usuario ya existía. Contraseña actualizada a Prats2026!')
  }

  if (!userId) {
    console.error('No se pudo obtener userId')
    process.exit(1)
  }

  await supabase.from('user_roles').delete().eq('user_id', userId)
  await supabase.from('user_roles').insert({ user_id: userId, role_id: roleRow.id })
  await supabase.from('user_stores').upsert(
    { user_id: userId, store_id: mainStore.id, is_primary: true },
    { onConflict: 'user_id,store_id' }
  )
  console.log('Rol vendedor_basico y tienda asignados.')

  console.log('\n✅ Listo.')
  console.log('   Email:', EMAIL)
  console.log('   Contraseña:', PASSWORD)
  console.log('   Acceso: /auth/login → redirige a /vendedor\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
