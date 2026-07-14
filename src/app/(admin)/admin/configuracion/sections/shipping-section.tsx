'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Truck, Plus, Pencil, Trash2, Loader2, Globe } from 'lucide-react'
import { toast } from 'sonner'
import {
  listShippingZones, upsertShippingZone, deleteShippingZone,
  type ShippingZoneRow,
} from '@/actions/shipping'
import { COUNTRY_CODES, countryName, sortByCountryName } from '@/lib/countries'

// UE-27 sin España (preset para crear la zona "Europa" en un clic).
const EU_CODES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]

type Draft = {
  id?: string
  name: string
  shipping_cost: string
  free_shipping_threshold: string
  is_active: boolean
  is_default: boolean
  countries: string[]
}

const emptyDraft = (): Draft => ({
  name: '', shipping_cost: '', free_shipping_threshold: '',
  is_active: true, is_default: false, countries: [],
})

const toDraft = (z: ShippingZoneRow): Draft => ({
  id: z.id,
  name: z.name,
  shipping_cost: String(z.shipping_cost),
  free_shipping_threshold: z.free_shipping_threshold != null ? String(z.free_shipping_threshold) : '',
  is_active: z.is_active,
  is_default: z.is_default,
  countries: z.countries,
})

export function ShippingSection() {
  const [zones, setZones] = useState<ShippingZoneRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [countryFilter, setCountryFilter] = useState('')

  const sortedCodes = useMemo(() => sortByCountryName(COUNTRY_CODES), [])

  const load = async () => {
    const res = await listShippingZones()
    if (!res.success) { toast.error(res.error); setZones(null) }
    else setZones(res.data)
    setLoading(false)
  }

  useEffect(() => {
    let alive = true
    listShippingZones().then(res => {
      if (!alive) return
      if (!res.success) { toast.error(res.error); setZones(null) }
      else setZones(res.data)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const formatPrice = (p: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(p)

  const save = async () => {
    if (!draft) return
    const cost = parseFloat(draft.shipping_cost.replace(',', '.'))
    if (Number.isNaN(cost) || cost < 0) { toast.error('Indica un coste de envío válido (0 o más)'); return }
    const thresholdRaw = draft.free_shipping_threshold.trim().replace(',', '.')
    const threshold = thresholdRaw === '' ? null : parseFloat(thresholdRaw)
    if (threshold != null && (Number.isNaN(threshold) || threshold <= 0)) {
      toast.error('El umbral de envío gratis debe ser mayor que 0, o déjalo vacío'); return
    }
    setSaving(true)
    const res = await upsertShippingZone({
      id: draft.id,
      name: draft.name,
      shipping_cost: cost,
      free_shipping_threshold: threshold,
      is_active: draft.is_active,
      is_default: draft.is_default,
      countries: draft.countries,
    })
    setSaving(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success('Zona guardada')
    setDraft(null)
    load()
  }

  const remove = async (zone: ShippingZoneRow) => {
    const msg = zone.countries.length
      ? `¿Eliminar la zona "${zone.name}"? Se dejará de enviar a: ${zone.countries.map(c => countryName(c)).join(', ')} (salvo que los cubra la zona "Resto de países").`
      : `¿Eliminar la zona "${zone.name}"?`
    if (!confirm(msg)) return
    const res = await deleteShippingZone({ id: zone.id })
    if (!res.success) { toast.error(res.error); return }
    toast.success('Zona eliminada')
    load()
  }

  const toggleCountry = (code: string, on: boolean) => {
    if (!draft) return
    setDraft({
      ...draft,
      countries: on ? [...new Set([...draft.countries, code])] : draft.countries.filter(c => c !== code),
    })
  }

  const filteredCodes = countryFilter.trim()
    ? sortedCodes.filter(c =>
        countryName(c).toLowerCase().includes(countryFilter.trim().toLowerCase()) ||
        c.toLowerCase().includes(countryFilter.trim().toLowerCase()))
    : sortedCodes

  if (loading) {
    return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>
  }
  if (!zones) return <p className="text-muted-foreground">No se pudo cargar la configuración de envíos.</p>

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        La tienda online solo permite comprar con envío a los países asignados a una zona <strong>activa</strong>.
        Cada zona tiene su coste y, opcionalmente, un umbral de <strong>envío gratis</strong> (vacío = nunca gratis).
        La zona marcada como <strong>&ldquo;Resto de países&rdquo;</strong> cubre cualquier país sin zona propia
        (si no existe, a esos países no se vende). <strong>Antes de activar zonas internacionales, confirma con la
        gestoría el IVA/OSS y que el TPV acepte tarjetas extranjeras.</strong>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Zonas de envío</CardTitle>
          <Button size="sm" className="gap-1" onClick={() => { setCountryFilter(''); setDraft(emptyDraft()) }}>
            <Plus className="h-3 w-3" /> Nueva zona
          </Button>
        </CardHeader>
        <CardContent>
          {zones.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No hay zonas. Sin zonas la tienda no puede vender con envío a domicilio.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zona</TableHead>
                  <TableHead className="text-right">Coste</TableHead>
                  <TableHead className="text-right">Gratis desde</TableHead>
                  <TableHead>Países</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map(z => (
                  <TableRow key={z.id}>
                    <TableCell className="font-medium">
                      {z.name}
                      {z.is_default && (
                        <Badge variant="outline" className="ml-2 gap-1"><Globe className="h-3 w-3" /> Resto de países</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatPrice(z.shipping_cost)}</TableCell>
                    <TableCell className="text-right">
                      {z.free_shipping_threshold != null
                        ? formatPrice(z.free_shipping_threshold)
                        : <span className="text-muted-foreground">Nunca</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-72">
                      {z.is_default && z.countries.length === 0
                        ? 'Todos los no asignados'
                        : z.countries.length <= 4
                          ? z.countries.map(c => countryName(c)).join(', ') || '—'
                          : `${z.countries.slice(0, 3).map(c => countryName(c)).join(', ')} y ${z.countries.length - 3} más`}
                    </TableCell>
                    <TableCell>{z.is_active ? <Badge>Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setCountryFilter(''); setDraft(toDraft(z)) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => remove(z)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Diálogo de zona ─────────────────────────────────────────────────── */}
      <Dialog open={!!draft} onOpenChange={o => { if (!o) setDraft(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? 'Editar zona de envío' : 'Nueva zona de envío'}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Europa" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Coste de envío (€)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={draft.shipping_cost}
                    onChange={e => setDraft({ ...draft, shipping_cost: e.target.value })}
                    placeholder="19.90"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gratis a partir de (€)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={draft.free_shipping_threshold}
                    onChange={e => setDraft({ ...draft, free_shipping_threshold: e.target.value })}
                    placeholder="Vacío = nunca gratis"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="cursor-pointer">&ldquo;Resto de países&rdquo; (catch-all)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Cubre cualquier país que no tenga zona propia. Solo puede haber una.
                  </p>
                </div>
                <Switch checked={draft.is_default} onCheckedChange={c => setDraft({ ...draft, is_default: c })} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Países de la zona {draft.countries.length > 0 && `(${draft.countries.length})`}</Label>
                  <Button
                    type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setDraft({ ...draft, countries: [...new Set([...draft.countries, ...EU_CODES])] })}
                  >
                    + Unión Europea
                  </Button>
                </div>
                <Input
                  value={countryFilter}
                  onChange={e => setCountryFilter(e.target.value)}
                  placeholder="Buscar país…"
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto rounded-md border p-2">
                  {filteredCodes.map(code => (
                    <label key={code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.countries.includes(code)}
                        onCheckedChange={c => toggleCountry(code, !!c)}
                      />
                      {countryName(code)}
                    </label>
                  ))}
                  {filteredCodes.length === 0 && (
                    <p className="col-span-2 text-xs text-muted-foreground py-2">Sin resultados.</p>
                  )}
                </div>
                {draft.is_default && (
                  <p className="text-[11px] text-muted-foreground">
                    Al ser &ldquo;Resto de países&rdquo;, puede quedarse sin países asignados: cubre todos los demás.
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.is_active} onCheckedChange={c => setDraft({ ...draft, is_active: !!c })} /> Zona activa
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
