'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, UserPlus, UserCheck, Trophy, Store, Sparkles, Repeat, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { ClientsAdvancedAnalytics } from '@/actions/reports'
import { clientSourceLabel, assignSourceColors } from '@/lib/clients/sources'

type ClientsData = {
  newClients: number
  totalClientsHistorical: number
  sources: Record<string, number>
  sourcesDetail: { source: string; clients: { id: string; name: string; types: string[] }[] }[]
  topClients: { full_name: string; total_revenue: number }[]
  clientsWithPurchases: number
  dailyUniqueByStore?: { store_id: string; store_name: string; byDay: { day: string; count: number }[] }[]
}

// nº8b: etiqueta + color del tipo de compra (misma terminología que el resto).
const PURCHASE_TYPE_META: Record<string, { label: string; color: string }> = {
  boutique: { label: 'Boutique', color: '#1e3a5f' },
  gift_cards: { label: 'Tarjetas', color: '#f59e0b' },
  sastreria: { label: 'Sastrería', color: '#c084fc' },
  online: { label: 'Online', color: '#0ea5e9' },
}

// Mapas locales eliminados. La fuente de verdad vive en
// '@/lib/clients/sources' y se consume vía clientSourceLabel/Color.

const MEDAL_COLORS = ['text-yellow-500', 'text-gray-400', 'text-amber-600']
const MEDAL_BG = ['bg-yellow-50 border-yellow-200', 'bg-gray-50 border-gray-200', 'bg-amber-50 border-amber-200']

const GRANULARITY_LABEL: Record<ClientsAdvancedAnalytics['granularity'], string> = {
  day: 'día',
  week: 'semana',
  month: 'mes',
}

