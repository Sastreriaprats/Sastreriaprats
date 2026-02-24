/**
 * Script para crear el primer usuario administrador.
 * Ejecutar con: npx tsx scripts/seed-admin.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fvjdqazfgjspxmwlvkpg.supabase.co'
const anonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2amRxYXpmZ2pzcHhtd2x2a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzYxMTUsImV4cCI6MjA4NjkxMjExNX0.zqF2Osj5dtUK7nWbynUAMAVt4Np2Ar-KBQou6MkkjLI'
const serviceRoleKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2amRxYXpmZ2pzcHhtd2x2a3BnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNjExNSwiZXhwIjoyMDg2OTEyMTE1fQ.A01k_PsTp2pwlLIRsk5OHPTTEvMlWKA9aBk-7RafNAw'

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ADMIN_EMAIL = 'admin@sastreriaprats.com'
const ADMIN_PASSWORD = 'PratsAdmin2026!'

async function seedAdmin() {
  console.log('🚀 Creando usuario admin...\n')

  // Step 1: Check if trigger handle_new_user works by looking for existing profiles
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .single()

  if (existingProfile) {
    console.log('ℹ️  El usuario ya existe. Asignando roles...')
    await assignRolesAndStores(existingProfile.id)
    return
  }

  // Step 2: Try to disable the trigger temporarily
  console.log('🔧 Intentando deshabilitar trigger temporalmente...')
  const { error: rpcError } = await admin.rpc('exec_sql', {
    sql: 'ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created',
  })
  if (rpcError) console.log('ℹ️  No se pudo deshabilitar trigger (exec_sql no existe), continuando...')

  // Step 3: Try creating user via admin API
  let userId: string | null = null

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: 'Administrador Prats',
      first_name: 'Administrador',
      last_name: 'Prats',
    },
  })

  if (authError) {
    console.log(`⚠️  createUser falló: ${authError.message}`)

    // Try signUp as alternative
    console.log('🔄 Intentando registro alternativo...')
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      options: {
        data: {
          full_name: 'Administrador Prats',
          first_name: 'Administrador',
          last_name: 'Prats',
        },
      },
    })

    if (signUpError) {
      console.error(`❌ signUp también falló: ${signUpError.message}`)
      console.log('\n💡 El trigger handle_new_user está fallando al insertar en profiles.')
      console.log('   Ejecuta esto en el SQL Editor de Supabase para diagnosticar:\n')
      console.log('   SELECT prosrc FROM pg_proc WHERE proname = \'handle_new_user\';')
      console.log('\n   Y esto para verificar las columnas de profiles:')
      console.log('   SELECT column_name, is_nullable, column_default FROM information_schema.columns')
      console.log('   WHERE table_name = \'profiles\' ORDER BY ordinal_position;\n')
      process.exit(1)
    }

    userId = signUpData.user?.id ?? null
    if (userId) {
      // Confirm email via admin
      await admin.auth.admin.updateUserById(userId, { email_confirm: true })
    }
  } else {
    userId = authUser.user?.id ?? null
  }

  if (!userId) {
    console.error('❌ No se pudo obtener el userId')
    process.exit(1)
  }

  console.log(`✅ Auth user: ${userId}`)

  // Step 4: Re-enable trigger
  await admin.rpc('exec_sql', { sql: 'ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created' })

  // Step 5: Ensure profile exists
  await ensureProfile(userId)

  // Step 6: Assign roles and stores
  await assignRolesAndStores(userId)
}

async function ensureProfile(userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('id', userId).single()

  if (data) {
    console.log('✅ Perfil ya existe')
    await admin
      .from('profiles')
      .update({ first_name: 'Administrador', last_name: 'Prats', phone: '+34600000000' })
      .eq('id', userId)
    return
  }

  const { error } = await admin.from('profiles').insert({
    id: userId,
    email: ADMIN_EMAIL,
    full_name: 'Administrador Prats',
    first_name: 'Administrador',
    last_name: 'Prats',
    phone: '+34600000000',
  })

  if (error) {
    console.error('❌ Error creando perfil:', error.message)
    console.log('💡 Ejecuta este SQL en el editor de Supabase:')
    console.log(`INSERT INTO profiles (id, email, full_name, first_name, last_name, phone)`)
    console.log(`VALUES ('${userId}', '${ADMIN_EMAIL}', 'Administrador Prats', 'Administrador', 'Prats', '+34600000000');`)
    process.exit(1)
  }

  console.log('✅ Perfil creado')
}

async function assignRolesAndStores(userId: string) {
  const { data: role } = await admin.from('roles').select('id').eq('name', 'super_admin').single()

  if (role) {
    const { error } = await admin
      .from('user_roles')
      .upsert({ user_id: userId, role_id: role.id }, { onConflict: 'user_id,role_id' })
    if (error) console.error('⚠️  Error asignando rol:', error.message)
    else console.log('✅ Rol super_admin asignado')
  }

  const { data: stores } = await admin.from('stores').select('id, name')

  if (stores?.length) {
    for (let i = 0; i < stores.length; i++) {
      await admin.from('user_stores').upsert(
        { user_id: userId, store_id: stores[i].id, is_primary: i === 0 },
        { onConflict: 'user_id,store_id' }
      )
    }
    console.log(`✅ ${stores.length} tiendas asignadas`)
  }

  console.log('\n🎉 ¡Usuario admin listo!')
  console.log(`📧 Email: ${ADMIN_EMAIL}`)
  console.log(`🔑 Password: ${ADMIN_PASSWORD}`)
  console.log('\n⚠️  Cambia la contraseña después del primer login.')
}

seedAdmin()
  .catch((e) => { console.error('Error fatal:', e); process.exit(1) })
  .then(() => process.exit(0))
