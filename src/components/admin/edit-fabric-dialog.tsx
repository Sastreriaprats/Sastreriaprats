'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { SupplierCombobox } from '@/components/admin/supplier-combobox'
import { updateFabricAction } from '@/actions/fabrics'

/**
 * Dialog modal de edición rápida de un tejido. Reemplaza la página de
 * detalle inexistente `/admin/stock/tejidos/[id]` (404 antes del fix).
 *
 * Si `canEdit` es false, todos los campos quedan deshabilitados y el botón
 * "Guardar" se oculta — sirve como visor de detalle.
 */
export interface FabricRow {
  id: string
  fabric_code?: string | null
  name?: string | null
  description?: string | null
  supplier_id?: string | null
  supplier_reference?: string | null
  composition?: string | null
  color_name?: string | null
  color_hex?: string | null
  price_per_meter?: number | string | null
  stock_meters?: number | string | null
  min_stock_meters?: number | string | null
  is_active?: boolean | null
}

interface Props {
  fabric: FabricRow | null
  suppliers: { id: string; name: string; nif_cif?: string | null; supplier_code?: string | null }[]
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  name: string
  description: string
  supplier_id: string
  supplier_reference: string
  composition: string
  color_name: string
  color_hex: string
  price_per_meter: string
  min_stock_meters: string
  is_active: boolean
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    supplier_id: '',
    supplier_reference: '',
    composition: '',
    color_name: '',
    color_hex: '',
    price_per_meter: '',
    min_stock_meters: '',
    is_active: true,
  }
}

function fabricToForm(f: FabricRow): FormState {
  return {
    name: f.name ?? '',
    description: f.description ?? '',
    supplier_id: f.supplier_id ?? '',
    supplier_reference: f.supplier_reference ?? '',
    composition: f.composition ?? '',
    color_name: f.color_name ?? '',
    color_hex: f.color_hex ?? '',
    price_per_meter: f.price_per_meter != null ? String(f.price_per_meter) : '',
    min_stock_meters: f.min_stock_meters != null ? String(f.min_stock_meters) : '',
    is_active: Boolean(f.is_active),
  }
}

export function EditFabricDialog({ fabric, suppliers, canEdit, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm())
  const [errors, setErrors] = useState<{ name?: string; price_per_meter?: string }>({})
  const [saving, setSaving] = useState(false)

  const open = !!fabric

  // Reset del form cada vez que cambia el tejido seleccionado.
  useEffect(() => {
    if (!fabric) return
    setForm(fabricToForm(fabric))
    setErrors({})
  }, [fabric])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!fabric || !canEdit) return

    const nextErrors: typeof errors = {}
    if (form.name.trim().length < 2) nextErrors.name = 'El nombre es obligatorio (mínimo 2 caracteres)'
    const priceNum = form.price_per_meter.trim() === '' ? null : Number(form.price_per_meter)
    if (priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0)) {
      nextErrors.price_per_meter = 'El precio debe ser un número positivo'
    }
    const minStockNum = form.min_stock_meters.trim() === '' ? null : Number(form.min_stock_meters)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    try {
      const res = await updateFabricAction({
        id: fabric.id,
        data: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          supplier_id: form.supplier_id || null,
          supplier_reference: form.supplier_reference.trim() || null,
          composition: form.composition.trim() || null,
          color_name: form.color_name.trim() || null,
          color_hex: form.color_hex.trim() || null,
          price_per_meter: priceNum,
          min_stock_meters: minStockNum,
          is_active: form.is_active,
        },
      })
      if (res.success) {
        toast.success('Tejido actualizado')
        onSaved()
      } else {
        toast.error(res.error || 'Error al guardar')
      }
    } finally {
      setSaving(false)
    }
  }

  const readonly = !canEdit || saving

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o && !saving) onClose() }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {canEdit ? 'Editar tejido' : 'Detalle del tejido'}
            {fabric?.fabric_code && (
              <span className="ml-2 font-mono text-sm text-muted-foreground font-normal">
                {fabric.fabric_code}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fabric-code">Código</Label>
              <Input
                id="fabric-code"
                value={fabric?.fabric_code ?? ''}
                readOnly
                disabled
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">No editable.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fabric-name">Nombre *</Label>
              <Input
                id="fabric-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                disabled={readonly}
                placeholder="Ej: Lana fría azul marino"
              />
              {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fabric-supplier">Proveedor</Label>
            <SupplierCombobox
              suppliers={suppliers}
              value={form.supplier_id || null}
              onChange={(v) => setField('supplier_id', v ?? '')}
              allowNone
              noneLabel="Sin proveedor"
              disabled={readonly}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fabric-ref">Referencia proveedor</Label>
              <Input
                id="fabric-ref"
                value={form.supplier_reference}
                onChange={(e) => setField('supplier_reference', e.target.value)}
                disabled={readonly}
                placeholder="Código interno del proveedor"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fabric-composition">Composición</Label>
              <Input
                id="fabric-composition"
                value={form.composition}
                onChange={(e) => setField('composition', e.target.value)}
                disabled={readonly}
                placeholder="Ej: 100% lana"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fabric-color">Color</Label>
              <Input
                id="fabric-color"
                value={form.color_name}
                onChange={(e) => setField('color_name', e.target.value)}
                disabled={readonly}
                placeholder="Ej: Azul marino"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fabric-color-hex">Color (hex)</Label>
              <Input
                id="fabric-color-hex"
                value={form.color_hex}
                onChange={(e) => setField('color_hex', e.target.value)}
                disabled={readonly}
                placeholder="#1a2942"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fabric-price">Precio por metro (€)</Label>
              <Input
                id="fabric-price"
                type="number"
                step="0.01"
                min="0"
                value={form.price_per_meter}
                onChange={(e) => setField('price_per_meter', e.target.value)}
                disabled={readonly}
                placeholder="0.00"
              />
              {errors.price_per_meter && <p className="text-xs text-red-600">{errors.price_per_meter}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fabric-min-stock">Stock mínimo (m)</Label>
              <Input
                id="fabric-min-stock"
                type="number"
                step="0.1"
                min="0"
                value={form.min_stock_meters}
                onChange={(e) => setField('min_stock_meters', e.target.value)}
                disabled={readonly}
                placeholder="Sin alerta"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fabric-description">Notas</Label>
            <Textarea
              id="fabric-description"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              disabled={readonly}
              rows={3}
              placeholder="Observaciones internas (opcional)"
            />
          </div>

          {canEdit && (
            <div className="flex items-start gap-3 pt-1">
              <Switch
                id="fabric-active"
                checked={form.is_active}
                onCheckedChange={(v) => setField('is_active', v)}
                disabled={saving}
              />
              <div className="space-y-1">
                <Label htmlFor="fabric-active" className="cursor-pointer">Tejido activo</Label>
                <p className="text-xs text-muted-foreground">
                  Si está inactivo, no se podrá seleccionar al crear nuevas fichas o pedidos a proveedor.
                </p>
              </div>
            </div>
          )}

          {/* Stock actual: solo lectura, informativo */}
          {fabric?.stock_meters != null && (
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Stock actual: <strong className="text-foreground">{fabric.stock_meters} m</strong>
                {' · '}
                Para modificar usa &laquo;Ajustar stock&raquo; en el menú del listado.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {canEdit ? 'Cancelar' : 'Cerrar'}
          </Button>
          {canEdit && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-prats-navy hover:bg-prats-navy/90 gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
