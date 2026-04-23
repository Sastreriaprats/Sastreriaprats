'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createStoreAction, updateStoreAction } from '@/actions/config'

export interface StoreEditRow {
  id: string
  code: string
  name: string
  display_name?: string | null
  store_type: string
  address?: string | null
  city?: string | null
  postal_code?: string | null
  province?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  default_cash_fund?: number | null
  order_prefix?: string | null
  slug?: string | null
  opening_hours?: Record<string, unknown> | null
  fiscal_name?: string | null
  fiscal_nif?: string | null
  fiscal_address?: string | null
  latitude?: number | null
  longitude?: number | null
  google_maps_url?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: StoreEditRow | null
  onSaved?: () => void
}

const emptyForm = {
  code: '', name: '', display_name: '', store_type: 'physical',
  address: '', city: 'Madrid', postal_code: '', province: 'Madrid', country: 'España',
  phone: '', email: '', default_cash_fund: '300', order_prefix: '', slug: '',
  opening_hours: {} as Record<string, { open: string; close: string }>,
  fiscal_name: '', fiscal_nif: '', fiscal_address: '',
  latitude: '', longitude: '', google_maps_url: '',
}

const days = [
  { key: 'mon', label: 'Lunes' }, { key: 'tue', label: 'Martes' }, { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' }, { key: 'fri', label: 'Viernes' }, { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
]

export function StoreEditDialog({ open, onOpenChange, store, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (store) {
      setForm({
        code: store.code, name: store.name, display_name: store.display_name || '',
        store_type: store.store_type, address: store.address || '', city: store.city || 'Madrid',
        postal_code: store.postal_code || '', province: store.province || 'Madrid', country: store.country || 'España',
        phone: store.phone || '', email: store.email || '',
        default_cash_fund: store.default_cash_fund?.toString() || '300',
        order_prefix: store.order_prefix || '', slug: store.slug || '',
        opening_hours: (store.opening_hours || {}) as Record<string, { open: string; close: string }>,
        fiscal_name: store.fiscal_name || '', fiscal_nif: store.fiscal_nif || '', fiscal_address: store.fiscal_address || '',
        latitude: store.latitude?.toString() || '', longitude: store.longitude?.toString() || '',
        google_maps_url: store.google_maps_url || '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [open, store])

  const setHours = (day: string, field: 'open' | 'close', value: string) => {
    setForm(prev => ({
      ...prev,
      opening_hours: { ...prev.opening_hours, [day]: { ...(prev.opening_hours[day] || { open: '', close: '' }), [field]: value } },
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    const payload = {
      code: form.code.toUpperCase(), name: form.name,
      display_name: form.display_name || form.name,
      store_type: form.store_type, address: form.address || undefined,
      city: form.city, postal_code: form.postal_code || undefined,
      province: form.province, country: form.country,
      phone: form.phone || undefined, email: form.email || undefined,
      opening_hours: form.opening_hours,
      default_cash_fund: parseFloat(form.default_cash_fund) || 300,
      order_prefix: form.order_prefix || form.code.toUpperCase(),
      slug: form.slug || form.name.toLowerCase().replace(/\s+/g, '-'),
      fiscal_name: form.fiscal_name || undefined,
      fiscal_nif: form.fiscal_nif || undefined,
      fiscal_address: form.fiscal_address || undefined,
      latitude: form.latitude ? parseFloat(form.latitude) : undefined,
      longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      google_maps_url: form.google_maps_url || undefined,
    }

    const result = store
      ? await updateStoreAction(store.id, payload)
      : await createStoreAction(payload)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(store ? 'Tienda actualizada' : 'Tienda creada con almacén')
      onOpenChange(false)
      onSaved?.()
    }
    setIsSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{store ? 'Editar tienda' : 'Nueva tienda'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value }))} placeholder="WEL" maxLength={10} /></div>
            <div className="space-y-2 col-span-2"><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Tipo</Label>
              <Select value={form.store_type} onValueChange={(v) => setForm(p => ({ ...p, store_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="physical">Física</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="warehouse">Almacén</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Fondo de caja (€)</Label><Input type="number" value={form.default_cash_fund} onChange={(e) => setForm(p => ({ ...p, default_cash_fund: e.target.value }))} /></div>
          </div>
          <div className="space-y-2"><Label>Dirección</Label><Input value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Ciudad</Label><Input value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} /></div>
            <div className="space-y-2"><Label>CP</Label><Input value={form.postal_code} onChange={(e) => setForm(p => ({ ...p, postal_code: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Provincia</Label><Input value={form.province} onChange={(e) => setForm(p => ({ ...p, province: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          </div>

          <div className="space-y-2">
            <Label>Horario de apertura</Label>
            <div className="rounded-lg border p-3 space-y-2">
              {days.map(d => (
                <div key={d.key} className="grid grid-cols-5 items-center gap-2">
                  <span className="text-sm">{d.label}</span>
                  <Input type="time" className="col-span-2" value={form.opening_hours[d.key]?.open || ''} onChange={(e) => setHours(d.key, 'open', e.target.value)} />
                  <Input type="time" className="col-span-2" value={form.opening_hours[d.key]?.close || ''} onChange={(e) => setHours(d.key, 'close', e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold">Datos fiscales</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Razón social</Label><Input value={form.fiscal_name} onChange={(e) => setForm(p => ({ ...p, fiscal_name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>NIF/CIF</Label><Input value={form.fiscal_nif} onChange={(e) => setForm(p => ({ ...p, fiscal_nif: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Dirección fiscal</Label><Input value={form.fiscal_address} onChange={(e) => setForm(p => ({ ...p, fiscal_address: e.target.value }))} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || !form.code || !form.name} className="bg-prats-navy hover:bg-prats-navy-light">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {store ? 'Guardar cambios' : 'Crear tienda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
