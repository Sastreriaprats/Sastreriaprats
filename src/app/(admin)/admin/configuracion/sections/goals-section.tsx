'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Target, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getStoreGoalsForMonth, upsertStoreGoalAction, type StoreGoalsRow, type GoalType } from '@/actions/store-goals'
import { formatCurrency } from '@/lib/utils'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function GoalsSection() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<StoreGoalsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, { boutique: string; sastreria: string }>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getStoreGoalsForMonth(year, month)
    if (res.error) {
      toast.error(res.error)
      setRows([])
    } else {
      setRows(res.data ?? [])
      const d: Record<string, { boutique: string; sastreria: string }> = {}
      for (const r of res.data ?? []) {
        d[r.store_id] = {
          boutique: r.boutique_target > 0 ? String(r.boutique_target) : '',
          sastreria: r.sastreria_target > 0 ? String(r.sastreria_target) : '',
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
      setRows(prev => prev.map(r => r.store_id === storeId
        ? { ...r, [goalType === 'boutique' ? 'boutique_target' : 'sastreria_target']: amount }
        : r))
    }
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

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
        Define el objetivo de facturación para cada tienda en {MONTH_NAMES[month - 1]} {year}. Cada tienda tiene un objetivo para <strong>Boutique</strong> (incluye venta online) y otro para <strong>Sastrería</strong> (depósitos, entregas y arreglos).
      </p>

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
            const draft = drafts[row.store_id] ?? { boutique: '', sastreria: '' }
            const setField = (field: 'boutique' | 'sastreria', v: string) => {
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
                    label="Boutique"
                    helper="Venta directa + online"
                    value={draft.boutique}
                    target={row.boutique_target}
                    actual={row.boutique_actual}
                    onChange={v => setField('boutique', v)}
                    onSave={() => saveOne(row.store_id, 'boutique')}
                    saving={savingKey === `${row.store_id}:boutique`}
                  />
                  <GoalInput
                    label="Sastrería"
                    helper="Depósitos, entregas y arreglos"
                    value={draft.sastreria}
                    target={row.sastreria_target}
                    actual={row.sastreria_actual}
                    onChange={v => setField('sastreria', v)}
                    onSave={() => saveOne(row.store_id, 'sastreria')}
                    saving={savingKey === `${row.store_id}:sastreria`}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GoalInput({
  label, helper, value, target, actual, onChange, onSave, saving,
}: {
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
          <Label className="text-sm font-medium">{label}</Label>
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
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
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
