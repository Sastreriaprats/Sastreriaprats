'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Store, Scissors, Globe, TrendingDown, Wallet, Info, ChevronDown, ChevronUp, Tags } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { useExpenseCategories } from '@/hooks/use-cached-queries'
import { setSupplierInvoiceExpenseCategory } from '@/actions/expense-categories'
import type {
  PartnersReport, PartnerChannel, PartnerMonth, PartnerExpenseCategoryRow, PartnerExpenseInvoice,
} from '@/actions/partners-report'

/**
 * Informe para socios: ventas reales del mes por tienda y canal, con lo cobrado
 * y lo pendiente; los cobros que son de otro mes; los gastos; y el beneficio.
 * Petición de Mónica (22-sep-2026).
 */

const CHANNEL_LABELS: Record<PartnerChannel, string> = {
  boutique: 'Boutique',
  sastreria: 'Sastrería',
  online: 'Online',
}

const CHANNEL_ICONS: Record<PartnerChannel, React.ComponentType<{ className?: string }>> = {
  boutique: Store,
  sastreria: Scissors,
  online: Globe,
}

const CHANNEL_CLASSES: Record<PartnerChannel, string> = {
  boutique: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  sastreria: 'bg-amber-50 text-amber-800 border-amber-200',
  online: 'bg-sky-50 text-sky-800 border-sky-200',
}

function monthLabelFromKey(key: string): string {
  const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const [y, m] = key.split('-')
  return `${names[Number(m) - 1] ?? m} ${y}`
}

const NO_CATEGORY = '__none__'

