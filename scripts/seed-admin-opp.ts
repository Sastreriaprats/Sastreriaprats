/**
 * Crea (o actualiza) un usuario admin: admin@admin.opp / contraseña = el email.
 * Ejecutar con: npx tsx scripts/seed-admin-opp.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fvjdqazfgjspxmwlvkpg.supabase.co'
const serviceRoleKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2amRxYXpmZ2pzcHhtd2x2a3BnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNjExNSwiZXhwIjoyMDg2OTEyMTE1fQ.A01k_PsTp2pwlLIRsk5OHPTTEvMlWKA9aBk-7RafNAw'

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ADMIN_EMAIL = 'admin@admin.opp'
const ADMIN_PASSWORD = 'admin@admin.opp'

async function assignRolesAndStores(userId: string) {
  const { data: role } = await supabase.from('roles').select('id').eq('name', 'administrador').single()
  if (role) {
    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: userId, role_id: role.id }, { onConflict: 'user_id,role_id' })
    if (error) console.error('⚠️  Error asignando rol:', error.message)
    else console.log('✅ Rol administrador asignado')
  } else {
    console.warn('⚠️  No se encontró el rol administrador')
  }

  const { data: stores } = await supabase.from('stores').select('id, name')
  if (stores?.length) {
    for (let i = 0; i < stores.length; i++) {
      await supabase.from('user_stores').upsert(
        { user_id: userId, store_id: stores[i].id, is_primary: i === 0 },
        { onConflict: 'user_id,store_id' }
      )
    }
    console.log(`✅ ${stores.length} tiendas asignadas`)
  }
}

async function main() {
  const { data: listData } = await supabase.auth.admin.listUsers()
  const existing = listData?.users?.find((u) => u.email === ADMIN_EMAIL)

  let userId: string

  if (existing) {
    console.log('ℹ️  El usuario ya existe, actualizando contraseña...')
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      ban_duration: 'none',
    })
    if (error) {
      console.error('❌ Error actualizando:', error.message)
      process.exit(1)
    }
    userId = existing.id
    console.log('✅ Contraseña actualizada')
  } else {
    console.log('🚀 Creando usuario admin desde cero...')
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: 'Admin OPP',
        first_name: 'Admin',
        last_name: 'OPP',
      },
    })
    if (createError) {
      console.error('❌ Error creando usuario:', createError.message)
      process.exit(1)
    }
    userId = newUser.user!.id
    console.log('✅ Usuario creado:', userId)

    // Asegurar perfil (por si el trigger no lo crea)
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', userId).single()
    if (!profile) {
      console.log('🔧 Creando perfil manualmente...')
      const { error: profErr } = await supabase.from('profiles').insert({
        id: userId,
        email: ADMIN_EMAIL,
        full_name: 'Admin OPP',
        first_name: 'Admin',
        last_name: 'OPP',
      })
      if (profErr) console.error('⚠️  Error creando perfil:', profErr.message)
    } else {
      console.log('✅ Perfil creado por trigger')
    }
  }

  await assignRolesAndStores(userId)

  // Probar login
  console.log('\n🔐 Probando login...')
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  if (loginError) console.error('❌ Login falló:', loginError.message)
  else console.log('✅ Login OK! User ID:', loginData.user?.id)

  console.log(`\n📧 Email: ${ADMIN_EMAIL}`)
  console.log(`🔑 Password: ${ADMIN_PASSWORD}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
