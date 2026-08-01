'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { SPECIALTIES } from '@/lib/officials/specialties'

export type OfficialLoad = {
  id: string
  name: string
  specialty: string | null
  asCortador: number
  asOficial: number
  total: number
}

/**
 * Normaliza un nombre quitando acentos y forzando UPPER. Se usa para cruzar
 * `configuration.cortador` / `configuration.oficial` (texto libre en JSONB)
 * con `officials.name` (también texto libre). Verificado en producción:
 * con esta normalización los 18 nombres distintos en uso casan al 100% con
 * los 21 oficiales activos.
 */
function normalizeName(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

// Tipos de pedido que distinguen qué estados cuentan como "en proceso del oficial".
// - Artesanal/camiseria (en_confección + en_prueba)
// - Industrial/camiseria_industrial (solo en_confección; el in_fitting no aplica)
const ARTESANAL_TYPES = new Set(['artesanal', 'camiseria'])
const INDUSTRIAL_TYPES = new Set(['industrial', 'camiseria_industrial'])

/**
 * Estados de PRENDA (tailoring_order_lines.status) en los que el oficial ya
 * terminó su trabajo. El estado del PEDIDO puede seguir en "En confección"
 * porque otras prendas del mismo pedido siguen abiertas: por eso la carga y el
 * detalle se clasifican por el estado de la LÍNEA, no por el de la cabecera
 * (aviso de Ismael, jul-2026: todo salía como "En confección").
 */
const FINISHED_LINE_STATUSES = new Set(['finished', 'delivered', 'received_in_store'])
/** Prendas fuera del trabajo del oficial: ni pendientes ni terminadas. */
const EXCLUDED_LINE_STATUSES = new Set(['cancelled'])

export function isFinishedGarment(lineStatus: string | null | undefined): boolean {
  return FINISHED_LINE_STATUSES.has(lineStatus || '')
}

/**
 * Devuelve la "carga" actual de cada oficial activo:
 * cuántas líneas figuran con él como cortador y cuántas como oficial en pedidos
 * cuyo estado de cabecera está activo según el rediseño de Ismael:
 *   - Artesanal/camiseria: in_production, in_fitting
 *   - Industrial/camiseria_industrial: in_production
 *
 * Carga = SOLO lo pendiente: dentro de esos pedidos, las prendas que el oficial
 * ya dio por terminadas/entregadas no suman (ver FINISHED_LINE_STATUSES).
 *
 * Oficiales "fantasma" (texto en configuration que no coincide con ninguna
 * fila de `officials`) se ignoran. Solo aparecen los oficiales dados de alta.
 *
 * Una sola query a tailoring_order_lines con INNER JOIN al pedido (PostgREST
 * `tailoring_orders!inner`), filtrada por status activo del padre. El recuento
 * se hace en JS — el dataset cabe holgadamente en memoria (≤500 líneas en
 * producción hoy).
 */
export const getOfficialsLoad = protectedAction<void, OfficialLoad[]>(
  { permission: 'officials.view', auditModule: 'officials' },
  async (ctx) => {
    // 1. Oficiales activos
    const { data: officialsRows, error: officialsErr } = await ctx.adminClient
      .from('officials')
      .select('id, name, specialty')
      .eq('is_active', true)
    if (officialsErr) return failure(officialsErr.message)

    type OfficialRow = { id: string; name: string; specialty: string | null }
    const officials = (officialsRows ?? []) as OfficialRow[]

    // 2. Líneas en pedidos activos (cabecera in_production o in_fitting)
    const { data: linesRows, error: linesErr } = await ctx.adminClient
      .from('tailoring_order_lines')
      .select('id, status, configuration, tailoring_orders!inner(status, order_type)')
      .in('tailoring_orders.status', ['in_production', 'in_fitting'])
    if (linesErr) return failure(linesErr.message)

    type LineRow = {
      id: string
      status: string
      configuration: { cortador?: string; oficial?: string } | null
      tailoring_orders:
        | { status: string; order_type: string }
        | { status: string; order_type: string }[]
        | null
    }
    const lines = (linesRows ?? []) as LineRow[]

    // 3. Indexar oficiales por nombre normalizado
    const byNorm = new Map<string, OfficialLoad>()
    for (const o of officials) {
      byNorm.set(normalizeName(o.name), {
        id: o.id,
        name: o.name,
        specialty: o.specialty,
        asCortador: 0,
        asOficial: 0,
        total: 0,
      })
    }

    // 4. Recorrer líneas y contar según order_type + status
    for (const l of lines) {
      const parent = Array.isArray(l.tailoring_orders) ? l.tailoring_orders[0] : l.tailoring_orders
      if (!parent) continue

      const { status, order_type } = parent
      const isArtesanal = ARTESANAL_TYPES.has(order_type)
      const isIndustrial = INDUSTRIAL_TYPES.has(order_type)

      // Filtros del cuadro de Ismael
      if (isIndustrial && status !== 'in_production') continue
      if (!isArtesanal && !isIndustrial) continue // proveedor, oficial, otros: fuera

      // La CARGA es lo que le queda por hacer: las prendas ya terminadas (o
      // entregadas) dentro de un pedido todavía abierto no cuentan.
      if (isFinishedGarment(l.status) || EXCLUDED_LINE_STATUSES.has(l.status)) continue

      const cortador = normalizeName(l.configuration?.cortador)
      const oficial = normalizeName(l.configuration?.oficial)

      if (cortador) {
        const entry = byNorm.get(cortador)
        if (entry) entry.asCortador += 1
      }
      if (oficial) {
        const entry = byNorm.get(oficial)
        if (entry) entry.asOficial += 1
      }
    }

    // 5. Calcular total y ordenar por nombre
    const result = Array.from(byNorm.values())
    for (const e of result) e.total = e.asCortador + e.asOficial
    result.sort((a, b) => a.name.localeCompare(b.name, 'es'))

    return success(result)
  }
)

export type OfficialInProgressItem = {
  line_id: string
  order_id: string
  order_number: string
  order_type: string
  /** Estado de la PRENDA (tailoring_order_lines.status). */
  status: string
  /** Estado de la cabecera del pedido, para contexto. */
  order_status: string
  /** true si la prenda ya está terminada/entregada (bloque «Terminadas»). */
  is_finished: boolean
  client_name: string
  garment_type: string
  fabric_name: string | null
  model_name: string | null
  estimated_delivery_date: string | null
  days_in_progress: number
}

/** Prendas de un rol, partidas en lo que queda por hacer y lo ya terminado. */
export type OfficialRoleItems = {
  pending: OfficialInProgressItem[]
  finished: OfficialInProgressItem[]
}

export type OfficialInProgress = {
  official: { id: string; name: string; specialty: string | null } | null
  asCortador: OfficialRoleItems
  asOficial: OfficialRoleItems
}

/**
 * Devuelve las prendas de un oficial concreto en pedidos vivos, separadas por
 * rol (cortador / oficial) y, dentro de cada rol, entre las que sigue teniendo
 * en confección y las que ya ha terminado. Universo igual que getOfficialsLoad:
 *  - Artesanal/camiseria: estados in_production, in_fitting
 *  - Industrial/camiseria_industrial: solo in_production
 * (pedidos ya cerrados no entran: para el histórico está la liquidación).
 *
 * La clasificación pendiente/terminada usa el estado de la LÍNEA, no el del
 * pedido: un pedido sigue "En confección" mientras alguna prenda esté abierta,
 * y por eso antes salían como en curso prendas ya acabadas.
 *
 * Días en proceso: aproximación con `tailoring_orders.updated_at`. Si se
 * requiere precisión exacta (cuándo entró al estado actual), habría que
 * consultar `tailoring_order_state_history`. Para el alcance actual basta.
 */
export const getOfficialInProgressItems = protectedAction<
  string,
  OfficialInProgress
>(
  { permission: 'officials.view', auditModule: 'officials' },
  async (ctx, officialId) => {
    if (!officialId?.trim()) return failure('officialId requerido', 'VALIDATION')

    // 1. Cargar el oficial
    const { data: official, error: officialErr } = await ctx.adminClient
      .from('officials')
      .select('id, name, specialty')
      .eq('id', officialId)
      .maybeSingle()
    if (officialErr) return failure(officialErr.message)
    if (!official) return failure('Oficial no encontrado', 'NOT_FOUND')

    const normalizedName = normalizeName((official as { name: string }).name)

    // 2. Líneas en pedidos activos con todos los datos necesarios
    const { data: linesRows, error: linesErr } = await ctx.adminClient
      .from('tailoring_order_lines')
      .select(
        'id, status, configuration, model_name, fabric_description, ' +
          'garment_types(name), ' +
          'fabrics(name, fabric_code), ' +
          'tailoring_orders!inner(id, order_number, order_type, status, estimated_delivery_date, updated_at, clients(full_name, first_name, last_name))'
      )
      .in('tailoring_orders.status', ['in_production', 'in_fitting'])
    if (linesErr) return failure(linesErr.message)

    type LineRow = {
      id: string
      status: string
      configuration: { cortador?: string; oficial?: string } | null
      model_name: string | null
      fabric_description: string | null
      garment_types: { name: string } | { name: string }[] | null
      fabrics: { name: string | null; fabric_code: string | null } | { name: string | null; fabric_code: string | null }[] | null
      tailoring_orders:
        | { id: string; order_number: string; order_type: string; status: string; estimated_delivery_date: string | null; updated_at: string; clients: { full_name: string | null; first_name: string | null; last_name: string | null } | { full_name: string | null; first_name: string | null; last_name: string | null }[] | null }
        | null
    }

    const lines = (linesRows ?? []) as unknown as LineRow[]

    const asCortador: OfficialRoleItems = { pending: [], finished: [] }
    const asOficial: OfficialRoleItems = { pending: [], finished: [] }
    const now = Date.now()

    for (const l of lines) {
      const parent = Array.isArray(l.tailoring_orders) ? l.tailoring_orders[0] : l.tailoring_orders
      if (!parent) continue

      const isArtesanal = ARTESANAL_TYPES.has(parent.order_type)
      const isIndustrial = INDUSTRIAL_TYPES.has(parent.order_type)
      if (isIndustrial && parent.status !== 'in_production') continue
      if (!isArtesanal && !isIndustrial) continue
      if (EXCLUDED_LINE_STATUSES.has(l.status)) continue

      const lineCortador = normalizeName(l.configuration?.cortador)
      const lineOficial = normalizeName(l.configuration?.oficial)
      const matchesCortador = lineCortador === normalizedName
      const matchesOficial = lineOficial === normalizedName
      if (!matchesCortador && !matchesOficial) continue

      const client = Array.isArray(parent.clients) ? parent.clients[0] : parent.clients
      const clientName =
        client?.full_name ||
        [client?.first_name, client?.last_name].filter(Boolean).join(' ') ||
        'Cliente'

      const gt = Array.isArray(l.garment_types) ? l.garment_types[0] : l.garment_types
      const garmentType = gt?.name || 'Prenda'

      const fabric = Array.isArray(l.fabrics) ? l.fabrics[0] : l.fabrics
      const fabricName = fabric?.name || fabric?.fabric_code || l.fabric_description || null

      const updatedAt = new Date(parent.updated_at).getTime()
      const daysInProgress = Number.isFinite(updatedAt)
        ? Math.max(0, Math.floor((now - updatedAt) / (24 * 60 * 60 * 1000)))
        : 0

      const finished = isFinishedGarment(l.status)
      const item: OfficialInProgressItem = {
        line_id: l.id,
        order_id: parent.id,
        order_number: parent.order_number,
        order_type: parent.order_type,
        status: l.status,
        order_status: parent.status,
        is_finished: finished,
        client_name: clientName,
        garment_type: garmentType,
        fabric_name: fabricName,
        model_name: l.model_name,
        estimated_delivery_date: parent.estimated_delivery_date,
        days_in_progress: daysInProgress,
      }

      // Una misma línea puede asignarle al oficial los dos roles (cortador y
      // oficial). En ese caso aparece en ambas secciones por diseño.
      const bucket = finished ? 'finished' : 'pending'
      if (matchesCortador) asCortador[bucket].push(item)
      if (matchesOficial) asOficial[bucket].push(item)
    }

    // Ordenar por días en proceso (descendente: lo más antiguo primero)
    const byDays = (a: OfficialInProgressItem, b: OfficialInProgressItem) =>
      b.days_in_progress - a.days_in_progress
    asCortador.pending.sort(byDays)
    asCortador.finished.sort(byDays)
    asOficial.pending.sort(byDays)
    asOficial.finished.sort(byDays)

    return success({
      official: official as { id: string; name: string; specialty: string | null },
      asCortador,
      asOficial,
    })
  }
)

export type OfficialSpecialtyPrice = {
  id: string
  official_id: string
  specialty: string
  price: number
}

/**
 * Reemplaza el set completo de precios por especialidad de un oficial.
 *
 * Recibe un objeto { especialidad: precio }, p.ej. { Americana: 50, Chaqué: 80 }.
 * La atomicidad (borrar+insertar) la garantiza la RPC
 * `upsert_official_specialty_prices`. Aquí se validan en servidor:
 *   - que cada especialidad esté en el catálogo SPECIALTIES,
 *   - que cada precio sea un número finito >= 0.
 *
 * Gated por `officials.edit` (no se crea permiso nuevo).
 */
export const upsertOfficialPrices = protectedAction<
  { officialId: string; prices: Record<string, number> },
  OfficialSpecialtyPrice[]
>(
  { permission: 'officials.edit', auditModule: 'officials' },
  async (ctx, { officialId, prices }) => {
    if (!officialId?.trim()) return failure('officialId requerido', 'VALIDATION')
    if (prices == null || typeof prices !== 'object') {
      return failure('prices inválido', 'VALIDATION')
    }

    const allowed = new Set<string>(SPECIALTIES)
    const clean: Record<string, number> = {}
    for (const [specialty, raw] of Object.entries(prices)) {
      if (!allowed.has(specialty)) {
        return failure(`Especialidad no válida: ${specialty}`, 'VALIDATION')
      }
      const price = Number(raw)
      if (!Number.isFinite(price) || price < 0) {
        return failure(`Precio inválido para «${specialty}»`, 'VALIDATION')
      }
      clean[specialty] = price
    }

    const { data, error } = await ctx.adminClient.rpc('upsert_official_specialty_prices', {
      p_official_id: officialId,
      p_prices: clean,
    })
    if (error) return failure(error.message)

    return success((data ?? []) as OfficialSpecialtyPrice[])
  }
)