/** Formatea un ISO date (yyyy-mm-dd) según la granularidad. */
function formatBucketDate(iso: string, granularity: ClientsAdvancedAnalytics['granularity']): string {
  // Importante: usar UTC para evitar shifts por TZ. El RPC devuelve fechas
  // YYYY-MM-DD (sin hora) que JS interpreta como UTC midnight.
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  if (granularity === 'month') {
    return d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

export function ClientsChart({
  data,
  advanced,
  showByStore = false,
}: {
  data: ClientsData | null
  advanced: ClientsAdvancedAnalytics | null
  showByStore?: boolean
}) {
  if (!data) return <p className="text-center text-muted-foreground py-12">Sin datos</p>

  const sources = data.sources || {}
  const totalSources = Object.values(sources).reduce((s, v) => s + v, 0)
  // Color ÚNICO por origen presente (ninguno comparte color, ni los legacy).
  const sourceColors = assignSourceColors(Object.keys(sources))
  // nº8a: clientes por origen (para la lista expandible).
  const clientsBySource: Record<string, { id: string; name: string; types: string[] }[]> =
    Object.fromEntries((data.sourcesDetail || []).map(s => [s.source, s.clients]))
  const top3 = (data.topClients || []).slice(0, 3)
  // % de clientes históricos que compraron en el periodo. Numerador = del
  // periodo, denominador = histórico → métrica deliberadamente "tasa de
  // activación" sobre la base instalada.
  const activePct = data.totalClientsHistorical > 0
    ? Math.round((data.clientsWithPurchases / data.totalClientsHistorical) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* ── Fila 1: Origen + Resumen (existentes, fix de etiquetas) ───── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Origen de nuevos clientes</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div className="h-14 w-14 rounded-full bg-prats-navy/10 flex items-center justify-center">
                <UserPlus className="h-6 w-6 text-prats-navy" />
              </div>
              <div>
                <p className="text-3xl font-bold">{data.newClients}</p>
                <p className="text-xs text-muted-foreground">nuevos clientes en el periodo</p>
              </div>
            </div>
            <div className="h-6 rounded-full overflow-hidden flex bg-gray-100 mb-4">
              {Object.entries(sources).map(([key, value]) => (
                <div
                  key={key}
                  className="transition-all"
                  style={{
                    width: `${totalSources > 0 ? (value / totalSources) * 100 : 0}%`,
                    backgroundColor: sourceColors[key],
                  }}
                  title={`${clientSourceLabel(key)}: ${value}`}
                />
              ))}
            </div>
            <div className="space-y-1">
              {Object.entries(sources).map(([key, value]) => {
                const clients = clientsBySource[key] || []
                return (
                  <details key={key} className="group">
                    <summary className="flex items-center justify-between text-sm cursor-pointer select-none list-none py-0.5">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: sourceColors[key] }} />
                        {clientSourceLabel(key)}
                        <span className="text-muted-foreground text-[10px] transition-transform group-open:rotate-90">▸</span>
                      </span>
                      <span className="font-medium">
                        {value} ({totalSources > 0 ? ((value / totalSources) * 100).toFixed(0) : 0}%)
                      </span>
                    </summary>
                    <div className="mt-1 mb-2 ml-5 space-y-1">
                      {clients.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin detalle de clientes.</p>
                      ) : clients.map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{c.name}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            {c.types.length === 0
                              ? <span className="text-muted-foreground">sin compra</span>
                              : c.types.map(t => (
                                  <span key={t} className="px-1.5 py-px rounded text-[10px] text-white" style={{ backgroundColor: PURCHASE_TYPE_META[t]?.color ?? '#6b7280' }}>
                                    {PURCHASE_TYPE_META[t]?.label ?? t}
                                  </span>
                                ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Resumen de clientes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <Users className="h-7 w-7 text-prats-navy shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">Total clientes (BBDD)</p>
                    <p className="text-xl font-bold leading-tight">{data.totalClientsHistorical}</p>
                    <p className="text-[10px] text-muted-foreground">histórico</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50">
                  <UserCheck className="h-7 w-7 text-green-600 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">Con compras</p>
                    <p className="text-xl font-bold">{data.clientsWithPurchases}
                      <span className="text-xs font-normal text-muted-foreground ml-1">{activePct}%</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">en el periodo</p>
                  </div>
                </div>
              </div>

              {top3.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    <h4 className="text-sm font-semibold">Top 3 clientes</h4>
                  </div>
                  <div className="space-y-2">
                    {top3.map((c, i) => (
                      <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${MEDAL_BG[i]}`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold w-5 ${MEDAL_COLORS[i]}`}>{i + 1}</span>
                          <span className="text-sm font-medium">{c.full_name}</span>
                        </div>
                        <span className="text-sm font-bold">{formatCurrency(c.total_revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Fila 2: Por tienda + Nuevos vs antiguos ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ClientsByStoreCard advanced={advanced} />
        <NewVsReturningCard advanced={advanced} />
      </div>

      {/* ── Fila 3: Serie temporal ─────────────────────────────────────── */}
      <ClientsByDayCard advanced={advanced} />

      {/* ── Fila 4: Únicos por día y tienda (toggle "Ver por tienda") ──── */}
      {showByStore && data.dailyUniqueByStore && data.dailyUniqueByStore.length > 0 && (
        <ClientsByDayStoreCard stores={data.dailyUniqueByStore} />
      )}
    </div>
  )
}

function ClientsByDayStoreCard({ stores }: { stores: NonNullable<ClientsData['dailyUniqueByStore']> }) {
  const max = Math.max(1, ...stores.flatMap(s => s.byDay.map(d => d.count)))
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Clientes únicos por día y tienda</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-5">
          {stores.map(s => {
            const total = s.byDay.reduce((a, d) => a + d.count, 0)
            return (
              <div key={s.store_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{s.store_name}</span>
                  <span className="text-muted-foreground text-xs">{total} cliente-día</span>
                </div>
                <div className="flex items-end gap-px" style={{ height: '80px' }}>
                  {s.byDay.map(d => (
                    <div key={d.day} className="flex-1 flex flex-col justify-end h-full" title={`${d.day} · ${d.count} cliente${d.count === 1 ? '' : 's'}`}>
                      <div className="rounded-t-sm" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? '2px' : '0', backgroundColor: '#6366f1', opacity: d.count > 0 ? 1 : 0.15 }} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          Un cliente que compra en ambas tiendas el mismo día cuenta en cada una; la unión diaria reconstruye el total único del periodo.
        </p>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function ClientsByStoreCard({ advanced }: { advanced: ClientsAdvancedAnalytics | null }) {
  if (!advanced) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Clientes por tienda</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground text-center py-6">Cargando…</p></CardContent>
      </Card>
    )
  }
  const rows = advanced.by_store
  const maxCount = Math.max(1, ...rows.map(r => r.clients_count))
  const totalClients = rows.reduce((s, r) => s + r.clients_count, 0)

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Clientes por tienda</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin clientes en el periodo.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => {
              const w = (r.clients_count / maxCount) * 100
              return (
                <div key={r.store_id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{r.store_name}</span>
                    <span className="text-muted-foreground">{r.clients_count}</span>
                  </div>
                  <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                    <div className="bg-prats-navy transition-all" style={{ width: `${w}%` }} title={`${r.store_name}: ${r.clients_count}`} />
                  </div>
                </div>
              )
            })}
            {rows.length > 1 && (
              <div className="pt-3 border-t flex justify-between text-sm font-semibold">
                <span>Total (suma)</span>
                <span>{totalClients}</span>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground -mt-1">
              Un cliente que compra en varias tiendas cuenta en cada una; la suma puede superar el total único del periodo.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NewVsReturningCard({ advanced }: { advanced: ClientsAdvancedAnalytics | null }) {
  if (!advanced) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Repeat className="h-4 w-4" /> Nuevos vs antiguos</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground text-center py-6">Cargando…</p></CardContent>
      </Card>
    )
  }
  const { new_count, returning_count, total } = advanced.new_vs_returning
  const newPct = total > 0 ? Math.round((new_count / total) * 100) : 0
  const retPct = total > 0 ? 100 - newPct : 0

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Repeat className="h-4 w-4" /> Nuevos vs antiguos</CardTitle></CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin clientes en el periodo.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 border border-purple-100">
                <Sparkles className="h-7 w-7 text-purple-600 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Nuevos</p>
                  <p className="text-xl font-bold">{new_count}
                    <span className="text-xs font-normal text-muted-foreground ml-1">{newPct}%</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                <Users className="h-7 w-7 text-blue-600 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Antiguos</p>
                  <p className="text-xl font-bold">{returning_count}
                    <span className="text-xs font-normal text-muted-foreground ml-1">{retPct}%</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden flex bg-gray-100">
              <div className="bg-purple-500 transition-all" style={{ width: `${newPct}%` }} title={`Nuevos: ${new_count}`} />
              <div className="bg-blue-500 transition-all" style={{ width: `${retPct}%` }} title={`Antiguos: ${returning_count}`} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Nuevo = primera compra (sales + sastrería) cae dentro del periodo. Antiguo = ya había comprado antes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ClientsByDayCard({ advanced }: { advanced: ClientsAdvancedAnalytics | null }) {
  if (!advanced) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Clientes únicos por día</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground text-center py-6">Cargando…</p></CardContent>
      </Card>
    )
  }
  const granularity = advanced.granularity
  const buckets = advanced.by_day
  const max = Math.max(1, ...buckets.map(b => b.clients_count))
  const peak = buckets.reduce((best, b) => b.clients_count > best.clients_count ? b : best, buckets[0] ?? { day: '', clients_count: 0 })
  const titleSuffix = GRANULARITY_LABEL[granularity]

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Clientes únicos por {titleSuffix}</CardTitle></CardHeader>
      <CardContent>
        {buckets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin datos para el periodo.</p>
        ) : (
          <>
            <div className="flex items-end gap-px" style={{ height: '192px' }}>
              {buckets.map((b) => {
                const h = (b.clients_count / max) * 100
                const isPeak = b.clients_count === peak.clients_count && b.clients_count > 0
                return (
                  <div key={b.day} className="flex-1 flex flex-col justify-end h-full group relative cursor-pointer">
                    <div
                      className="rounded-t-sm transition-all"
                      style={{
                        height: `${h}%`,
                        minHeight: b.clients_count > 0 ? '2px' : '0',
                        backgroundColor: isPeak ? '#4f46e5' : '#6366f1',
                        opacity: b.clients_count > 0 ? 1 : 0.15,
                      }}
                    />
                    {b.clients_count > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 bg-white border rounded-lg shadow-lg p-2 text-xs w-32 pointer-events-none">
                        <p className="font-medium">{formatBucketDate(b.day, granularity)}</p>
                        <p>{b.clients_count} cliente{b.clients_count === 1 ? '' : 's'}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex mt-1">
              {buckets.map((b, i) => {
                // Mostrar labels cada N buckets para evitar saturar
                const step = Math.max(1, Math.floor(buckets.length / 10))
                const show = i % step === 0 || i === buckets.length - 1
                return (
                  <div key={b.day} className="flex-1 text-center">
                    {show && <span className="text-[9px] text-muted-foreground">{formatBucketDate(b.day, granularity)}</span>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
