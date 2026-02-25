'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { formatCurrency } from '@/lib/utils'

const PAYMENT_TERMS_OPTIONS = [
  { value: 'immediate', label: 'Al contado' },
  { value: 'net_15', label: '15 días' },
  { value: 'net_30', label: '30 días' },
  { value: 'net_60', label: '60 días' },
  { value: 'net_90', label: '90 días' },
  { value: 'custom', label: 'Personalizado' },
]

const emptyForm = {
  name: '',
  legal_name: '',
  nif_cif: '',
  phone: '',
  email: '',
  specialty: '',
  price_per_garment: '',
  address: '',
  city: '',
  postal_code: '',
  province: '',
  country: 'España',
  bank_iban: '',
  payment_terms: '',
  internal_notes: '',
  is_active: true,
}

export function OfficialsPageContent() {
  const supabase = useMemo(() => createClient(), [])
  const { can } = usePermissions()
  const canEdit = can('officials.edit')
  const canCreate = can('officials.create')

  const [officials, setOfficials] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [isSaving, setIsSaving] = useState(false)

  const fetchOfficials = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('officials')
        .select('id, name, legal_name, nif_cif, phone, email, specialty, price_per_garment, address, city, postal_code, province, country, bank_iban, payment_terms, internal_notes, is_active')
        .order('name', { ascending: true })
      if (error) throw error
      setOfficials(data ?? [])
    } catch (err: any) {
      console.error('[OfficialsPageContent] fetchOfficials error:', err)
      toast.error(err?.message ?? 'Error al cargar los oficiales')
      setOfficials([])
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchOfficials()
  }, [fetchOfficials])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (o: any) => {
    setEditingId(o.id)
    setForm({
      name: o.name ?? '',
      legal_name: o.legal_name ?? '',
      nif_cif: o.nif_cif ?? '',
      phone: o.phone ?? '',
      email: o.email ?? '',
      specialty: o.specialty ?? '',
      price_per_garment: o.price_per_garment != null ? String(o.price_per_garment) : '',
      address: o.address ?? '',
      city: o.city ?? '',
      postal_code: o.postal_code ?? '',
      province: o.province ?? '',
      country: o.country ?? 'España',
      bank_iban: o.bank_iban ?? '',
      payment_terms: o.payment_terms ?? '',
      internal_notes: o.internal_notes ?? '',
      is_active: o.is_active ?? true,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setIsSaving(true)
    const payload = {
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      nif_cif: form.nif_cif.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      specialty: form.specialty.trim() || null,
      price_per_garment: form.price_per_garment ? parseFloat(form.price_per_garment) : null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      province: form.province.trim() || null,
      country: form.country.trim() || 'España',
      bank_iban: form.bank_iban.trim() || null,
      payment_terms: form.payment_terms || null,
      internal_notes: form.internal_notes.trim() || null,
      is_active: form.is_active,
    }
    if (editingId) {
      const { error } = await supabase.from('officials').update(payload).eq('id', editingId)
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Oficial actualizado')
        setDialogOpen(false)
        fetchOfficials()
      }
    } else {
      const { error } = await supabase.from('officials').insert(payload)
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Oficial creado')
        setDialogOpen(false)
        fetchOfficials()
      }
    }
    setIsSaving(false)
  }

  const handleToggleActive = async (o: any) => {
    if (!canEdit) return
    const { error } = await supabase
      .from('officials')
      .update({ is_active: !o.is_active })
      .eq('id', o.id)
    if (error) toast.error(error.message)
    else {
      toast.success(o.is_active ? 'Oficial desactivado' : 'Oficial activado')
      fetchOfficials()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-prats-navy">Oficiales</h1>
        {canCreate && (
          <Button className="gap-2 bg-prats-navy hover:bg-prats-navy/90 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nuevo oficial
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Nombre</TableHead>
                <TableHead>NIF/CIF</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Especialidad</TableHead>
                <TableHead>Precio/prenda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-prats-navy" />
                  </TableCell>
                </TableRow>
              ) : officials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No hay oficiales. Crea uno con &quot;Nuevo oficial&quot;.
                  </TableCell>
                </TableRow>
              ) : (
                officials.map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.nif_cif ?? '—'}</TableCell>
                    <TableCell className="text-sm">{o.phone ?? '—'}</TableCell>
                    <TableCell className="text-sm">{o.email ?? '—'}</TableCell>
                    <TableCell className="text-sm">{o.specialty ?? '—'}</TableCell>
                    <TableCell className="text-sm">{o.price_per_garment != null ? formatCurrency(o.price_per_garment) : '—'}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Switch
                          checked={!!o.is_active}
                          onCheckedChange={() => handleToggleActive(o)}
                        />
                      ) : (
                        <Badge variant={o.is_active ? 'default' : 'secondary'} className={o.is_active ? 'bg-green-600' : ''}>
                          {o.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-prats-navy hover:text-prats-gold" onClick={() => openEdit(o)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-prats-navy">{editingId ? 'Editar oficial' : 'Nuevo oficial'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre del oficial" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal_name">Razón social</Label>
              <Input id="legal_name" value={form.legal_name} onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nif_cif">NIF/CIF</Label>
              <Input id="nif_cif" value={form.nif_cif} onChange={(e) => setForm((f) => ({ ...f, nif_cif: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="specialty">Especialidad</Label>
              <Input id="specialty" value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} placeholder="Ej. Americana, pantalón" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_per_garment">Precio por prenda (€)</Label>
              <Input id="price_per_garment" type="number" step="0.01" value={form.price_per_garment} onChange={(e) => setForm((f) => ({ ...f, price_per_garment: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">Código postal</Label>
              <Input id="postal_code" value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Provincia</Label>
              <Input id="province" value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <Input id="country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bank_iban">IBAN</Label>
              <Input id="bank_iban" value={form.bank_iban} onChange={(e) => setForm((f) => ({ ...f, bank_iban: e.target.value }))} placeholder="ES00 0000 0000 0000 0000 0000" />
            </div>
            <div className="space-y-2">
              <Label>Condiciones de pago</Label>
              <Select value={form.payment_terms || 'net_30'} onValueChange={(v) => setForm((f) => ({ ...f, payment_terms: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex items-center gap-2 sm:col-span-2">
              <Switch id="is_active" checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label htmlFor="is_active" className="cursor-pointer">Activo</Label>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="internal_notes">Notas internas</Label>
              <Textarea id="internal_notes" value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} rows={3} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="bg-prats-navy hover:bg-prats-navy/90 text-white" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
