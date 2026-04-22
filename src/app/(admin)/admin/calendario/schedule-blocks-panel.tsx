'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { CalendarOff, Plus, Trash2, Loader2, ShieldBan } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { listScheduleBlocks, createScheduleBlock, deleteScheduleBlock } from '@/actions/schedule-blocks'
import type { ScheduleBlock } from '@/actions/schedule-blocks'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function ScheduleBlocksPanel() {
  const supabase = useMemo(() => createClient(), [])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState<{ id: string; name: string }[]>([])

  // Form state
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState('')
  const [blockDate, setBlockDate] = useState('')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('14:00')
  const [storeId, setStoreId] = useState('all')
  const [submitting, setSubmitting] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadBlocks()
    supabase.from('stores').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setStores(data as { id: string; name: string }[]) })
  }, [])

  async function loadBlocks() {
    setLoading(true)
    const res = await listScheduleBlocks({})
    if (res.success) setBlocks(res.data)
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !blockDate) {
      toast.error('Título y fecha son obligatorios')
      return
    }
    setSubmitting(true)
    const res = await createScheduleBlock({
      title,
      reason: reason || undefined,
      block_date: blockDate,
      all_day: allDay,
      start_time: allDay ? undefined : startTime,
      end_time: allDay ? undefined : endTime,
      store_id: storeId === 'all' ? undefined : storeId,
    })
    setSubmitting(false)
    if (res.success) {
      toast.success('Bloqueo creado')
      setTitle('')
      setReason('')
      setBlockDate('')
      setAllDay(true)
      loadBlocks()
    } else {
      toast.error(res.error || 'Error al crear bloqueo')
    }
  }

  async function confirmDelete() {
    if (!deleteTargetId) return
    setDeleting(true)
    const res = await deleteScheduleBlock({ id: deleteTargetId })
    setDeleting(false)
    setDeleteTargetId(null)
    if (res.success) {
      toast.success('Bloqueo eliminado')
      loadBlocks()
    } else {
      toast.error(res.error || 'Error al eliminar')
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-amber-600" />
          Bloqueos de agenda
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Bloquea días completos o franjas horarias para impedir reservas de citas. Los domingos y sábados tarde ya están cerrados automáticamente.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Formulario de creación */}
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div>
            <Label htmlFor="block-title" className="text-xs">Motivo *</Label>
            <Input
              id="block-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Evento privado, Festivo..."
              className="h-9 bg-white"
              required
            />
          </div>
          <div>
            <Label htmlFor="block-date" className="text-xs">Fecha *</Label>
            <Input
              id="block-date"
              type="date"
              value={blockDate}
              onChange={e => setBlockDate(e.target.value)}
              min={today}
              className="h-9 bg-white"
              required
            />
          </div>
          <div>
            <Label htmlFor="block-store" className="text-xs">Tienda</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las tiendas</SelectItem>
                {stores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="all-day"
                checked={allDay}
                onCheckedChange={setAllDay}
              />
              <Label htmlFor="all-day" className="text-xs whitespace-nowrap">Día completo</Label>
            </div>
            <Button type="submit" size="sm" disabled={submitting} className="gap-1 bg-amber-600 hover:bg-amber-700 shrink-0">
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Bloquear
            </Button>
          </div>

          {!allDay && (
            <>
              <div>
                <Label htmlFor="block-start" className="text-xs">Hora inicio</Label>
                <Input
                  id="block-start"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="h-9 bg-white"
                />
              </div>
              <div>
                <Label htmlFor="block-end" className="text-xs">Hora fin</Label>
                <Input
                  id="block-end"
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="h-9 bg-white"
                />
              </div>
              <div>
                <Label htmlFor="block-reason" className="text-xs">Descripción</Label>
                <Input
                  id="block-reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Descripción opcional"
                  className="h-9 bg-white"
                />
              </div>
            </>
          )}
        </form>

        {/* Lista de bloqueos activos */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando bloqueos...
          </div>
        ) : blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No hay bloqueos activos.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{blocks.length} bloqueo{blocks.length > 1 ? 's' : ''} activo{blocks.length > 1 ? 's' : ''}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {blocks.map(b => (
                <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border bg-white p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ShieldBan className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <p className="text-sm font-medium truncate">{b.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(b.block_date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {b.all_day
                        ? ' — Todo el día'
                        : ` — ${b.start_time}–${b.end_time}`}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {b.store_name
                        ? <Badge variant="outline" className="text-[10px] h-4">{b.store_name}</Badge>
                        : <Badge variant="outline" className="text-[10px] h-4">Todas</Badge>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => setDeleteTargetId(b.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar bloque?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este bloque de horario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>No, volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={confirmDelete}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
