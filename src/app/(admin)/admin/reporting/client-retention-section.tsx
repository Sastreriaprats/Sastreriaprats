'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Loader2, Repeat, Sparkles, TrendingUp, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, normalizeSearchTerm } from '@/lib/utils'
import { downloadExcelMulti } from '@/lib/excel/export'
import { toast } from 'sonner'
import {
  getClientRetentionReport,
  type ClientRetentionReport,
  type RetentionChannel,
  type RetentionStatus,
} from '@/actions/report-client-retention'

// Clientes NUEVOS y REINCIDENTES del periodo + frecuencia de compra por cliente.
// Criterios en src/lib/reports/client-retention.ts.

type Props = { startDate: string; endDate: string; storeId?: string; storeName?: string }

const STATUS_META: Record<RetentionStatus, { label: string; className: string }> = {
  nuevo: { label: 'Nuevo', className: 'bg-purple-100 text-purple-800' },
  nuevo_repite: { label: 'Nuevo · ya repite', className: 'bg-indigo-100 text-indigo-800' },
  reincidente: { label: 'Reincidente', className: 'bg-blue-100 text-blue-800' },
}
const CHANNEL_LABEL: Record<RetentionChannel, string> = { boutique: 'Boutique', sastreria: 'Sastrería', online: 'Online' }
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym.slice(5, 7)} ${ym.slice(0, 4)}`
const PAGE = 50

export function ClientRetentionSection({ startDate, endDate, storeId, storeName }: Props) {
  const [data, setData] = useState<ClientRetentionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'nuevos' | 'reincidentes'>('all')
  const [visible, setVisible] = useState(PAGE)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getClientRetentionReport({ start_date: startDate, end_date: endDate, store_id: storeId }).then((r) => {
      if (!alive) return
      if (r.success) setData(r.data)
      else toast.error(r.error || 'No se pudo cargar el informe de clientes')
      setLoading(false)
    })
    return () => { alive = false }
  }, [startDate, endDate, storeId])

  const filtered = useMemo(() => {
    if (!data) return []
    const tokens = normalizeSearchTerm(search).split(/\s+/).filter(Boolean)
    return data.clients.filter((c) => {
      if (statusFilter === 'nuevos' && c.status === 'reincidente') return false
      if (statusFilter === 'reincidentes' && c.status !== 'reincidente') return false
      const name = normalizeSearchTerm(c.name)
      return tokens.every((t) => name.includes(t))
    })
  }, [data, search, statusFilter])

  useEffect(() => { setVisible(PAGE) }, [search, statusFilter, data])

  if (loading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const { totals } = data
  const pctOf = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')
  const maxMonth = Math.max(1, ...data.monthly.map((m) => m.buyers))

  const exportExcel = async () => {
    await downloadExcelMulti([
      {
        name: 'Clientes',
        rows: data.clients.map((c) => ({
          'Cliente': c.name,
          'Tipo': STATUS_META[c.status].label,
          'Base anterior': c.legacy ? 'Sí' : 'No',
          'Compras en el periodo': c.purchases_period,
          'Compras en total': c.purchases_total,
          'Primera compra': c.first_purchase,
          'Última compra': c.last_purchase,
          'Días entre compras (media)': c.avg_days_between ?? '',
          'Canales': c.channels.map((ch) => CHANNEL_LABEL[ch]).join(', '),
        })),
      },
      {
        name: 'Evolución mensual',
        rows: data.monthly.map((m) => ({
          'Mes': m.month,
          'Clientes con compra': m.buyers,
          'Nuevos': m.new_clients,
          'Reincidentes': m.returning,
        })),
      },
    ], `clientes-nuevos-reincidentes-${startDate}_a_${endDate}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Repeat className="h-4 w-4" /> Clientes nuevos y reincidentes</h3>
          <p className="text-xs text-muted-foreground max-w-3xl mt-1">
            Clientes con alguna compra entre <strong>{startDate}</strong> y <strong>{endDate}</strong>
            {storeId ? <> en <strong>{storeName}</strong></> : null}. Una compra es un día con ticket de boutique, pedido de
            sastrería o pedido online. <strong>Nuevo</strong>: su primera compra cae en el periodo. <strong>Reincidente</strong>: ya
            había comprado antes (desde su segunda compra). Los clientes de la base anterior a la plataforma cuentan como ya clientes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={totals.buyers === 0}>
          <Download className="h-4 w-4 mr-1" /> Excel
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Clientes con compra</p>
            <p className="text-2xl font-bold tabular-nums">{totals.buyers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Nuevos</p>
            <p className="text-2xl font-bold tabular-nums">{totals.new_clients}
              <span className="text-xs font-normal text-muted-foreground ml-1">{pctOf(totals.new_clients, totals.buyers)}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{totals.new_repeated} ya han repetido ({pctOf(totals.new_repeated, totals.new_clients)})</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Repeat className="h-3.5 w-3.5" /> Reincidentes</p>
            <p className="text-2xl font-bold tabular-nums">{totals.returning}
              <span className="text-xs font-normal text-muted-foreground ml-1">{pctOf(totals.returning, totals.buyers)}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{totals.returning_legacy} de la base anterior</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Frecuencia</p>
            <p className="text-2xl font-bold tabular-nums">{data.avg_purchases_per_buyer.toLocaleString('es-ES')}
              <span className="text-xs font-normal text-muted-foreground ml-1">compras/cliente</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {data.median_days_between != null ? `Vuelven cada ${data.median_days_between} días (mediana)` : 'Aún sin clientes que repitan'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Evolución mes a mes</CardTitle></CardHeader>
          <CardContent>
            {data.monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin compras en el periodo.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="w-[40%]" />
                    <TableHead className="text-right">Con compra</TableHead>
                    <TableHead className="text-right">Nuevos</TableHead>
                    <TableHead className="text-right">Reincidentes</TableHead>
                    <TableHead className="text-right">% reincid.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthly.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="capitalize">{monthLabel(m.month)}</TableCell>
                      <TableCell>
                        <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-100" style={{ width: `${(m.buyers / maxMonth) * 100}%` }}>
                          <div className="bg-purple-500" style={{ width: `${(m.new_clients / Math.max(1, m.buyers)) * 100}%` }} title={`Nuevos: ${m.new_clients}`} />
                          <div className="bg-blue-500 flex-1" title={`Reincidentes: ${m.returning}`} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{m.buyers}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.new_clients}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.returning}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{pctOf(m.returning, m.buyers)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">
              <span className="inline-block h-2 w-2 rounded-full bg-purple-500 mr-1" />Nuevos en ese mes
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500 ml-3 mr-1" />Reincidentes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Compras por cliente en el periodo</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.distribution.map((d) => (
              <div key={d.label} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 text-muted-foreground">{d.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-prats-navy" style={{ width: `${totals.buyers ? (d.clients / totals.buyers) * 100 : 0}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums font-medium">{d.clients}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Frecuencia de compra por cliente</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border p-0.5">
              {([['all', 'Todos'], ['nuevos', 'Nuevos'], ['reincidentes', 'Reincidentes']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStatusFilter(v)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${statusFilter === v ? 'bg-prats-navy text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-48" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Ningún cliente con esos filtros.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">En el periodo</TableHead>
                    <TableHead className="text-right">En total</TableHead>
                    <TableHead>Primera compra</TableHead>
                    <TableHead>Última compra</TableHead>
                    <TableHead className="text-right">Cada (días)</TableHead>
                    <TableHead>Canales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, visible).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link href={`/admin/clientes/${c.id}`} className="hover:underline">{c.name}</Link>
                        {c.legacy && <span className="block text-[10px] text-muted-foreground">Base anterior</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_META[c.status].className}`}>
                          {STATUS_META[c.status].label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{c.purchases_period}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.purchases_total}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(c.first_purchase)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(c.last_purchase)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.avg_days_between ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.channels.map((ch) => CHANNEL_LABEL[ch]).join(' · ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>{Math.min(visible, filtered.length)} de {filtered.length} clientes</span>
                {visible < filtered.length && (
                  <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE)}>Ver más</Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                «En total» y «Cada (días)» usan todo el historial del cliente en la plataforma, también fuera del periodo.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
