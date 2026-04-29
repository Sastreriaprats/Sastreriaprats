'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Pencil, Trash2, Loader2, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import {
  listSeasons,
  createSeasonAction,
  updateSeasonAction,
  deleteSeasonAction,
  toggleSeasonAction,
  type SeasonRow,
} from '@/actions/seasons'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

type Status = 'active' | 'inactive' | 'out_of_dates'

function computeStatus(s: SeasonRow): Status {
  if (!s.is_active) return 'inactive'
  const today = new Date().toISOString().slice(0, 10)
  if (s.start_date && s.start_date > today) return 'out_of_dates'
  if (s.end_date && s.end_date < today) return 'out_of_dates'
  return 'active'
}

type FormState = {
  id?: string
  name: string
  slug: string
  start_date: string
  end_date: string
  description: string
  is_active: boolean
  sort_order: number | ''
}

const emptyForm: FormState = {
  id: undefined,
  name: '',
  slug: '',
  start_date: '',
  end_date: '',
  description: '',
  is_active: true,
  sort_order: 0,
}

export function TemporadasContent({ initialSeasons }: { initialSeasons: SeasonRow[] }) {
  const [seasons, setSeasons] = useState<SeasonRow[]>(initialSeasons)
  const [refreshing, setRefreshing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SeasonRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const r = await listSeasons()
    if (r.success && r.data) setSeasons(r.data)
    setRefreshing(false)
  }, [])

  const openCreate = () => {
    setForm(emptyForm)
    setSlugTouched(false)
    setDialogOpen(true)
  }

  const openEdit = (s: SeasonRow) => {
    setForm({
      id: s.id,
      name: s.name,
      slug: s.slug,
      start_date: s.start_date ?? '',
      end_date: s.end_date ?? '',
      description: s.description ?? '',
      is_active: s.is_active,
      sort_order: s.sort_order,
    })
    setSlugTouched(true)
    setDialogOpen(true)
  }

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      slug: slugTouched ? f.slug : slugify(name),
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      toast.error('La fecha de inicio no puede ser posterior a la de fin')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      description: form.description.trim() || null,
      is_active: form.is_active,
      sort_order: typeof form.sort_order === 'number' ? form.sort_order : 0,
    }
    const res = form.id
      ? await updateSeasonAction({ id: form.id, ...payload })
      : await createSeasonAction(payload)
    setSaving(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al guardar')
      return
    }
    toast.success(form.id ? 'Temporada actualizada' : 'Temporada creada')
    setDialogOpen(false)
    setForm(emptyForm)
    setSlugTouched(false)
    refresh()
  }

  const handleToggle = async (s: SeasonRow, value: boolean) => {
    setTogglingId(s.id)
    const res = await toggleSeasonAction({ id: s.id, is_active: value })
    setTogglingId(null)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al cambiar estado')
      return
    }
    toast.success(value ? `"${s.name}" activada` : `"${s.name}" desactivada`)
    refresh()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await deleteSeasonAction({ id: deleteTarget.id })
    setDeleting(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al eliminar')
      return
    }
    toast.success('Temporada eliminada')
    setDeleteTarget(null)
    refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarRange className="h-6 w-6 text-prats-navy" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Temporadas</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona las temporadas. Si desactivas una, sus productos dejan de mostrarse en la web automáticamente.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
          <Plus className="h-4 w-4" /> Nueva temporada
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center">Productos</TableHead>
              <TableHead className="text-center">Activa</TableHead>
              <TableHead className="text-right w-28">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {seasons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  No hay temporadas. <Button variant="link" className="p-0 h-auto" onClick={openCreate}>Crear la primera</Button>.
                </TableCell>
              </TableRow>
            ) : seasons.map((s) => {
              const status = computeStatus(s)
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.slug}</TableCell>
                  <TableCell className="text-sm">{formatDate(s.start_date)}</TableCell>
                  <TableCell className="text-sm">{formatDate(s.end_date)}</TableCell>
                  <TableCell className="text-center">
                    {status === 'active' && (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Activa</Badge>
                    )}
                    {status === 'inactive' && (
                      <Badge variant="secondary">Inactiva</Badge>
                    )}
                    {status === 'out_of_dates' && (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Fuera de fechas</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{s.product_count}</TableCell>
                  <TableCell className="text-center">
                    {togglingId === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    ) : (
                      <Switch checked={s.is_active} onCheckedChange={(v) => handleToggle(s, v)} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteTarget(s)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {refreshing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Actualizando…
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setForm(emptyForm); setSlugTouched(false) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar temporada' : 'Nueva temporada'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Primavera / Verano 2027"
              />
            </div>
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => { setForm((f) => ({ ...f, slug: e.target.value })); setSlugTouched(true) }}
                placeholder="ss-2027"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Identificador técnico. Se genera automáticamente desde el nombre. Si lo cambias, los productos asignados se reasignan al nuevo slug.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fecha inicio</Label>
                <DatePickerPopover
                  value={form.start_date}
                  onChange={(d) => setForm((f) => ({ ...f, start_date: d }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Fecha fin</Label>
                <DatePickerPopover
                  value={form.end_date}
                  onChange={(d) => setForm((f) => ({ ...f, end_date: d }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="is-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label htmlFor="is-active" className="cursor-pointer">Activa</Label>
              </div>
              <div className="space-y-1">
                <Label>Orden</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value === '' ? '' : Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Texto opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-prats-navy hover:bg-prats-navy-light">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {form.id ? 'Guardar cambios' : 'Crear temporada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog eliminar */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar temporada</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la temporada <strong>{deleteTarget?.name}</strong>?
              {deleteTarget?.product_count ? (
                <span className="block mt-2 text-amber-700">
                  Atención: tiene {deleteTarget.product_count} producto(s) asignado(s); el servidor bloqueará la eliminación.
                  Si solo quieres ocultarla, desactívala con el switch.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
