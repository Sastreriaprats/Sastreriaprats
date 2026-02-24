'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Search, MoreHorizontal, Eye, Loader2, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useList } from '@/hooks/use-list'
import { usePermissions } from '@/hooks/use-permissions'
import { useAction } from '@/hooks/use-action'
import { listSuppliers, createSupplierAction } from '@/actions/suppliers'
import { formatCurrency } from '@/lib/utils'

const paymentTermsLabels: Record<string, string> = {
  immediate: 'Al contado', net_15: '15 días', net_30: '30 días', net_60: '60 días', net_90: '90 días', custom: 'Personalizado',
}

const PAYMENT_TERMS_OPTIONS = [
  { value: 'immediate', label: 'Al contado' },
  { value: 'net_15', label: '15 días' },
  { value: 'net_30', label: '30 días' },
  { value: 'net_60', label: '60 días' },
  { value: 'net_90', label: '90 días' },
  { value: 'custom', label: 'Personalizado' },
]

const SUPPLIER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'fabric', label: 'Telas' },
  { value: 'manufacturing', label: 'Fabricación' },
  { value: 'accessories', label: 'Accesorios' },
  { value: 'trimmings', label: 'Adornos' },
  { value: 'services', label: 'Servicios' },
  { value: 'logistics', label: 'Logística' },
  { value: 'other', label: 'Otros' },
]

const emptyForm = {
  name: '',
  legal_name: '',
  nif_cif: '',
  phone: '',
  email: '',
  contact_person: '',
  address: '',
  city: '',
  postal_code: '',
  province: '',
  country: 'España',
  supplier_types: [] as string[],
  payment_terms: '',
  bank_iban: '',
  internal_notes: '',
  is_active: true,
}

export function SuppliersPageContent() {
  const router = useRouter()
  const { can } = usePermissions()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const {
    data: suppliers, total, totalPages, page, setPage,
    search, setSearch, sortBy, toggleSort, isLoading, pageSize, refresh,
  } = useList(listSuppliers, { pageSize: 25, defaultSort: 'name', defaultOrder: 'asc' })

  const { execute: createSupplier, isLoading: isCreating } = useAction(createSupplierAction, {
    successMessage: 'Proveedor creado correctamente',
    onSuccess: (data: any) => {
      setDialogOpen(false)
      setForm(emptyForm)
      refresh()
      if (data?.id) router.push(`/admin/proveedores/${data.id}`)
    },
  })

  const handleSave = () => {
    if (!form.name?.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const payload = {
      name: form.name.trim(),
      legal_name: form.legal_name?.trim() || null,
      nif_cif: form.nif_cif?.trim() || null,
      contact_name: form.contact_person?.trim() || null,
      contact_email: form.email?.trim() || null,
      contact_phone: form.phone?.trim() || null,
      address: form.address?.trim() || null,
      city: form.city?.trim() || null,
      postal_code: form.postal_code?.trim() || null,
      province: form.province?.trim() || null,
      country: form.country?.trim() || 'España',
      supplier_types: form.supplier_types,
      payment_terms: (form.payment_terms || 'net_30') as 'immediate' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom',
      payment_days: 30,
      bank_iban: form.bank_iban?.trim() || null,
      internal_notes: form.internal_notes?.trim() || null,
      is_active: form.is_active,
    }
    createSupplier(payload)
  }

  const toggleSupplierType = (value: string) => {
    setForm((f) => ({
      ...f,
      supplier_types: f.supplier_types.includes(value)
        ? f.supplier_types.filter((t) => t !== value)
        : [...f.supplier_types, value],
    }))
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">{children}<ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-foreground' : 'text-muted-foreground/50'}`} /></div>
    </TableHead>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-prats-navy">Proveedores</h1>
          <p className="text-muted-foreground">{total} proveedores</p>
        </div>
        {can('suppliers.create') && (
          <Button className="gap-2 bg-prats-navy hover:bg-prats-navy/90 text-white" onClick={() => { setForm(emptyForm); setDialogOpen(true) }}>
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nombre, NIF, email..." className="pl-9"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader field="name">Proveedor</SortHeader>
              <TableHead>Tipo</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Condiciones pago</TableHead>
              <SortHeader field="total_debt">Deuda</SortHeader>
              <SortHeader field="total_paid">Total pagado</SortHeader>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="space-y-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><div className="space-y-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-36" /></div></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
                </TableRow>
              ))
            ) : suppliers.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-40 text-center text-muted-foreground">No hay proveedores</TableCell></TableRow>
            ) : suppliers.map((s: any) => (
              <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/admin/proveedores/${s.id}`)}>
                <TableCell>
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{s.supplier_code}</p>
                    {s.nif_cif && <p className="text-xs text-muted-foreground">{s.nif_cif}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(s.supplier_types || []).map((t: string) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {s.contact_name && <p>{s.contact_name}</p>}
                  {s.contact_email && <p className="text-xs text-muted-foreground">{s.contact_email}</p>}
                </TableCell>
                <TableCell className="text-sm">{paymentTermsLabels[s.payment_terms] || s.payment_terms}</TableCell>
                <TableCell>
                  <span className={`font-medium ${(s.total_debt || 0) > 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(s.total_debt || 0)}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{formatCurrency(s.total_paid || 0)}</TableCell>
                <TableCell><Badge variant={s.is_active ? 'default' : 'destructive'} className="text-xs">{s.is_active ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/admin/proveedores/${s.id}`)}><Eye className="mr-2 h-4 w-4" /> Ver ficha</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} de {total}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-prats-navy">Nuevo proveedor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre del proveedor" />
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
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contact_person">Persona de contacto</Label>
              <Input id="contact_person" value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} />
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
              <Label>Tipo de proveedor</Label>
              <div className="flex flex-wrap gap-4 pt-2">
                {SUPPLIER_TYPE_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${opt.value}`}
                      checked={form.supplier_types.includes(opt.value)}
                      onCheckedChange={() => toggleSupplierType(opt.value)}
                    />
                    <Label htmlFor={`type-${opt.value}`} className="text-sm font-normal cursor-pointer">{opt.label}</Label>
                  </div>
                ))}
              </div>
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
            <div className="space-y-2">
              <Label htmlFor="bank_iban">IBAN</Label>
              <Input id="bank_iban" value={form.bank_iban} onChange={(e) => setForm((f) => ({ ...f, bank_iban: e.target.value }))} placeholder="ES00 0000 0000 0000 0000 0000" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="internal_notes">Notas internas</Label>
              <Textarea id="internal_notes" value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} rows={3} className="resize-none" />
            </div>
            <div className="space-y-2 flex items-center gap-2 sm:col-span-2">
              <Switch id="is_active" checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label htmlFor="is_active" className="cursor-pointer">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="bg-prats-navy hover:bg-prats-navy/90 text-white" onClick={handleSave} disabled={isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear proveedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
