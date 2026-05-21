'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowDownToLine, Plus, Minus, Equal, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { adjustFabricStock } from '@/actions/fabrics'

type MovementType = 'reception' | 'adjustment_positive' | 'adjustment_negative' | 'inventory_set'

type Fabric = {
  id: string
  name?: string | null
  fabric_code?: string | null
  stock_meters?: number | string | null
}

const MOVEMENT_OPTIONS: ReadonlyArray<{
  type: MovementType
  label: string
  hint: string
  icon: typeof Plus
  // Tailwind classes for the icon when option is selected vs not.
  activeClass: string
  iconClass: string
}> = [
  { type: 'reception',           label: 'Recepción de proveedor',  hint: 'Entrada por albarán',                       icon: ArrowDownToLine, activeClass: 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500', iconClass: 'text-emerald-600' },
  { type: 'adjustment_positive', label: 'Ajuste positivo (+)',     hint: 'Corregir al alza',                           icon: Plus,            activeClass: 'border-blue-500 bg-blue-50 ring-1 ring-blue-500',           iconClass: 'text-blue-600' },
  { type: 'adjustment_negative', label: 'Ajuste negativo (−)',     hint: 'Rotura, pérdida, error',                     icon: Minus,           activeClass: 'border-amber-500 bg-amber-50 ring-1 ring-amber-500',         iconClass: 'text-amber-600' },
  { type: 'inventory_set',       label: 'Recuento físico (=)',     hint: 'Sobreescribir cantidad exacta',              icon: Equal,           activeClass: 'border-violet-500 bg-violet-50 ring-1 ring-violet-500',     iconClass: 'text-violet-600' },
]

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function AdjustFabricStockDialog({
  open,
  onOpenChange,
  fabric,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fabric: Fabric | null
  onSuccess: () => void
}) {
  const [movementType, setMovementType] = useState<MovementType>('reception')
  const [quantity, setQuantity] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // Reset cuando se abre con otro tejido o cuando se cierra.
  useEffect(() => {
    if (open) {
      setMovementType('reception')
      setQuantity('')
      setReason('')
    }
  }, [open, fabric?.id])

  const before = Number(fabric?.stock_meters ?? 0) || 0
  const qty = Number(quantity) || 0
  const after = (() => {
    if (qty <= 0) return before
    if (movementType === 'inventory_set') return qty
    const sign = movementType === 'reception' || movementType === 'adjustment_positive' ? 1 : -1
    return Math.round((before + sign * qty) * 100) / 100
  })()
  const delta = Math.round((after - before) * 100) / 100
  const goesNegative = after < 0
  const reasonRequired = movementType === 'adjustment_negative' || movementType === 'inventory_set'
  const canSubmit = qty > 0 && !goesNegative && (!reasonRequired || reason.trim().length > 0)

  async function handleSubmit() {
    if (!fabric || !canSubmit) return
    setSaving(true)
    const res = await adjustFabricStock({
      fabricId: fabric.id,
      quantity: qty,
      movementType,
      reason: reason.trim(),
    })
    setSaving(false)
    if (!res.success) {
      toast.error(res.error ?? 'No se pudo ajustar el stock')
      return
    }
    toast.success(`Stock actualizado: ${fmt(res.data.stock_before)} m → ${fmt(res.data.stock_after)} m`)
    onSuccess()
    onOpenChange(false)
  }

  if (!fabric) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar stock — {fabric.name ?? 'Tejido'}</DialogTitle>
          {fabric.fabric_code && (
            <p className="text-xs text-muted-foreground font-mono">{fabric.fabric_code}</p>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-md border bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Stock actual</p>
            <p className="text-2xl font-bold tabular-nums">{fmt(before)} m</p>
          </div>

          <div className="space-y-2">
            <Label>Tipo de movimiento</Label>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_OPTIONS.map((opt) => {
                const Icon = opt.icon
                const isActive = movementType === opt.type
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => setMovementType(opt.type)}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                      isActive ? opt.activeClass : 'border-input hover:bg-muted/40'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${opt.iconClass}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{opt.label}</p>
                      <p className="text-xs text-muted-foreground leading-tight mt-0.5">{opt.hint}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-qty">
              {movementType === 'inventory_set' ? 'Stock real medido (m) *' : 'Cantidad (m) *'}
            </Label>
            <Input
              id="adjust-qty"
              type="number"
              min={0}
              step={0.01}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Motivo {reasonRequired ? '*' : '(opcional)'}</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                movementType === 'reception'           ? 'Ej: Albarán AT-2026-0142'
                : movementType === 'adjustment_negative' ? 'Ej: Rollo dañado en almacén'
                : movementType === 'inventory_set'       ? 'Ej: Recuento físico mensual'
                                                         : 'Notas internas'
              }
              rows={2}
            />
          </div>

          {qty > 0 && (
            <div className={`rounded-md border px-4 py-3 ${goesNegative ? 'border-red-300 bg-red-50' : 'bg-muted/40'}`}>
              <p className="text-xs text-muted-foreground">Nuevo stock</p>
              <div className="flex items-baseline gap-3">
                <p className={`text-2xl font-bold tabular-nums ${goesNegative ? 'text-red-600' : ''}`}>
                  {fmt(after)} m
                </p>
                <p className={`text-sm font-medium tabular-nums ${delta >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {delta >= 0 ? '+' : ''}{fmt(delta)} m
                </p>
              </div>
              {goesNegative && (
                <p className="text-xs text-red-600 mt-1">El stock no puede quedar en negativo.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="bg-prats-navy hover:bg-prats-navy/90 gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Guardando…' : 'Confirmar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
