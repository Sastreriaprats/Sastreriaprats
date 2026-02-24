/**
 * Seed script: creates admin permissions, stores, and sample data for testing.
 * Run: npm run db:seed (or npx tsx src/scripts/seed.ts)
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function seed() {
  console.log('🌱 Seeding database...\n')

  // ==========================================
  // 1. VERIFICAR ROLES V2
  // ==========================================
  const { data: adminRole } = await supabase
    .from('roles').select('id').eq('name', 'administrador').maybeSingle()

  if (!adminRole) {
    console.log('⚠️  Roles v2 no encontrados. Ejecuta la migración 010_roles_v2.sql primero.')
  } else {
    console.log('✅ Roles v2 presentes')
  }

  // Compatibilidad: superAdminRole = administrador
  const superAdminRole = adminRole

  // ==========================================
  // 2. STORES & WAREHOUSES
  // ==========================================
  const { data: existingStores } = await supabase.from('stores').select('id').limit(1)
  if (!existingStores?.length) {
    await supabase.from('stores').insert([
      { code: 'PRATS-SER', name: 'Prats Serrano', address: 'Calle de Serrano 82, Madrid', phone: '+34 91 435 6789', is_main: true },
      { code: 'PRATS-VEL', name: 'Prats Velázquez', address: 'Calle de Velázquez 54, Madrid', phone: '+34 91 578 1234', is_main: false },
    ])
    console.log('✅ 2 tiendas creadas')
  }

  const { data: allStores } = await supabase.from('stores').select('id, code')
  const mainStore = allStores?.[0]

  const { data: existingWarehouses } = await supabase.from('warehouses').select('id').limit(1)
  if (!existingWarehouses?.length && allStores?.length) {
    for (const store of allStores) {
      await supabase.from('warehouses').insert({
        store_id: store.id, code: `ALM-${store.code}`, name: `Almacén ${store.code}`, is_main: true,
      })
    }
    console.log(`✅ ${allStores.length} almacenes creados`)
  }

  const { data: warehouses } = await supabase.from('warehouses').select('id, store_id').eq('is_main', true)
  const mainWarehouse = warehouses?.find(w => w.store_id === mainStore?.id)

  // ==========================================
  // 3. ADMIN USER
  // ==========================================
  const adminEmail = 'admin@sastreriaprats.com'
  const { data: existingAdmin } = await supabase.from('profiles').select('id').eq('email', adminEmail).maybeSingle()

  let adminUserId: string | null = existingAdmin?.id || null

  if (!adminUserId) {
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: 'Prats2026!',
      email_confirm: true,
      user_metadata: { full_name: 'Admin Prats', first_name: 'Admin', last_name: 'Prats' },
    })

    if (authErr) {
      if (authErr.message?.includes('already been registered') || authErr.message?.includes('already registered')) {
        const { data: users } = await supabase.auth.admin.listUsers()
        const found = users?.users?.find(u => u.email === adminEmail)
        adminUserId = found?.id || null
        if (found) {
          await supabase.auth.admin.updateUserById(found.id, { password: 'Prats2026!' })
        }
        console.log('✅ Usuario admin ya existía (contraseña actualizada a Prats2026!)')
      } else {
        console.error('Error creando admin:', authErr.message)
      }
    } else {
      adminUserId = authUser.user.id
      console.log('✅ Usuario admin creado (admin@sastreriaprats.com / Prats2026!)')
    }
  } else {
    await supabase.auth.admin.updateUserById(adminUserId, { password: 'Prats2026!' })
    console.log('✅ Usuario admin ya existe (contraseña actualizada a Prats2026!)')
  }

  // Asignar rol administrador al admin
  if (adminUserId && superAdminRole && mainStore) {
    await supabase.from('user_roles').upsert(
      { user_id: adminUserId, role_id: superAdminRole.id },
      { onConflict: 'user_id,role_id' }
    )
    await supabase.from('user_stores').upsert(
      { user_id: adminUserId, store_id: mainStore.id, is_primary: true },
      { onConflict: 'user_id,store_id' }
    )
    console.log('✅ Rol administrador asignado al admin')
  }

  // ==========================================
  // 3b. USUARIOS DE PRUEBA POR ROL
  // ==========================================
  const testUsers = [
    { email: 'sastre@sastreriaprats.com',    role: 'sastre',           firstName: 'Pedro',    lastName: 'Sastre' },
    { email: 'sastreplus@sastreriaprats.com', role: 'sastre_plus',      firstName: 'María',    lastName: 'Ruiz' },
    { email: 'vendedor1@sastreriaprats.com',  role: 'vendedor_basico',  firstName: 'Luis',     lastName: 'Pérez' },
    { email: 'vendedor2@sastreriaprats.com',  role: 'vendedor_avanzado',firstName: 'Carmen',   lastName: 'Gómez' },
  ]

  for (const tu of testUsers) {
    const { data: roleRow } = await supabase.from('roles').select('id').eq('name', tu.role).maybeSingle()
    if (!roleRow) { console.log(`⚠️  Rol ${tu.role} no encontrado`); continue }

    const { data: existing } = await supabase.from('profiles').select('id').eq('email', tu.email).maybeSingle()
    let userId: string | null = existing?.id || null

    if (!userId) {
      const { data: authUser, error } = await supabase.auth.admin.createUser({
        email: tu.email,
        password: 'Prats2026!',
        email_confirm: true,
        user_metadata: { full_name: `${tu.firstName} ${tu.lastName}`, first_name: tu.firstName, last_name: tu.lastName },
      })
      if (error) {
        if (error.message.includes('already')) {
          const { data: users } = await supabase.auth.admin.listUsers()
          const found = users?.users?.find(u => u.email === tu.email)
          userId = found?.id || null
          if (userId) await supabase.auth.admin.updateUserById(userId, { password: 'Prats2026!' })
        } else {
          console.error(`Error creando ${tu.email}:`, error.message); continue
        }
      } else {
        userId = authUser.user.id
      }
    } else {
      await supabase.auth.admin.updateUserById(userId, { password: 'Prats2026!' })
    }

    if (userId && mainStore) {
      await supabase.from('user_roles').delete().eq('user_id', userId)
      await supabase.from('user_roles').insert({ user_id: userId, role_id: roleRow.id })
      await supabase.from('user_stores').upsert(
        { user_id: userId, store_id: mainStore.id, is_primary: true },
        { onConflict: 'user_id,store_id' }
      )
    }
    console.log(`✅ Usuario ${tu.email} (${tu.role}) / Prats2026!`)
  }

  // ==========================================
  // 4. SAMPLE CLIENTS
  // ==========================================
  const { data: existingClients } = await supabase.from('clients').select('id').limit(1)
  if (!existingClients?.length) {
    const clients = [
      { client_code: 'CLI-001', first_name: 'Carlos', last_name: 'García López', email: 'carlos.garcia@email.com', phone: '+34600111222', category: 'vip', address: 'Calle Serrano 45', city: 'Madrid', postal_code: '28001', province: 'Madrid', source: 'referral', is_active: true },
      { client_code: 'CLI-002', first_name: 'Miguel', last_name: 'Fernández Ruiz', email: 'miguel.fernandez@email.com', phone: '+34600333444', category: 'premium', address: 'Paseo de la Castellana 120', city: 'Madrid', postal_code: '28046', province: 'Madrid', source: 'walk_in', is_active: true },
      { client_code: 'CLI-003', first_name: 'Alejandro', last_name: 'Martínez Sánchez', email: 'alejandro.martinez@email.com', phone: '+34600555666', category: 'standard', address: 'Calle Velázquez 30', city: 'Madrid', postal_code: '28006', province: 'Madrid', source: 'web', is_active: true },
      { client_code: 'CLI-004', first_name: 'David', last_name: 'López Hernández', email: 'david.lopez@email.com', phone: '+34600777888', category: 'standard', address: 'Gran Vía 50', city: 'Madrid', postal_code: '28013', province: 'Madrid', source: 'web', is_active: true },
      { client_code: 'CLI-005', first_name: 'Fernando', last_name: 'Rodríguez Díaz', email: 'fernando.rodriguez@email.com', phone: '+34600999000', category: 'vip', address: 'Calle Goya 15', city: 'Madrid', postal_code: '28001', province: 'Madrid', source: 'referral', is_active: true },
      { client_code: 'CLI-006', first_name: 'Javier', last_name: 'Moreno Torres', email: 'javier.moreno@email.com', phone: '+34611222333', category: 'premium', address: 'Calle Alcalá 200', city: 'Madrid', postal_code: '28028', province: 'Madrid', source: 'event', is_active: true },
      { client_code: 'CLI-007', first_name: 'Pablo', last_name: 'Jiménez Vega', email: 'pablo.jimenez@email.com', phone: '+34611444555', category: 'standard', address: 'Calle Príncipe de Vergara 80', city: 'Madrid', postal_code: '28006', province: 'Madrid', source: 'walk_in', is_active: true },
      { client_code: 'CLI-008', first_name: 'Antonio', last_name: 'Ruiz Navarro', email: 'antonio.ruiz@email.com', phone: '+34611666777', category: 'standard', city: 'Barcelona', postal_code: '08001', province: 'Barcelona', source: 'web', is_active: true },
    ]
    const { error } = await supabase.from('clients').insert(clients)
    if (error) console.error('Clientes:', error.message)
    else console.log(`✅ ${clients.length} clientes de ejemplo creados`)
  } else {
    console.log('✅ Clientes ya existen')
  }

  // ==========================================
  // 5. SAMPLE PRODUCTS WITH VARIANTS AND STOCK
  // ==========================================
  const { data: existingProducts } = await supabase.from('products').select('id').limit(1)
  if (!existingProducts?.length) {
    const { data: categories } = await supabase.from('product_categories').select('id, slug')
    const catMap: Record<string, string> = {}
    categories?.forEach(c => { catMap[c.slug] = c.id })

    const products = [
      { sku: 'TRJ-NAV-001', name: 'Traje Clásico Navy', description: 'Traje dos piezas en lana super 120s azul marino. Corte italiano con solapa de muesca.', base_price: 1250, cost_price: 450, brand: 'Prats', material: 'Lana Super 120s', product_type: 'boutique', category_id: catMap['americana-traje'] || catMap['americana'], is_active: true, is_visible_web: true, web_slug: 'traje-clasico-navy', color: 'Navy' },
      { sku: 'TRJ-GRY-002', name: 'Traje Príncipe de Gales', description: 'Traje dos piezas príncipe de Gales en gris medio. Tejido Vitale Barberis.', base_price: 1450, cost_price: 550, brand: 'Prats', material: 'Lana VB Canonico', product_type: 'boutique', category_id: catMap['americana-traje'] || catMap['americana'], is_active: true, is_visible_web: true, web_slug: 'traje-principe-gales', color: 'Gris' },
      { sku: 'CAM-WHT-001', name: 'Camisa Oxford Blanca', description: 'Camisa Oxford 100% algodón egipcio. Cuello button-down, corte slim.', base_price: 120, cost_price: 35, brand: 'Prats', material: 'Algodón Egipcio', product_type: 'boutique', category_id: catMap['camisa-vestir'] || catMap['camisa'], is_active: true, is_visible_web: true, web_slug: 'camisa-oxford-blanca', color: 'Blanco' },
      { sku: 'CAM-BLU-002', name: 'Camisa Popelín Celeste', description: 'Camisa popelín de algodón celeste. Cuello italiano, puño redondo.', base_price: 135, cost_price: 38, brand: 'Prats', material: 'Popelín Algodón', product_type: 'boutique', category_id: catMap['camisa-vestir'] || catMap['camisa'], is_active: true, is_visible_web: true, web_slug: 'camisa-popelin-celeste', color: 'Celeste' },
      { sku: 'CRB-SLK-001', name: 'Corbata Seda Burdeos', description: 'Corbata 100% seda italiana, 7 pliegues. Color burdeos con micro estampado.', base_price: 85, cost_price: 25, brand: 'Prats', material: 'Seda Italiana', product_type: 'boutique', category_id: catMap['corbata'], is_active: true, is_visible_web: true, web_slug: 'corbata-seda-burdeos', color: 'Burdeos' },
      { sku: 'CRB-SLK-002', name: 'Corbata Seda Navy Puntos', description: 'Corbata 100% seda, navy con puntos blancos. Clásica y versátil.', base_price: 85, cost_price: 25, brand: 'Prats', material: 'Seda', product_type: 'boutique', category_id: catMap['corbata'], is_active: true, is_visible_web: true, web_slug: 'corbata-seda-navy-puntos', color: 'Navy' },
      { sku: 'CHQ-GRY-001', name: 'Chaleco Gris Formal', description: 'Chaleco formal en lana gris. Espalda ajustable, 5 botones.', base_price: 195, cost_price: 65, brand: 'Prats', material: 'Lana', product_type: 'boutique', category_id: catMap['chaleco'], is_active: true, is_visible_web: true, web_slug: 'chaleco-gris-formal', color: 'Gris' },
      { sku: 'PNT-CHN-001', name: 'Pantalón Chino Beige', description: 'Pantalón chino algodón stretch beige. Corte slim, pinzas frontales.', base_price: 145, cost_price: 42, brand: 'Prats', material: 'Algodón Stretch', product_type: 'boutique', category_id: catMap['pantalon-chino'] || catMap['pantalon'], is_active: true, is_visible_web: true, web_slug: 'pantalon-chino-beige', color: 'Beige' },
    ]

    for (const product of products) {
      const { data: newProduct, error: pErr } = await supabase.from('products').insert(product).select('id').single()
      if (pErr) { console.error(`Producto ${product.sku}:`, pErr.message); continue }

      const sizes = ['48', '50', '52', '54', '56']
      const variants = sizes.map((size) => ({
        product_id: newProduct.id,
        variant_sku: `${product.sku}-${size}`,
        size,
        color: product.color,
        is_active: true,
      }))

      const { data: newVariants, error: vErr } = await supabase.from('product_variants').insert(variants).select('id')
      if (vErr) { console.error(`Variantes ${product.sku}:`, vErr.message); continue }

      if (mainWarehouse && newVariants) {
        const stockLevels = newVariants.map(v => ({
          variant_id: v.id,
          warehouse_id: mainWarehouse.id,
          quantity: Math.floor(Math.random() * 8) + 2,
          available: Math.floor(Math.random() * 6) + 1,
        }))
        await supabase.from('stock_levels').insert(stockLevels)
      }
    }
    console.log(`✅ ${products.length} productos con variantes y stock creados`)
  } else {
    console.log('✅ Productos ya existen')
  }

  // ==========================================
  // 6. SAMPLE TAILORING ORDERS
  // ==========================================
  const { data: existingOrders } = await supabase.from('tailoring_orders').select('id').limit(1)
  if (!existingOrders?.length && mainStore) {
    const { data: clients } = await supabase.from('clients').select('id').limit(5)
    if (clients?.length) {
      const statuses = ['created', 'fabric_ordered', 'in_production', 'fitting', 'delivered']
      const types: string[] = ['artesanal', 'industrial', 'artesanal', 'industrial', 'artesanal']
      const orders = clients.slice(0, 5).map((c, i) => ({
        order_number: `PRATS-2026-${String(i + 1).padStart(4, '0')}`,
        client_id: c.id,
        store_id: mainStore.id,
        order_type: types[i],
        status: statuses[i],
        total: [1250, 85, 2400, 890, 1650][i],
        total_paid: [500, 85, 1000, 400, 800][i],
        order_date: new Date(2026, 0, 15 + i * 5).toISOString().split('T')[0],
        estimated_delivery_date: new Date(2026, 1, 15 + i * 5).toISOString().split('T')[0],
        created_by: adminUserId,
      }))
      const { error } = await supabase.from('tailoring_orders').insert(orders)
      if (error) console.error('Pedidos:', error.message)
      else console.log(`✅ ${orders.length} pedidos de sastrería creados`)
    }
  } else {
    console.log('✅ Pedidos ya existen')
  }

  // ==========================================
  // 7. SAMPLE APPOINTMENTS
  // ==========================================
  const { data: existingAppts } = await supabase.from('appointments').select('id').limit(1)
  if (!existingAppts?.length && mainStore) {
    const { data: clients } = await supabase.from('clients').select('id').limit(3)
    if (clients?.length) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const appointments = [
        { client_id: clients[0].id, store_id: mainStore.id, type: 'consultation', title: 'Consulta traje novio', status: 'confirmed', date: tomorrow.toISOString().split('T')[0], start_time: '10:00', end_time: '11:00', duration_minutes: 60, notes: 'Primera consulta traje novio', created_by: adminUserId },
        { client_id: clients[1]?.id || clients[0].id, store_id: mainStore.id, type: 'fitting', title: 'Prueba traje azul', status: 'confirmed', date: tomorrow.toISOString().split('T')[0], start_time: '12:00', end_time: '12:30', duration_minutes: 30, notes: 'Primera prueba traje azul', created_by: adminUserId },
        { client_id: clients[2]?.id || clients[0].id, store_id: mainStore.id, type: 'delivery', title: 'Recogida camisa y corbata', status: 'scheduled', date: new Date(tomorrow.getTime() + 86400000).toISOString().split('T')[0], start_time: '17:00', end_time: '17:30', duration_minutes: 30, notes: 'Recogida camisa y corbata', created_by: adminUserId },
      ]
      const { error } = await supabase.from('appointments').insert(appointments)
      if (error) console.error('Citas:', error.message)
      else console.log(`✅ ${appointments.length} citas de ejemplo creadas`)
    }
  } else {
    console.log('✅ Citas ya existen')
  }

  // ==========================================
  // 8. SAMPLE BLOG POST
  // ==========================================
  const { data: existingPosts } = await supabase.from('blog_posts').select('id').limit(1)
  if (!existingPosts?.length) {
    await supabase.from('blog_posts').insert([
      {
        slug: 'guia-primer-traje-medida',
        title_es: 'Guía para tu primer traje a medida',
        excerpt_es: 'Todo lo que necesitas saber antes de encargar tu primer traje a medida en una sastrería.',
        body_es: '<h2>¿Por qué un traje a medida?</h2><p>Un traje a medida es una inversión en ti mismo. A diferencia del prêt-à-porter, se confecciona siguiendo tus medidas exactas, lo que garantiza un ajuste perfecto.</p><h2>Elige bien el tejido</h2><p>Para un primer traje, recomendamos una lana super 110s o 120s en azul marino o gris medio. Son colores versátiles que funcionan tanto en la oficina como en eventos.</p><h2>El proceso</h2><p>El proceso completo incluye: consulta inicial, toma de medidas, selección de tejido, patronaje, primera prueba, ajustes y entrega final. En Prats, este proceso dura entre 4 y 6 semanas.</p>',
        category: 'guias',
        tags: ['sastrería', 'trajes', 'guía'],
        status: 'published',
        published_at: new Date().toISOString(),
        author_id: adminUserId,
      },
      {
        slug: 'tendencias-sastreria-2026',
        title_es: 'Tendencias de sastrería para 2026',
        excerpt_es: 'Las tendencias que marcarán la moda masculina de sastrería este año.',
        body_es: '<h2>Siluetas relajadas</h2><p>La tendencia hacia siluetas más relajadas continúa, con americanas de hombro suave y pantalones de pierna más amplia.</p><h2>Tejidos sostenibles</h2><p>Los tejidos reciclados y orgánicos ganan protagonismo. Lanas certificadas y algodones ecológicos se consolidan.</p><h2>Colores tierra</h2><p>Los tonos tierra — camel, terracota, verde oliva — complementan los clásicos navy y gris.</p>',
        category: 'tendencias',
        tags: ['tendencias', '2026', 'moda'],
        status: 'published',
        published_at: new Date(Date.now() - 7 * 86400000).toISOString(),
        author_id: adminUserId,
      },
    ])
    console.log('✅ 2 artículos de blog creados')
  } else {
    console.log('✅ Blog posts ya existen')
  }

  console.log('\n🎉 Seed completado! Usa admin@sastreriaprats.com / password123 para acceder.\n')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
