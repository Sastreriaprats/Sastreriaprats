#!/usr/bin/env node
// Aplica la migración 123: asigna stock.approve_transfer a vendedor_basico y vendedor_avanzado.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan credenciales en .env.local')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: roles, error: rolesErr } = await sb
  .from('roles')
  .select('id,name')
  .in('name', ['vendedor_basico', 'vendedor_avanzado'])
if (rolesErr) { console.error('roles:', rolesErr); process.exit(1) }

// Asegura que el permiso existe (en 001 está declarado, pero no todas las BDs lo tienen)
const { error: upPermErr } = await sb
  .from('permissions')
  .upsert(
    {
      code: 'stock.approve_transfer',
      module: 'stock',
      action: 'update',
      display_name: 'Aprobar traspasos',
      description: 'Autorizar traspasos de stock',
      category: 'Stock',
      sort_order: 76,
    },
    { onConflict: 'code', ignoreDuplicates: true }
  )
if (upPermErr) { console.error('upsert permission:', upPermErr); process.exit(1) }

const { data: perm, error: permErr } = await sb
  .from('permissions')
  .select('id,code')
  .eq('code', 'stock.approve_transfer')
  .single()
if (permErr) { console.error('permission:', permErr); process.exit(1) }

const rows = roles.map(r => ({ role_id: r.id, permission_id: perm.id }))
const { error: insErr } = await sb
  .from('role_permissions')
  .upsert(rows, { onConflict: 'role_id,permission_id', ignoreDuplicates: true })
if (insErr) { console.error('insert:', insErr); process.exit(1) }

const { data: check } = await sb
  .from('role_permissions')
  .select('role_id, roles!inner(name), permissions!inner(code)')
  .eq('permissions.code', 'stock.approve_transfer')
  .in('roles.name', ['vendedor_basico', 'vendedor_avanzado'])

console.log('✔ stock.approve_transfer asignado. Roles con el permiso:')
for (const c of check ?? []) console.log('  -', c.roles.name)
