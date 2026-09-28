'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Download, Loader2, Scissors, Shirt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadExcelMulti } from '@/lib/excel/export'
import { toast } from 'sonner'
import {
  getTailoringGarmentsReport,
  type TailoringGarmentRow,
  type TailoringGarmentsReport,
} from '@/actions/report-tailoring-garments'

// Informe 7 · Prendas encargadas de sastrería y camisería por tipología,
// artesanal e industrial por separado. Sin boutique.

type Props = { startDate: string; endDate: string; storeId?: string; storeName?: string }

function GarmentTable({ title, icon, rows, emptyText, footerLabel }: {
  title: string
  icon: ReactNode
  rows: TailoringGarmentRow[]
  emptyText: string
  footerLabel?: string
}) {
  const artesanal = rows.reduce((s, r) => s + r.artesanal, 0)
  const industrial = rows.reduce((s, r) => s + r.industrial, 0)
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">{icon} {title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{emptyText}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prenda</TableHead>
                <TableHead className="text-right">Artesanal</TableHead>
                <TableHead className="text-right">Industrial</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.artesanal || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.industrial || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{r.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {footerLabel && (
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell>{footerLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{artesanal}</TableCell>
                  <TableCell className="text-right tabular-nums">{industrial}</TableCell>
                  <TableCell className="text-right tabular-nums">{artesanal + industrial}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function TailoringGarmentsTab({ startDate, endDate, storeId, storeName }: Props) {
  const [data, setData] = useState<TailoringGarmentsReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getTailoringGarmentsReport({ start_date: startDate, end_date: endDate, store_id: storeId }).then((r) => {
      if (!alive) return
      if (r.success) setData(r.data)
      else toast.error(r.error || 'No se pudo cargar el informe de sastrería')
      setLoading(false)
    })
    return () => { alive = false }
  }, [startDate, endDate, storeId])

  if (loading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const { totals } = data
  const exportExcel = async () => {
    const toRows = (rows: TailoringGarmentRow[]) => rows.map((r) => ({ 'Prenda': r.name, 'Artesanal': r.artesanal, 'Industrial': r.industrial, 'Total': r.total }))
    await downloadExcelMulti([
      { name: 'Sastrería', rows: toRows(data.sastreria) },
      { name: 'Camisería', rows: toRows(data.camiseria) },
      { name: 'Conjuntos', rows: toRows(data.sets) },
    ], `prendas-sastreria-${startDate}_a_${endDate}`)
  }

  const kpis = [
    { label: 'Prendas encargadas', value: totals.total, sub: `${data.orders} pedido${data.orders === 1 ? '' : 's'}` },
    { label: 'Sastrería artesanal', value: totals.sastreria.artesanal },
    { label: 'Sastrería industrial', value: totals.sastreria.industrial },
    { label: 'Camisería artesanal', value: totals.camiseria.artesanal },
    { label: 'Camisería industrial', value: totals.camiseria.industrial },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-3xl">
          Prendas encargadas en pedidos de sastrería con fecha de pedido entre <strong>{startDate}</strong> y <strong>{endDate}</strong>
          {storeId ? <> en <strong>{storeName}</strong></> : null}. Cada prenda cuenta una vez (un traje = americana + pantalón).
          No incluye boutique, ni complementos añadidos al pedido, ni pedidos o prendas cancelados.
        </p>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={totals.total === 0}>
          <Download className="h-4 w-4 mr-1" /> Excel
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-bold tabular-nums">{k.value}</p>
              {k.sub && <p className="text-[11px] text-muted-foreground">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GarmentTable
          title="Sastrería · prendas"
          icon={<Scissors className="h-4 w-4" />}
          rows={data.sastreria}
          emptyText="Sin prendas de sastrería en el periodo."
          footerLabel="Total sastrería"
        />
        <div className="space-y-6">
          <GarmentTable
            title="Camisería · prendas"
            icon={<Shirt className="h-4 w-4" />}
            rows={data.camiseria}
            emptyText="Sin camisería en el periodo."
            footerLabel="Total camisería"
          />
          <GarmentTable
            title="Conjuntos (trajes, chaqués, smokings…)"
            icon={<Scissors className="h-4 w-4" />}
            rows={data.sets}
            emptyText="Sin conjuntos en el periodo."
          />
          <p className="text-[11px] text-muted-foreground -mt-4">
            Un conjunto cuenta 1: sus piezas ya están en «Sastrería · prendas». Se reconocen por la ficha
            («Americana — Traje 1»).
            {data.unlabeledSastreria > 0 && (
              <> {data.unlabeledSastreria} prenda{data.unlabeledSastreria === 1 ? '' : 's'} de sastrería son de pedidos
              antiguos sin esa marca y no se pueden agrupar en conjuntos.</>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
