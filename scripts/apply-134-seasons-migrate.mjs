#!/usr/bin/env node
// Migración 134 (vía cliente JS de Supabase, sin exec_sql).
// Porta las temporadas legadas de `product_seasons` a la tabla nueva
// `seasons` (con slug) y reasigna `products.season` / `fabrics.season`.
// Idempotente.

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function ensureUniqueSlug(base) {
  let candidate = base || 'temporada'
  let n = 2
  // Bucle limitado por seguridad
  while (n < 200) {
    const { data, error } = await sb
      .from('seasons').select('id').eq('slug', candidate).maybeSingle()
    if (error) throw error
    if (!data) return candidate
    candidate = `${base}-${n++}`
  }
  throw new Error(`No se pudo generar slug único para base="${base}"`)
}

async function nextSortOrder() {
  const { data } = await sb.from('seasons').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  return ((data && data[0]?.sort_order) || 0) + 1
}

async function main() {
  // 1) Leer product_seasons (puede no existir si ya se eliminó).
  const { data: legacy, error: legacyErr } = await sb
    .from('product_seasons')
    .select('id, name, description, is_active, created_at, updated_at')
    .order('name', { ascending: true })

  if (legacyErr) {
    const code = legacyErr.code || ''
    const msg = String(legacyErr.message || '').toLowerCase()
    // Tabla no existe → nada que portar
    if (code === '42P01' || msg.includes('does not exist')) {
      console.log('product_seasons no existe; nada que migrar.')
      return
    }
    throw legacyErr
  }

  if (!legacy || legacy.length === 0) {
    console.log('No hay temporadas legadas que portar.')
    return
  }

  let inserted = 0
  let skipped = 0
  let productsUpdated = 0
  let fabricsUpdated = 0
  let sortOrder = await nextSortOrder()

  for (const ps of legacy) {
    const name = String(ps.name || '').trim()
    if (!name) { skipped++; continue }

    // ¿Ya existe una temporada con el mismo name en `seasons`?
    const { data: existing, error: exErr } = await sb
      .from('seasons').select('id, slug').eq('name', name).maybeSingle()
    if (exErr) throw exErr

    let targetSlug
    if (existing) {
      targetSlug = existing.slug
      skipped++
    } else {
      const base = slugify(name) || 'temporada'
      targetSlug = await ensureUniqueSlug(base)
      const { error: insErr } = await sb
        .from('seasons')
        .insert({
          name,
          slug: targetSlug,
          description: ps.description ?? null,
          is_active: ps.is_active !== false,
          sort_order: sortOrder++,
        })
      if (insErr) throw insErr
      inserted++
    }

    // Reasignar productos cuyo `season` coincide con el name antiguo.
    const { data: prodHit, error: prodErr } = await sb
      .from('products').update({ season: targetSlug }, { count: 'exact' })
      .eq('season', name).select('id')
    if (prodErr) throw prodErr
    productsUpdated += (prodHit?.length || 0)

    // Lo mismo para fabrics, si la tabla tiene la columna.
    try {
      const { data: fabHit } = await sb
        .from('fabrics').update({ season: targetSlug }, { count: 'exact' })
        .eq('season', name).select('id')
      fabricsUpdated += (fabHit?.length || 0)
    } catch {
      /* fabrics puede no tener columna; lo ignoramos */
    }
  }

  console.log(`✔ Migración 134 completada.`)
  console.log(`   • Temporadas insertadas en \`seasons\`: ${inserted}`)
  console.log(`   • Ya existentes (omitidas):           ${skipped}`)
  console.log(`   • Productos reasignados al slug:       ${productsUpdated}`)
  console.log(`   • Fabrics reasignadas al slug:         ${fabricsUpdated}`)
}

main().catch((err) => {
  console.error('Error en la migración:', err?.message || err)
  process.exit(1)
})
