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
