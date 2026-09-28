import type { AdminClient } from '@/lib/server/action-wrapper'
import { readAllPaged } from '@/lib/server/paged'
import { getLineGroup } from '@/lib/orders/line-groups'
import { groupLabelOf } from '@/lib/orders/line-refs'

// ─── Informe de sastrería: prendas ENCARGADAS por tipología (sep-2026) ───────
// "Cuántas prendas se encargan de cada tipología (trajes, camisas, americanas,
// pantalones…), sastrería y camisería artesanal e industrial por separado, sin
// mezclarlas con boutique."
//
//  - Prenda = una línea del pedido (quantity es siempre 1). Se excluyen pedidos y
//    líneas cancelados y los complementos de boutique añadidos al pedido.
//  - Sastrería/camisería = getLineGroup (criterio único de la plataforma: la
//    ficha rellenada y, si no, garment_types.code; el pijama va con camisería).
//  - Artesanal/industrial = line_type de la línea (fallback: order_type).
//  - Periodo = order_date del pedido (fecha real del encargo), como el resto de
//    informes de sastrería.
//  - Conjuntos (traje, traje con chaleco, chaqué, smoking…): prendas del mismo
//    pedido con el mismo texto tras "—" en la ficha ("Americana — Traje 1") y al
//    menos 2 piezas; un conjunto cuenta 1. Los pedidos antiguos sin esa etiqueta
//    no se pueden agrupar y solo cuentan como prendas sueltas.

export type Manufacturing = 'artesanal' | 'industrial'
export type TailoringGarmentRow = { key: string; name: string; artesanal: number; industrial: number; total: number }

export type TailoringGarmentsReport = {
  orders: number
  totals: {
    sastreria: { artesanal: number; industrial: number; total: number }
    camiseria: { artesanal: number; industrial: number; total: number }
    total: number
  }
  sastreria: TailoringGarmentRow[]
  camiseria: TailoringGarmentRow[]
  sets: TailoringGarmentRow[]
  /** Prendas de sastrería de pedidos sin etiqueta de conjunto (anteriores a la ficha nueva). */
  unlabeledSastreria: number
}

const JACKET_CODES = new Set(['americana', 'chaque', 'chaquet', 'levita', 'frac', 'smoking_jacket'])

const setKind = (label: string): string => {
  const base = label.replace(/\s*\d+\s*$/, '').trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Conjunto'
}

export async function computeTailoringGarmentsReport(
  adminClient: AdminClient,
  { start_date, end_date, store_id }: { start_date: string; end_date: string; store_id?: string },
): Promise<TailoringGarmentsReport> {
  const build = () => {
    let q = adminClient
      .from('tailoring_order_lines')
      .select('id, line_type, status, configuration, garment_types(code, name), tailoring_orders!inner(id, order_date, store_id, status, order_type)')
      .neq('status', 'cancelled')
      .neq('tailoring_orders.status', 'cancelled')
      // order_date es DATE → rango sin sufijo de hora.
      .gte('tailoring_orders.order_date', start_date)
      .lte('tailoring_orders.order_date', end_date)
    if (store_id) q = q.eq('tailoring_orders.store_id', store_id)
    return q
  }
  const lines = await readAllPaged<any>((f, t) => build().order('id', { ascending: true }).range(f, t), 'getTailoringGarmentsReport.lines')

  const rows = { sastreria: new Map<string, TailoringGarmentRow>(), camiseria: new Map<string, TailoringGarmentRow>() }
  const bump = (map: Map<string, TailoringGarmentRow>, key: string, name: string, mf: Manufacturing) => {
    const r = map.get(key) ?? { key, name, artesanal: 0, industrial: 0, total: 0 }
    r[mf]++
    r.total++
    map.set(key, r)
  }

  const orders = new Set<string>()
  // Conjuntos: pedido + etiqueta → piezas (código de prenda y tipo de confección).
  const setPieces = new Map<string, { kind: string; pieces: { code: string; mf: Manufacturing }[] }>()
  let unlabeledSastreria = 0

  for (const l of lines) {
    const group = getLineGroup(l)
    if (group === 'complementos') continue
    const order = Array.isArray(l.tailoring_orders) ? l.tailoring_orders[0] : l.tailoring_orders
    const gt = Array.isArray(l.garment_types) ? l.garment_types[0] : l.garment_types
    const code = String(gt?.code ?? '').toLowerCase()
    const mf: Manufacturing = (l.line_type || order?.order_type) === 'industrial' ? 'industrial' : 'artesanal'
    if (order?.id) orders.add(String(order.id))

    if (group === 'camiseria') {
      const isPijama = code === 'pijama'
      bump(rows.camiseria, isPijama ? 'pijama' : 'camisa', isPijama ? 'Pijama' : 'Camisa', mf)
      continue
    }

    bump(rows.sastreria, code || 'otra', String(gt?.name ?? '').trim() || 'Sin tipo', mf)
    const label = groupLabelOf(l)
    if (label && order?.id) {
      const key = `${order.id}|${label.toLowerCase()}`
      const set = setPieces.get(key) ?? { kind: setKind(label), pieces: [] }
      set.pieces.push({ code, mf })
      setPieces.set(key, set)
    } else if (!(l.configuration as Record<string, unknown> | null)?.prendaLabel) {
      unlabeledSastreria++
    }
  }

  const sets = new Map<string, TailoringGarmentRow>()
  for (const set of setPieces.values()) {
    if (set.pieces.length < 2) continue // una sola pieza con etiqueta de conjunto: prenda suelta
    // Artesanal/industrial del conjunto: el de la chaqueta (la pieza que lleva el precio).
    const mf = (set.pieces.find((p) => JACKET_CODES.has(p.code)) ?? set.pieces[0]).mf
    bump(sets, set.kind.toLowerCase(), set.kind, mf)
  }

  const sortRows = (m: Map<string, TailoringGarmentRow>) => [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const sum = (m: Map<string, TailoringGarmentRow>) => {
    let artesanal = 0
    let industrial = 0
    for (const r of m.values()) { artesanal += r.artesanal; industrial += r.industrial }
    return { artesanal, industrial, total: artesanal + industrial }
  }
  const sastreria = sum(rows.sastreria)
  const camiseria = sum(rows.camiseria)

  return ({
    orders: orders.size,
    totals: { sastreria, camiseria, total: sastreria.total + camiseria.total },
    sastreria: sortRows(rows.sastreria),
    camiseria: sortRows(rows.camiseria),
    sets: sortRows(sets),
    unlabeledSastreria,
  })
}
