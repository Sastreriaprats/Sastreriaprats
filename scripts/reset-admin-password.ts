import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://fvjdqazfgjspxmwlvkpg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2amRxYXpmZ2pzcHhtd2x2a3BnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNjExNSwiZXhwIjoyMDg2OTEyMTE1fQ.A01k_PsTp2pwlLIRsk5OHPTTEvMlWKA9aBk-7RafNAw',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  // Check existing users
  const { data: listData } = await supabase.auth.admin.listUsers()
  console.log('Usuarios en auth:', listData?.users?.length ?? 0)
  listData?.users?.forEach(u => console.log(`  - ${u.email} (${u.id})`))

  const existing = listData?.users?.find(u => u.email === 'admin@sastreriaprats.com')

  if (existing) {
    console.log('\nUsuario ya existe, actualizando contraseña...')
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: 'PratsAdmin2026!',
      email_confirm: true,
      ban_duration: 'none',
    })
    if (error) console.error('Error:', error.message)
    else console.log('Contraseña actualizada')
  } else {
    console.log('\nCreando usuario admin desde cero...')
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: 'admin@sastreriaprats.com',
      password: 'PratsAdmin2026!',
      email_confirm: true,
      user_metadata: {
        full_name: 'Administrador Prats',
        first_name: 'Administrador',
        last_name: 'Prats',
      },
    })

    if (createError) {
      console.error('Error creando usuario:', createError.message)
      process.exit(1)
    }

    const userId = newUser.user!.id
    console.log('Usuario creado:', userId)

    // Check profile was created by trigger
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', userId).single()
    if (!profile) {
      console.log('Creando perfil manualmente...')
      await supabase.from('profiles').insert({
        id: userId,
        email: 'admin@sastreriaprats.com',
        full_name: 'Administrador Prats',
        first_name: 'Administrador',
        last_name: 'Prats',
        phone: '+34600000000',
      })
    } else {
      console.log('Perfil creado por trigger OK')
    }

    // Assign super_admin role
    const { data: role } = await supabase.from('roles').select('id').eq('name', 'super_admin').single()
    if (role) {
      await supabase.from('user_roles').upsert(
        { user_id: userId, role_id: role.id },
        { onConflict: 'user_id,role_id' }
      )
      console.log('Rol super_admin asignado')
    }

    // Assign all stores
    const { data: stores } = await supabase.from('stores').select('id, name')
    if (stores?.length) {
      for (let i = 0; i < stores.length; i++) {
        await supabase.from('user_stores').upsert(
          { user_id: userId, store_id: stores[i].id, is_primary: i === 0 },
          { onConflict: 'user_id,store_id' }
        )
      }
      console.log(`${stores.length} tiendas asignadas`)
    }
  }

  // Test login
  console.log('\nProbando login...')
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'admin@sastreriaprats.com',
    password: 'PratsAdmin2026!',
  })

  if (loginError) {
    console.error('Login falló:', loginError.message)
  } else {
    console.log('Login OK! User ID:', loginData.user?.id)
  }

  console.log('\nEmail: admin@sastreriaprats.com')
  console.log('Password: PratsAdmin2026!')

  process.exit(0)
}

main()
