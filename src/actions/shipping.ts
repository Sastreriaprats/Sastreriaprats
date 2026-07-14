'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { COUNTRY_CODES } from '@/lib/countries'

export interface ShippingZoneRow {
  id: string
  name: string
  shipping_cost: number
  free_shipping_threshold: number | null
  is_active: boolean
  is_default: boolean
  sort_order: number
  countries: string[]
}

export interface UpsertShippingZoneInput {
  id?: string
  name: string
  shipping_cost: number
  free_shipping_threshold: number | null
  is_active: boolean
  is_default: boolean
  countries: string[]
}

export const listShippingZones = protectedAction<void, ShippingZoneRow[]>(
  { permission: 'config.edit', auditModule: 'shipping' },
  async (ctx) => {
    const [{ data: zones, error }, { data: mappings, error: mapError }] = await Promise.all([
      ctx.adminClient
        .from('shipping_zones')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      ctx.adminClient.from('shipping_zone_countries').select('zone_id, country_code'),
    ])
    if (error) return failure(error.message)
    if (mapError) return failure(mapError.message)

    const byZone = new Map<string, string[]>()
    for (const m of mappings ?? []) {
      const list = byZone.get(m.zone_id) ?? []
      list.push(m.country_code)
      byZone.set(m.zone_id, list)
    }
    return success(
      (zones ?? []).map(z => ({ ...z, countries: (byZone.get(z.id) ?? []).sort() })) as ShippingZoneRow[]
    )
  },
)

export const upsertShippingZone = protectedAction<UpsertShippingZoneInput, ShippingZoneRow>(
  {
    permission: 'config.edit',
    auditModule: 'shipping',
    auditAction: 'update',
    auditEntity: 'shipping_zone',
    revalidate: ['/admin/configuracion'],
  },
  async (ctx, input) => {
    const name = input.name.trim()
    if (!name) return failure('El nombre es obligatorio')
    if (!(input.shipping_cost >= 0)) return failure('El coste de envío no puede ser negativo')
    if (input.free_shipping_threshold != null && !(input.free_shipping_threshold > 0)) {
      return failure('El umbral de envío gratis debe ser mayor que 0 (o vacío para desactivarlo)')
    }

    const countries = [...new Set(input.countries.map(c => c.trim().toUpperCase()).filter(Boolean))]
    const invalid = countries.filter(c => !COUNTRY_CODES.includes(c))
    if (invalid.length) return failure(`Código de país no válido: ${invalid.join(', ')}`)
    if (!input.is_default && countries.length === 0) {
      return failure('Asigna al menos un país (o marca la zona como "Resto de países")')
    }

    // Un país no puede estar en dos zonas: comprobación amistosa antes del
    // constraint UNIQUE (que sigue guardando la espalda ante carreras).
    if (countries.length) {
      const { data: taken } = await ctx.adminClient
        .from('shipping_zone_countries')
        .select('country_code, zone_id, shipping_zones(name)')
        .in('country_code', countries)
      const conflicts = (taken ?? []).filter(t => t.zone_id !== input.id)
      if (conflicts.length) {
        const detail = conflicts
          .map(c => `${c.country_code} (${(c.shipping_zones as unknown as { name?: string } | null)?.name ?? 'otra zona'})`)
          .join(', ')
        return failure(`Estos países ya están asignados a otra zona: ${detail}`)
      }
    }

    // Solo puede haber UNA zona catch-all: si esta pasa a serlo, desmarcamos la anterior.
    if (input.is_default) {
      const { error: clearError } = await ctx.adminClient
        .from('shipping_zones')
        .update({ is_default: false })
        .eq('is_default', true)
        .neq('id', input.id ?? '00000000-0000-0000-0000-000000000000')
      if (clearError) return failure(clearError.message)
    }

    const zoneValues = {
      name,
      shipping_cost: input.shipping_cost,
      free_shipping_threshold: input.free_shipping_threshold,
      is_active: input.is_active,
      is_default: input.is_default,
    }

    let zoneId = input.id
    if (zoneId) {
      const { error } = await ctx.adminClient.from('shipping_zones').update(zoneValues).eq('id', zoneId)
      if (error) return failure(error.message)
    } else {
      const { data, error } = await ctx.adminClient
        .from('shipping_zones')
        .insert(zoneValues)
        .select('id')
        .single()
      if (error) return failure(error.message)
      zoneId = data.id as string
    }

    // Reemplazar el mapeo de países de la zona.
    const { error: delError } = await ctx.adminClient
      .from('shipping_zone_countries')
      .delete()
      .eq('zone_id', zoneId)
    if (delError) return failure(delError.message)
    if (countries.length) {
      const { error: insError } = await ctx.adminClient
        .from('shipping_zone_countries')
        .insert(countries.map(country_code => ({ zone_id: zoneId, country_code })))
      if (insError) {
        if (insError.code === '23505') return failure('Algún país ya está asignado a otra zona')
        return failure(insError.message)
      }
    }

    const { data: saved, error: readError } = await ctx.adminClient
      .from('shipping_zones')
      .select('*')
      .eq('id', zoneId)
      .single()
    if (readError) return failure(readError.message)

    return success({
      ...(saved as Omit<ShippingZoneRow, 'countries'>),
      countries,
      auditEntityId: String(zoneId),
      auditDescription: `Zona de envío ${name}`,
    } as ShippingZoneRow)
  },
)

export const deleteShippingZone = protectedAction<{ id: string }, { id: string }>(
  {
    permission: 'config.edit',
    auditModule: 'shipping',
    auditAction: 'delete',
    auditEntity: 'shipping_zone',
    revalidate: ['/admin/configuracion'],
  },
  async (ctx, { id }) => {
    const { data: existing } = await ctx.adminClient
      .from('shipping_zones')
      .select('name')
      .eq('id', id)
      .maybeSingle()
    const { error } = await ctx.adminClient.from('shipping_zones').delete().eq('id', id)
    if (error) return failure(error.message)
    const name = (existing as { name?: string } | null)?.name ?? id
    return success({
      id,
      auditEntityId: String(id),
      auditDescription: `Zona de envío ${name} eliminada`,
    } as { id: string })
  },
)
