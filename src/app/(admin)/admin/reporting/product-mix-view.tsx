'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Download, Loader2, Palette, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { downloadExcel } from '@/lib/excel/export'
import { toast } from 'sonner'
import { getBoutiqueProductMix, type ProductMixReport, type ProductMixRow } from '@/actions/report-product-mix'

// Informe de Productos por TIPOLOGÍA o por COLOR (unidades vendidas en el periodo).
// Siempre usa el periodo y la tienda del filtro superior (a diferencia de la vista
// "Por producto", que por defecto es histórica).

type Props = { mode: 'category' | 'color'; startDate: string; endDate: string; storeId?: string; storeName?: string }

const MULTICOLOR = 'linear-gradient(90deg,#D9C4A0,#3A6EA5,#4A7C59,#B8644A,#D9A0B8,#E3BE4F)'

function Swatch({ hex, code }: { hex: string | null; code: number | null }) {
  if (code == null) return <span className="h-3.5 w-3.5 rounded-sm border border-dashed shrink-0 inline-block" />
  return (
    <span
      className="h-3.5 w-3.5 rounded-sm border shrink-0 inline-block"
      style={hex ? { backgroundColor: hex } : { background: MULTICOLOR }}
    />
  )
}

export function ProductMixView({ mode, startDate, endDate, storeId, storeName }: Props) {
  const [data, setData] = useState<ProductMixReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    setLoading(true)
    getBoutiqueProductMix({ start_date: startDate, end_date: endDate, store_id: storeId }).then((r) => {
      if (!alive) return
      if (r.success) setData(r.data)
      else toast.error(r.error || 'No se pudo cargar el informe')
      setLoading(false)
    })
    return () => { alive = false }
  }, [startDate, endDate, storeId])

  if (loading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const total = data.total.units
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 1000) / 10}%` : '—')
  const showOnline = !storeId
  const groups = mode === 'category'
    ? data.byCategory.map((g) => ({ ...g, children: g.children.map((c) => ({ ...c, code: null as number | null, hex: null as string | null })) }))
    : data.byColor.map((g) => ({ ...g, children: g.colors }))
  const coverage = data.colorCoverage
  const lowCoverage = mode === 'color' && coverage.total > 0 && coverage.with_color / coverage.total < 0.9

  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const exportExcel = async () => {
    const rows: Record<string, unknown>[] = []
    for (const g of groups) {
      for (const c of g.children) {
        rows.push({
          [mode === 'category' ? 'Tipología' : 'Familia']: g.name,
          ...(mode === 'category' ? { 'Categoría': c.name } : { 'Código': c.code ?? '', 'Color': c.name }),
          'Unidades': c.units,
          ...(showOnline ? { 'Tienda': c.units_store, 'Online': c.units_online } : {}),
          'Facturación sin IVA': c.revenue_net,
        })
      }
    }
    await downloadExcel(rows, `productos-por-${mode === 'category' ? 'tipologia' : 'color'}-${startDate}_a_${endDate}`, mode === 'category' ? 'Tipología' : 'Color')
  }

  const childName = (g: ProductMixRow, c: ProductMixRow) =>
    mode === 'category' && c.key === g.key ? `${c.name} (sin subcategoría)` : c.name

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        {mode === 'category' ? <Tags className="h-4 w-4 shrink-0 mt-0.5" /> : <Palette className="h-4 w-4 shrink-0 mt-0.5" />}
        <p>
          Unidades de boutique vendidas entre <strong>{startDate}</strong> y <strong>{endDate}</strong>
          {storeId ? <> en <strong>{storeName}</strong></> : <> (tiendas + online)</>}, <strong>netas de devoluciones</strong>.
          {mode === 'category'
            ? <> Tipología = categoría del producto, agrupada por su categoría principal.</>
            : <> Color = el que tiene la ficha en «Web / Tienda → Color»; la familia es la centena del código.</>}
          {' '}No cuentan tarjetas regalo ni cobros de pedidos de sastrería.
        </p>
      </div>

      {lowCoverage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Solo <strong>{coverage.with_color}</strong> de {coverage.total} productos activos tienen color asignado. Lo vendido
          sin color sale en «Sin color asignado» hasta que se complete el color en cada ficha.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {mode === 'category' ? 'Unidades por tipología' : 'Unidades por color'} · {total} ud{total === 1 ? '' : 's'}.
          </CardTitle>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={groups.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Excel
          </Button>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay ventas de boutique en el periodo.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{mode === 'category' ? 'Tipología' : 'Color'}</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">% uds.</TableHead>
                  {showOnline && <TableHead className="text-right">Tienda</TableHead>}
                  {showOnline && <TableHead className="text-right">Online</TableHead>}
                  <TableHead className="text-right">Facturación sin IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const expandable = g.children.length > 1 || (g.children.length === 1 && g.children[0].key !== g.key)
                  const isOpen = open.has(g.key)
                  return (
                    <Fragment key={g.key}>
                      <TableRow className={expandable ? 'cursor-pointer' : undefined} onClick={expandable ? () => toggle(g.key) : undefined}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {expandable
                              ? (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
                              : <span className="w-3.5" />}
                            {g.name}
                            {expandable && <span className="text-xs text-muted-foreground font-normal">({g.children.length})</span>}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{g.units}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{pct(g.units)}</TableCell>
                        {showOnline && <TableCell className="text-right tabular-nums">{g.units_store}</TableCell>}
                        {showOnline && <TableCell className="text-right tabular-nums">{g.units_online}</TableCell>}
                        <TableCell className="text-right tabular-nums">{formatCurrency(g.revenue_net)}</TableCell>
                      </TableRow>
                      {expandable && isOpen && g.children.map((c) => (
                        <TableRow key={`${g.key}-${c.key}`} className="bg-muted/30">
                          <TableCell className="pl-10 text-sm">
                            <span className="inline-flex items-center gap-2">
                              {mode === 'color' && <Swatch hex={c.hex} code={c.code} />}
                              {mode === 'color' && c.code != null && <span className="tabular-nums text-muted-foreground">{c.code}</span>}
                              {childName(g, c)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{c.units}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{pct(c.units)}</TableCell>
                          {showOnline && <TableCell className="text-right tabular-nums">{c.units_store}</TableCell>}
                          {showOnline && <TableCell className="text-right tabular-nums">{c.units_online}</TableCell>}
                          <TableCell className="text-right tabular-nums">{formatCurrency(c.revenue_net)}</TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{total}</TableCell>
                  <TableCell className="text-right tabular-nums">100%</TableCell>
                  {showOnline && <TableCell className="text-right tabular-nums">{data.total.units_store}</TableCell>}
                  {showOnline && <TableCell className="text-right tabular-nums">{data.total.units_online}</TableCell>}
                  <TableCell className="text-right tabular-nums">{formatCurrency(data.total.revenue_net)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
