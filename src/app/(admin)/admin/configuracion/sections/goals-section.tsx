'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Target, Save, Loader2, ShoppingBag, Scissors, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { getStoreGoalsForMonth, upsertStoreGoalAction, type StoreGoalsRow, type GoalType } from '@/actions/store-goals'
import { formatCurrency } from '@/lib/utils'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

type Draft = { boutique: string; sastreria: string; online: string }

export function GoalsSection() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<StoreGoalsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getStoreGoalsForMonth(year, month)
    if (res.error) {
      toast.error(res.error)
      setRows([])
    } else {
      setRows(res.data ?? [])
      const d: Record<string, Draft> = {}
      for (const r of res.data ?? []) {
        d[r.store_id] = {
          boutique: r.boutique_target > 0 ? String(r.boutique_target) : '',
          sastreria: r.sastreria_target > 0 ? String(r.sastreria_target) : '',
          online: r.online_target > 0 ? String(r.online_target) : '',
        }
      }
      setDrafts(d)
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const saveOne = async (storeId: string, goalType: GoalType) => {
    const key = `${storeId}:${goalType}`
    const value = drafts[storeId]?.[goalType] ?? ''
    const amount = value.trim() === '' ? 0 : Number(value)
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Importe inválido')
      return
    }
    setSavingKey(key)
    const res = await upsertStoreGoalAction({
      store_id: storeId,
      year,
      month,
      goal_type: goalType,
      target_amount: amount,
    })
    setSavingKey(null)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success('Objetivo guardado')
      setRows(prev => prev.map(r => {
        if (r.store_id !== storeId) return r
        if (goalType === 'boutique') return { ...r, boutique_target: amount }
        if (goalType === 'sastreria') return { ...r, sastreria_target: amount }
        return { ...r, online_target: amount }
      }))
    }
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  // Resumen agregado (se muestra siempre que hay algún objetivo o alguna venta).
  const summary = useMemo(() => {
    const t = { boutique: 0, sastreria: 0, online: 0 }
    const a = { boutique: 0, sastreria: 0, online: 0 }
    for (const r of rows) {
      t.boutique += r.boutique_target
      t.sastreria += r.sastreria_target
      t.online += r.online_target
      a.boutique += r.boutique_actual
      a.sastreria += r.sastreria_actual
      a.online += r.online_actual
    }
    const total = { target: t.boutique + t.sastreria + t.online, actual: a.boutique + a.sastreria + a.online }
    return { t, a, total }
  }, [rows])

  const isPastMonth = useMemo(() => {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    return year < y || (year === y && month < m)
  }, [year, month, now])

  const hasAnyData = summary.total.target > 0 || summary.total.actual > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-prats-navy" />
          <h3 className="text-lg font-semibold">Objetivos mensuales por tienda</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Mes</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((n, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Año</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Define el objetivo de facturación para cada tienda en {MONTH_NAMES[month - 1]} {year}. Cada tienda física tiene objetivo de <strong>Boutique</strong> (venta directa) y <strong>Sastrería</strong> (depósitos, entregas y arreglos). <strong>Hermanos Pinzón</strong> añade además el objetivo de <strong>Tienda Online</strong>, que agrega todas las ventas de la web. Todos los importes (objetivo y actual) son <strong>sin IVA</strong> (base imponible).
      </p>

      {/* Panel resumen mes */}
      {!loading && hasAnyData && (
        <SummaryPanel
          monthLabel={`${MONTH_NAMES[month - 1]} ${year}`}
          isPastMonth={isPastMonth}
          targets={summary.t}
          actuals={summary.a}
          total={summary.total}
        />
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No hay tiendas activas</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(row => {
            const draft = drafts[row.store_id] ?? { boutique: '', sastreria: '', online: '' }
            const setField = (field: keyof Draft, v: string) => {
              setDrafts(prev => ({ ...prev, [row.store_id]: { ...draft, [field]: v } }))
            }
            return (
              <Card key={row.store_id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {row.store_name}
                    <span className="text-xs font-normal text-muted-foreground">{row.store_code}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <GoalInput
                    icon={<ShoppingBag className="h-3.5 w-3.5" />}
                    label="Boutique"
                    helper="Venta directa en tienda"
                    value={draft.boutique}
                    target={row.boutique_target}
                    actual={row.boutique_actual}
                    onChange={v => setField('boutique', v)}
                    onSave={() => saveOne(row.store_id, 'boutique')}
                    saving={savingKey === `${row.store_id}:boutique`}
                  />
                  <GoalInput
                    icon={<Scissors className="h-3.5 w-3.5" />}
                    label="Sastrería"
                    helper="Depósitos, entregas y arreglos"
                    value={draft.sastreria}
                    target={row.sastreria_target}
                    actual={row.sastreria_actual}
                    onChange={v => setField('sastreria', v)}
                    onSave={() => saveOne(row.store_id, 'sastreria')}
                    saving={savingKey === `${row.store_id}:sastreria`}
                  />
                  {row.hosts_online && (
                    <GoalInput
                      icon={<Globe className="h-3.5 w-3.5" />}
                      label="Tienda Online"
                      helper="Todas las ventas de la web"
                      value={draft.online}
                      target={row.online_target}
                      actual={row.online_actual}
                      onChange={v => setField('online', v)}
                      onSave={() => saveOne(row.store_id, 'online')}
                      saving={savingKey === `${row.store_id}:online`}
                    />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryPanel({
  monthLabel, isPastMonth, targets, actuals, total,
}: {
  monthLabel: string
  isPastMonth: boolean
  targets: { boutique: number; sastreria: number; online: number }
  actuals: { boutique: number; sastreria: number; online: number }
  total: { target: number; actual: number }
}) {
  const globalPct = total.target > 0 ? Math.round((total.actual / total.target) * 100) : null
  const status = globalPct === null
    ? null
    : globalPct >= 100
      ? { label: 'Objetivo alcanzado', cls: 'text-green-600' }
      : isPastMonth
        ? { label: 'Objetivo no alcanzado', cls: 'text-amber-600' }
        : { label: 'En progreso', cls: 'text-muted-foreground' }

  return (
    <Card className="border-prats-navy/20 bg-prats-navy/[0.03]">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h4 className="text-sm font-semibold">Resumen · {monthLabel}</h4>
            <p className="text-xs text-muted-foreground">
              {isPastMonth ? 'Mes cerrado — balance final.' : 'Evolución en curso.'} Suma de todas las tiendas · importes sin IVA.
            </p>
          </div>
          {globalPct !== null && (
            <div className="text-right">
              <div className={`text-lg font-bold tabular-nums ${status?.cls ?? ''}`}>{globalPct}%</div>
              {status && <div className={`text-[11px] ${status.cls}`}>{status.label}</div>}
            </div>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryRow label="Boutique" actual={actuals.boutique} target={targets.boutique} color="bg-prats-navy" />
          <SummaryRow label="Sastrería" actual={actuals.sastreria} target={targets.sastreria} color="bg-amber-600" />
          <SummaryRow label="Tienda Online" actual={actuals.online} target={targets.online} color="bg-emerald-600" />
        </div>
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-sm">
          <span className="font-medium">Total</span>
          <span className="tabular-nums">
            <span className="font-semibold">{formatCurrency(total.actual)}</span>
            {total.target > 0 && <span className="text-muted-foreground"> / {formatCurrency(total.target)}</span>}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryRow({
  label, actual, target, color,
}: {
  label: string
  actual: number
  target: number
  color: string
}) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0
  const pctRaw = target > 0 ? (actual / target) * 100 : 0
  const reached = pctRaw >= 100
  const over = pctRaw > 100
  const barColor = over ? 'bg-green-600' : color
  const diff = actual - target
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className={`font-semibold ${reached ? 'text-green-600' : 'text-foreground'}`}>
            {formatCurrency(actual)}
          </span>
          {target > 0 && <> / {formatCurrency(target)}</>}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        {target > 0 && (
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className="text-[10px] text-muted-foreground flex items-center justify-between">
        {target > 0 ? (
          <>
            <span className={reached ? 'text-green-600 font-semibold' : ''}>{pctRaw.toFixed(0)}% del objetivo</span>
            {diff < 0 && <span>Faltan {formatCurrency(-diff)}</span>}
            {over && <span className="text-green-600">+{formatCurrency(diff)}</span>}
          </>
        ) : (
          <span>Sin objetivo</span>
        )}
      </div>
    </div>
  )
}

function GoalInput({
  icon, label, helper, value, target, actual, onChange, onSave, saving,
}: {
  icon?: React.ReactNode
  label: string
  helper: string
  value: string
  target: number
  actual: number
  onChange: (v: string) => void
  onSave: () => void
  saving: boolean
}) {
  const parsed = value.trim() === '' ? 0 : Number(value)
  const dirty = Number.isFinite(parsed) && parsed !== target
  const pct = target > 0 ? Math.round((actual / target) * 100) : null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium flex items-center gap-1.5">
            {icon}{label}
          </Label>
          <p className="text-[11px] text-muted-foreground">{helper}</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          Actual: {formatCurrency(actual)}{pct !== null ? ` (${pct}%)` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="0.00"
            className="pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€ sin IVA</span>
        </div>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !dirty}
          className="bg-prats-navy hover:bg-prats-navy-light gap-1"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
