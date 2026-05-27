'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

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
 * Devuelve la "carga" actual de cada oficial activo:
 * cuántas líneas figuran con él como cortador y cuántas como oficial en pedidos
 * cuyo estado de cabecera está activo según el rediseño de Ismael:
 *   - Artesanal/camiseria: in_production, in_fitting
 *   - Industrial/camiseria_industrial: in_production
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
      .select('id, configuration, tailoring_orders!inner(status, order_type)')
      .in('tailoring_orders.status', ['in_production', 'in_fitting'])
    if (linesErr) return failure(linesErr.message)

    type LineRow = {
      id: string
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
  status: string // 'in_production' | 'in_fitting'
  client_name: string
  garment_type: string
  fabric_name: string | null
  model_name: string | null
  estimated_delivery_date: string | null
  days_in_progress: number
}

export type OfficialInProgress = {
  official: { id: string; name: string; specialty: string | null } | null
  asCortador: OfficialInProgressItem[]
  asOficial: OfficialInProgressItem[]
}

/**
 * Devuelve las prendas en proceso de un oficial concreto, separadas por
 * rol (cortador / oficial). Misma lógica de "en proceso" que getOfficialsLoad:
 *  - Artesanal/camiseria: estados in_production, in_fitting
 *  - Industrial/camiseria_industrial: solo in_production
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
        'id, configuration, model_name, fabric_description, ' +
          'garment_types(name), ' +
          'fabrics(name, fabric_code), ' +
          'tailoring_orders!inner(id, order_number, order_type, status, estimated_delivery_date, updated_at, clients(full_name, first_name, last_name))'
      )
      .in('tailoring_orders.status', ['in_production', 'in_fitting'])
    if (linesErr) return failure(linesErr.message)

    type LineRow = {
      id: string
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

    const asCortador: OfficialInProgressItem[] = []
    const asOficial: OfficialInProgressItem[] = []
    const now = Date.now()

    for (const l of lines) {
      const parent = Array.isArray(l.tailoring_orders) ? l.tailoring_orders[0] : l.tailoring_orders
      if (!parent) continue

      const isArtesanal = ARTESANAL_TYPES.has(parent.order_type)
      const isIndustrial = INDUSTRIAL_TYPES.has(parent.order_type)
      if (isIndustrial && parent.status !== 'in_production') continue
      if (!isArtesanal && !isIndustrial) continue

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

      const item: OfficialInProgressItem = {
        line_id: l.id,
        order_id: parent.id,
        order_number: parent.order_number,
        order_type: parent.order_type,
        status: parent.status,
        client_name: clientName,
        garment_type: garmentType,
        fabric_name: fabricName,
        model_name: l.model_name,
        estimated_delivery_date: parent.estimated_delivery_date,
        days_in_progress: daysInProgress,
      }

      // Una misma línea puede asignarle al oficial los dos roles (cortador y
      // oficial). En ese caso aparece en ambas secciones por diseño.
      if (matchesCortador) asCortador.push(item)
      if (matchesOficial) asOficial.push(item)
    }

    // Ordenar por días en proceso (descendente: lo más antiguo primero)
    asCortador.sort((a, b) => b.days_in_progress - a.days_in_progress)
    asOficial.sort((a, b) => b.days_in_progress - a.days_in_progress)

    return success({
      official: official as { id: string; name: string; specialty: string | null },
      asCortador,
      asOficial,
    })
  }
)
