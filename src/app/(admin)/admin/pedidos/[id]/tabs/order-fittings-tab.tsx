'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Calendar, Loader2 } from 'lucide-react'
import { useAction } from '@/hooks/use-action'
import { usePermissions } from '@/hooks/use-permissions'
import { scheduleFitting } from '@/actions/orders'
import { formatDate } from '@/lib/utils'

const fittingStatusLabels: Record<string, string> = { scheduled: 'Programada', completed: 'Completada', no_show: 'No presentado', cancelled: 'Cancelada', rescheduled: 'Reprogramada' }
const fittingStatusColors: Record<string, string> = { scheduled: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700', no_show: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-700', rescheduled: 'bg-amber-100 text-amber-700' }

export function OrderFittingsTab({ orderId, fittings, storeId }: { orderId: string; fittings: any[]; storeId: string }) {
  const { can } = usePermissions()
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState({ date: '', time: '10:00', notes: '' })

  const { execute, isLoading } = useAction(scheduleFitting, {
    successMessage: 'Prueba programada',
    onSuccess: () => { setShowDialog(false); setForm({ date: '', time: '10:00', notes: '' }) },
  })

  const sorted = [...fittings].sort((a, b) => a.fitting_number - b.fitting_number)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Pruebas ({fittings.length})</h3>
        {can('orders.edit') && (
          <Button onClick={() => setShowDialog(true)} size="sm" className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
            <Plus className="h-4 w-4" /> Programar prueba
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Calendar className="mx-auto h-12 w-12 mb-4 opacity-30" /><p>No hay pruebas programadas.</p></div>
      ) : (
        <div className="space-y-3">
          {sorted.map((f: any) => (
            <Card key={f.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground">#{f.fitting_number}</span>
                    <div>
                      <p className="font-medium">{formatDate(f.scheduled_date)} a las {f.scheduled_time?.slice(0, 5)}</p>
                      <p className="text-xs text-muted-foreground">{f.duration_minutes || 30} min</p>
                    </div>
                  </div>
                  <Badge className={`text-xs ${fittingStatusColors[f.status] || ''}`}>{fittingStatusLabels[f.status] || f.status}</Badge>
                </div>
                {f.adjustments_needed && <p className="text-sm mt-2"><span className="text-muted-foreground">Ajustes:</span> {f.adjustments_needed}</p>}
                {f.notes && <p className="text-sm text-muted-foreground mt-1 italic">&quot;{f.notes}&quot;</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Programar prueba</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Fecha *</Label><Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Hora *</Label><Input type="time" value={form.time} onChange={(e) => setForm(p => ({ ...p, time: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => execute({ orderId, date: form.date, time: form.time, storeId, notes: form.notes })}
              disabled={isLoading || !form.date} className="bg-prats-navy hover:bg-prats-navy-light">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Programar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