function ExpensesByCategoryTable({ rows, total, count }: {
  rows: PartnerExpenseCategoryRow[]
  total: number
  count: number
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Categoría</TableHead>
            <TableHead className="text-center">Facturas</TableHead>
            <TableHead className="text-right">Importe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.code ?? NO_CATEGORY}>
              <TableCell className={`text-sm ${r.code === null ? 'italic text-amber-700' : ''}`}>{r.name}</TableCell>
              <TableCell className="text-center tabular-nums text-sm">{r.count}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total gastos</TableCell>
            <TableCell className="text-center tabular-nums">{count}</TableCell>
            <TableCell className="text-right tabular-nums font-bold text-red-600">{formatCurrency(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

/**
 * Facturas de proveedor del mes, con su categoría de gasto editable (mig 295).
 * Al elegir una, el aviso ofrece aplicarla a todas las del proveedor que aún
 * no tienen categoría y a las que entren a partir de ahora.
 */
function ExpenseInvoicesTable({ invoices, onChanged }: {
  invoices: PartnerExpenseInvoice[]
  onChanged?: () => void
}) {
  const { can } = usePermissions()
  const canEdit = can('supplier_invoices.manage')
  const categories = useExpenseCategories()
  const [onlyUncategorized, setOnlyUncategorized] = useState(false)
  // Cambio optimista mientras se recarga el informe.
  const [overrides, setOverrides] = useState<Record<string, string | null>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const categoryOf = (inv: PartnerExpenseInvoice) => (inv.id in overrides ? overrides[inv.id] : inv.category)
  const visible = onlyUncategorized ? invoices.filter((inv) => !categoryOf(inv)) : invoices

  const applyToSupplier = async (inv: PartnerExpenseInvoice, code: string) => {
    const res = await setSupplierInvoiceExpenseCategory({ invoice_id: inv.id, category: code, apply_to_supplier: true })
    if (!res.success) { toast.error(res.error); return }
    toast.success(`«${categories.labelOf(code)}» puesta en ${res.data.updated} factura(s) de ${inv.supplier_name}. Las nuevas la tendrán ya puesta.`)
    onChanged?.()
  }

  const handleChange = async (inv: PartnerExpenseInvoice, value: string) => {
    const code = value === NO_CATEGORY ? null : value
    setOverrides((o) => ({ ...o, [inv.id]: code }))
    setSavingId(inv.id)
    const res = await setSupplierInvoiceExpenseCategory({ invoice_id: inv.id, category: code })
    setSavingId(null)
    if (!res.success) {
      setOverrides((o) => { const n = { ...o }; delete n[inv.id]; return n })
      toast.error(res.error)
      return
    }
    if (code && inv.supplier_id) {
      toast.success(`Factura ${inv.invoice_number}: ${categories.labelOf(code)}`, {
        description: `¿Poner la misma en todas las de ${inv.supplier_name} que no tienen categoría, y en las nuevas?`,
        duration: 10000,
        action: { label: 'Aplicar a todas', onClick: () => { void applyToSupplier(inv, code) } },
      })
    } else {
      toast.success(`Factura ${inv.invoice_number}: ${categories.labelOf(code)}`)
    }
    onChanged?.()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Switch checked={onlyUncategorized} onCheckedChange={setOnlyUncategorized} aria-label="Solo las que no tienen categoría" />
        <span className="text-sm">Solo las que no tienen categoría</span>
      </div>
      <div className="rounded-lg border max-h-[520px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Nº factura</TableHead>
              <TableHead>Tienda</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="w-60">Categoría</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                  Todas las facturas del mes tienen categoría.
                </TableCell>
              </TableRow>
            ) : visible.map((inv) => {
              const current = categoryOf(inv)
              // Una categoría desactivada que la factura aún conserva se sigue mostrando.
              const options = current && !categories.active.some((c) => c.code === current)
                ? [...categories.active, { code: current, name: categories.labelOf(current), sort_order: 999, is_active: false }]
                : categories.active
              return (
                <TableRow key={inv.id}>
                  <TableCell className="text-sm tabular-nums whitespace-nowrap">{inv.invoice_date.split('-').reverse().join('/')}</TableCell>
                  <TableCell className="text-sm">{inv.supplier_name}</TableCell>
                  <TableCell className="text-sm font-mono">{inv.invoice_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{inv.store_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(inv.amount)}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Select
                        value={current ?? NO_CATEGORY}
                        onValueChange={(v) => { void handleChange(inv, v) }}
                        disabled={savingId === inv.id}
                      >
                        <SelectTrigger className={`h-8 text-xs ${current ? '' : 'text-amber-700 border-amber-300'}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_CATEGORY} className="text-xs italic">Sin categoría</SelectItem>
                          {options.map((c) => (
                            <SelectItem key={c.code} value={c.code} className="text-xs">{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`text-sm ${current ? '' : 'italic text-amber-700'}`}>{categories.labelOf(current)}</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function MonthBlock({ month, onChanged }: { month: PartnerMonth; onChanged?: () => void }) {
  const [showInvoices, setShowInvoices] = useState(false)
  const uncategorized = month.expenses.invoices.filter((i) => !i.category).length
  const hasActivity =
    month.rows.length > 0 ||
    month.other_months.rows.length > 0 ||
    month.expenses.total !== 0 ||
    month.reservation_advances.total !== 0 ||
    month.gift_cards.total !== 0

  if (!hasActivity) return null

  const byChannel = (['boutique', 'sastreria', 'online'] as PartnerChannel[]).map((c) => {
    const rows = month.rows.filter((r) => r.channel === c)
    return {
      channel: c,
      sales: rows.reduce((a, r) => a + r.sales, 0),
      collected: rows.reduce((a, r) => a + r.collected, 0),
      pending: rows.reduce((a, r) => a + r.pending, 0),
    }
  }).filter((c) => c.sales !== 0)

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold capitalize">{month.label}</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Beneficio</span>
          <span className={`text-xl font-bold tabular-nums ${month.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {formatCurrency(month.profit)}
          </span>
        </div>
      </div>

      {/* Cifras del mes */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Ventas del mes</p>
          <p className="text-xl font-bold tabular-nums">{formatCurrency(month.totals.sales)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Cobradas</p>
          <p className="text-xl font-bold tabular-nums text-emerald-700">{formatCurrency(month.totals.collected)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Sin cobrar</p>
          <p className="text-xl font-bold tabular-nums text-red-600">{formatCurrency(month.totals.pending)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Gastos del mes</p>
          <p className="text-xl font-bold tabular-nums text-red-600">{formatCurrency(month.expenses.total)}</p>
          <p className="text-[11px] text-muted-foreground">{month.expenses.count} facturas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Dinero entrado</p>
          <p className="text-xl font-bold tabular-nums">{formatCurrency(month.cash_in)}</p>
          <p className="text-[11px] text-muted-foreground">cobros reales del mes</p>
        </CardContent></Card>
      </div>

      {/* Ventas por tienda y canal */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tienda</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead className="text-center">Nº</TableHead>
              <TableHead className="text-right">Venta del mes</TableHead>
              <TableHead className="text-right">Cobrado</TableHead>
              <TableHead className="text-right">Sin cobrar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {month.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">Sin ventas en el mes</TableCell>
              </TableRow>
            ) : month.rows.map((r) => {
              const Icon = CHANNEL_ICONS[r.channel]
              return (
                <TableRow key={`${r.store_id}-${r.channel}`}>
                  <TableCell className="text-sm">{r.channel === 'online' ? 'Tienda online' : r.store_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${CHANNEL_CLASSES[r.channel]}`}>
                      <Icon className="h-3 w-3 mr-1" />{CHANNEL_LABELS[r.channel]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm">{r.count}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(r.sales)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{formatCurrency(r.collected)}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">
                    {r.pending > 0.005 ? formatCurrency(r.pending) : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          {byChannel.length > 0 && (
            <TableFooter>
              {byChannel.map((c) => (
                <TableRow key={c.channel}>
                  <TableCell colSpan={2} className="text-sm font-medium">Total {CHANNEL_LABELS[c.channel]}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(c.sales)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.collected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.pending > 0.005 ? formatCurrency(c.pending) : '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">Ventas del mes</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums font-bold">{formatCurrency(month.totals.sales)}</TableCell>
                <TableCell className="text-right tabular-nums font-bold text-emerald-700">{formatCurrency(month.totals.collected)}</TableCell>
                <TableCell className="text-right tabular-nums font-bold text-red-600">{formatCurrency(month.totals.pending)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {/* Cobros de otros meses */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          Cobrado este mes de ventas de otros meses
          <span className="text-xs font-normal text-muted-foreground">(no suma a las ventas del mes)</span>
        </h4>
        {month.other_months.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ha entrado dinero de ventas de otros meses.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes de la venta</TableHead>
                  <TableHead>Tienda</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-right">Cobrado ahora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {month.other_months.rows.map((r, i) => (
                  <TableRow key={`${r.store_id}-${r.channel}-${r.origin_month}-${i}`}>
                    <TableCell className="text-sm capitalize">{monthLabelFromKey(r.origin_month)}</TableCell>
                    <TableCell className="text-sm">{r.store_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${CHANNEL_CLASSES[r.channel]}`}>{CHANNEL_LABELS[r.channel]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-semibold">Total de otros meses</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{formatCurrency(month.other_months.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
        {month.reservation_advances.total > 0 && (
          <p className="text-xs text-muted-foreground">
            Además han entrado <strong>{formatCurrency(month.reservation_advances.total)}</strong> en señales de
            reserva ({month.reservation_advances.count} cobros). Son anticipos: cuentan como venta el mes en que
            el cliente se lleva el género.
          </p>
        )}
        {month.gift_cards.total > 0 && (
          <p className="text-xs text-muted-foreground">
            Y <strong>{formatCurrency(month.gift_cards.total)}</strong> en tarjetas regalo vendidas
            ({month.gift_cards.count}). También es dinero a cuenta: la venta se cuenta cuando el cliente
            canjea la tarjeta.
          </p>
        )}
      </div>

      {/* Gastos */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingDown className="h-4 w-4 text-red-500" /> Gastos del mes
        </h4>
        {month.expenses.total === 0 ? (
          <p className="text-sm text-muted-foreground">Sin facturas de proveedor con fecha de este mes.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <ExpensesByCategoryTable
              rows={month.expenses.by_category}
              total={month.expenses.total}
              count={month.expenses.count}
            />
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tienda</TableHead>
                    <TableHead className="text-center">Facturas</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {month.expenses.rows.map((r) => (
                    <TableRow key={r.store_id}>
                      <TableCell className="text-sm">{r.store_name}</TableCell>
                      <TableCell className="text-center tabular-nums text-sm">{r.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Total gastos</TableCell>
                    <TableCell className="text-center tabular-nums">{month.expenses.count}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold text-red-600">{formatCurrency(month.expenses.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor (10 mayores)</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {month.expenses.by_supplier.slice(0, 10).map((s) => (
                    <TableRow key={s.supplier}>
                      <TableCell className="text-sm">{s.supplier}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(s.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        {month.expenses.invoices.length > 0 && (
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowInvoices((v) => !v)}>
              <Tags className="h-4 w-4" />
              {showInvoices ? 'Ocultar las facturas' : `Ver las ${month.expenses.invoices.length} facturas`}
              {uncategorized > 0 && (
                <Badge variant="outline" className="ml-1 text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                  {uncategorized} sin categoría
                </Badge>
              )}
              {showInvoices ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {showInvoices && <ExpenseInvoicesTable invoices={month.expenses.invoices} onChanged={onChanged} />}
          </div>
        )}
      </div>

      {/* Beneficio */}
      <div className="rounded-lg border bg-slate-50 p-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          Ventas del mes {formatCurrency(month.totals.sales)} − gastos {formatCurrency(month.expenses.total)}
        </span>
        <span className={`text-2xl font-bold tabular-nums ${month.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {formatCurrency(month.profit)}
        </span>
      </div>
    </div>
  )
}

export function PartnersTab({ data, onChanged }: { data: PartnersReport | null; onChanged?: () => void }) {
  if (!data) return <p className="text-center text-muted-foreground py-12">Sin datos para el periodo seleccionado</p>

  const visibleMonths = data.months.filter((m) =>
    m.rows.length > 0 || m.other_months.rows.length > 0 || m.expenses.total !== 0
    || m.reservation_advances.total !== 0 || m.gift_cards.total !== 0)

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p>
            <strong>Venta del mes</strong> = lo vendido con fecha de ese mes, esté cobrado o no: tickets de TPV,
            pedidos de sastrería por su importe completo y pedidos de la web pagados. Debajo se separa lo cobrado
            de lo pendiente.
          </p>
          <p>
            <strong>Cobros de otros meses</strong> van en su propio bloque y no suman a la venta del mes: esa venta
            ya se contó en su mes. Las señales de reserva son anticipos y tampoco son venta todavía.
          </p>
          <p>
            <strong>Gastos</strong> = facturas de proveedor con fecha del mes ({data.tax_mode === 'without_tax' ? 'base imponible, sin IVA' : 'con IVA'}).
            No incluyen nóminas, alquileres ni ningún gasto que no entre en la plataforma como factura de proveedor,
            así que el beneficio es el margen de explotación, no el resultado contable. En cada mes, «Ver las
            facturas» permite ponerle a cada una su categoría de gasto.
          </p>
        </div>
      </div>

      {/* Totales del periodo completo */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-sm text-muted-foreground">Ventas del periodo</p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(data.totals.sales)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCurrency(data.totals.collected)} cobrado · {formatCurrency(data.totals.pending)} pendiente
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-sm text-muted-foreground">Cobrado de otros meses</p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(data.totals.other_months)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            + {formatCurrency(data.totals.reservation_advances)} en señales
            {data.totals.gift_cards > 0 ? ` · + ${formatCurrency(data.totals.gift_cards)} en tarjetas regalo` : ''}
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Gastos del periodo</p>
            <Wallet className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-red-600">{formatCurrency(data.totals.expenses)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-sm text-muted-foreground">Beneficio</p>
          <p className={`text-3xl font-bold tabular-nums ${data.totals.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {formatCurrency(data.totals.profit)}
          </p>
        </CardContent></Card>
      </div>

      {visibleMonths.length > 1 && data.expenses_by_category.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Tags className="h-4 w-4 text-muted-foreground" /> Gastos del periodo por categoría
          </h4>
          <div className="max-w-xl">
            <ExpensesByCategoryTable
              rows={data.expenses_by_category}
              total={data.totals.expenses}
              count={data.expenses_by_category.reduce((a, r) => a + r.count, 0)}
            />
          </div>
        </div>
      )}

      {visibleMonths.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Sin movimientos en el periodo seleccionado</p>
      ) : (
        visibleMonths.map((m) => <MonthBlock key={m.key} month={m} onChanged={onChanged} />)
      )}
    </div>
  )
}
