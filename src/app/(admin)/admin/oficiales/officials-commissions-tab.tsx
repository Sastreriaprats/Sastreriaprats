'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import {
  getOfficialsCommissions, settleOfficialCommissions, getOfficialSettlements,
  type OfficialCommission, type OfficialSettlementRow,
} from '@/actions/reports'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { formatCurrency } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { Loader2, ChevronDown, ChevronRight, Info, AlertTriangle, Wallet } from 'lucide-react'
import { toast } from 'sonner'

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('es-ES') : '—'
}

const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Transferencia' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'bizum', label: 'Bizum' },
  { value: 'other', label: 'Otro' },
]

/**
 * Pestaña "Comisiones" de /admin/oficiales. R9a (informe del pendiente) + R9b (liquidar).
 * Reusa DatePickerPopover, tablas, Dialog, Select del admin. Lenguaje de usuario:
 * Pendiente, Liquidado, Liquidar, Fecha de pago. El diálogo de pago es deliberado
 * (muestra el importe a pagar antes de confirmar). Gating: ver = reports.view (la
 * pestaña); liquidar = accounting.edit (mueve dinero).
 */
export function OfficialsCommissionsTab({ onGoToOficiales }: { onGoToOficiales: () => void }) {
  const { can } = usePermissions()
  const canSettle = can('accounting.edit')

  const [range, setRange] = useState({ start: monthStart(), end: today() })
  const [data, setData] = useState<OfficialCommission[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Historial de liquidaciones por oficial (se carga al expandir; cache simple).
  const [history, setHistory] = useState<Record<string, OfficialSettlementRow[]>>({})

  // Diálogo de liquidación
  const [settleTarget, setSettleTarget] = useState<OfficialCommission | null>(null)
  const [form, setForm] = useState({ paid_at: today(), payment_method: '', reference: '', notes: '' })
  const [isSettling, setIsSettling] = useState(false)

  const setRangeField = useCallback((field: 'start' | 'end', value: string) => {
    setLoading(true)
    setRange((p) => ({ ...p, [field]: value }))
  }, [])

  useEffect(() => {
    let active = true
    getOfficialsCommissions({ start_date: range.start, end_date: range.end }).then((res) => {
      if (!active) return
      if (res.success) setData(res.data)
      else { toast.error(res.error ?? 'Error al cargar las comisiones'); setData([]) }
      setLoading(false)
    })
    return () => { active = false }
  }, [range.start, range.end, reloadKey])

  const loadHistory = useCallback((officialId: string) => {
    getOfficialSettlements({ official_id: officialId }).then((res) => {
      if (res.success) setHistory((h) => ({ ...h, [officialId]: res.data }))
    })
  }, [])

  const toggleExpand = (officialId: string, canExpand: boolean) => {
    if (!canExpand) return
    const opening = expanded !== officialId
    setExpanded(opening ? officialId : null)
    if (opening && !history[officialId]) loadHistory(officialId)
  }

  const openSettle = (o: OfficialCommission) => {
    setForm({ paid_at: today(), payment_method: '', reference: '', notes: '' })
    setSettleTarget(o)
  }

  const confirmSettle = async () => {
    if (!settleTarget) return
    setIsSettling(true)
    const res = await settleOfficialCommissions({
      official_id: settleTarget.official_id,
      period_start: range.start,
      period_end: range.end,
      paid_at: form.paid_at,
      payment_method: form.payment_method || null,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    })
    setIsSettling(false)
    if (res.success) {
      toast.success(`Liquidados ${formatCurrency(settleTarget.total_amount)} a ${settleTarget.official_name}`)
      const oid = settleTarget.official_id
      setSettleTarget(null)
      setHistory((h) => { const c = { ...h }; delete c[oid]; return c }) // invalidar historial
      setReloadKey((k) => k + 1) // refetch del informe
    } else {
      // Mensaje legible (p.ej. guard anti-doble-pago), no error crudo.
      toast.error(res.error ?? 'No se pudo registrar la liquidación')
    }
  }

  const hasDevengo = data.some((o) => o.garments_count > 0)
  const hasUntariffed = data.some((o) => o.untariffed_count > 0)
  const totalPendiente = data.reduce((s, o) => s + o.total_amount, 0)

  return (
    <div className="space-y-4">
      {/* Periodo */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Periodo</Label>
          <div className="flex items-center gap-2">
            <DatePickerPopover containerClassName="w-36 h-9" value={range.start} onChange={(d) => setRangeField('start', d)} />
            <span className="text-sm text-muted-foreground">a</span>
            <DatePickerPopover containerClassName="w-36 h-9" value={range.end} onChange={(d) => setRangeField('end', d)} />
          </div>
        </div>
        {!loading && hasDevengo && (
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Pendiente del periodo</p>
            <p className="text-2xl font-bold text-prats-navy">{formatCurrency(totalPendiente)}</p>
          </div>
        )}
      </div>

      {/* Aviso de tarifas pendientes */}
      {!loading && hasUntariffed && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-medium">Hay oficiales con prendas asignadas sin tarifa.</p>
            <p className="text-amber-800">Carga sus tarifas para que esas prendas cuenten en el informe.</p>
          </div>
          <Button variant="outline" size="sm" className="border-amber-400 text-amber-900 hover:bg-amber-100" onClick={onGoToOficiales}>
            Cargar tarifas
          </Button>
        </div>
      )}

      {/* Estado vacío de comisiones */}
      {!loading && !hasDevengo && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <Info className="h-5 w-5 shrink-0 text-prats-navy" />
          <p className="text-muted-foreground">
            Aún no hay prendas terminadas con oficial asignado en este periodo. Las comisiones aparecerán
            según se marquen las prendas como terminadas o entregadas.
          </p>
        </div>
      )}

      {/* Tabla por oficial */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8" />
                <TableHead>Oficial</TableHead>
                <TableHead className="text-right">Prendas</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead className="text-right">Liquidado</TableHead>
                <TableHead>Sin tarifar</TableHead>
                {canSettle && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canSettle ? 7 : 6} className="h-32 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-prats-navy" />
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canSettle ? 7 : 6} className="h-24 text-center text-muted-foreground">
                    No hay oficiales con prendas asignadas en este periodo.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((o) => {
                  const canExpand = o.lines.length > 0 || (history[o.official_id]?.length ?? 0) > 0 || o.settled_amount > 0
                  const isOpen = expanded === o.official_id
                  return (
                    <Fragment key={o.official_id}>
                      <TableRow
                        className={canExpand ? 'cursor-pointer hover:bg-muted/30' : ''}
                        onClick={() => toggleExpand(o.official_id, canExpand)}
                      >
                        <TableCell>
                          {canExpand ? (isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />) : null}
                        </TableCell>
                        <TableCell className="font-medium">{o.official_name}</TableCell>
                        <TableCell className="text-right">{o.garments_count}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(o.total_amount)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {o.settled_amount > 0 ? formatCurrency(o.settled_amount) : '—'}
                        </TableCell>
                        <TableCell>
                          {o.untariffed_count > 0 ? (
                            <Badge variant="outline" className="border-amber-400 bg-amber-50 font-normal text-amber-800 whitespace-normal">
                              {o.untariffed_count} prenda{o.untariffed_count !== 1 ? 's' : ''} sin tarifa
                              {o.untariffed_specialties.length ? ` (${o.untariffed_specialties.join(', ')})` : ''}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {canSettle && (
                          <TableCell className="text-right">
                            {o.total_amount > 0 ? (
                              <Button
                                size="sm"
                                className="gap-1 h-8 bg-prats-navy hover:bg-prats-navy/90 text-white"
                                onClick={(e) => { e.stopPropagation(); openSettle(o) }}
                              >
                                <Wallet className="h-3.5 w-3.5" /> Liquidar
                              </Button>
                            ) : null}
                          </TableCell>
                        )}
                      </TableRow>
                      {isOpen && canExpand && (
                        <TableRow className="bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={canSettle ? 6 : 5} className="space-y-4 py-3">
                            {/* Prendas pendientes */}
                            {o.lines.length > 0 && (
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">Prendas pendientes de liquidar</p>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-xs">Pedido</TableHead>
                                      <TableHead className="text-xs">Prenda</TableHead>
                                      <TableHead className="text-xs">Especialidad</TableHead>
                                      <TableHead className="text-xs text-right">Tarifa</TableHead>
                                      <TableHead className="text-xs text-right">Importe</TableHead>
                                      <TableHead className="text-xs">Terminada el</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {o.lines.map((l) => (
                                      <TableRow key={l.line_id}>
                                        <TableCell className="text-sm">{l.order_number ?? '—'}</TableCell>
                                        <TableCell className="text-sm">{l.garment ?? '—'}</TableCell>
                                        <TableCell className="text-sm">{l.specialty}</TableCell>
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(l.unit_price)}{l.quantity > 1 ? ` ×${l.quantity}` : ''}
                                        </TableCell>
                                        <TableCell className="text-right text-sm">{formatCurrency(l.amount)}</TableCell>
                                        <TableCell className="text-sm">{fmtDate(l.finished_at)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                            {/* Historial de liquidaciones */}
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">Liquidaciones</p>
                              {history[o.official_id] === undefined ? (
                                <p className="text-xs text-muted-foreground">Cargando…</p>
                              ) : history[o.official_id].length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin liquidaciones todavía.</p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-xs">Fecha de pago</TableHead>
                                      <TableHead className="text-xs">Periodo</TableHead>
                                      <TableHead className="text-xs text-right">Prendas</TableHead>
                                      <TableHead className="text-xs text-right">Importe</TableHead>
                                      <TableHead className="text-xs">Método</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {history[o.official_id].map((s) => (
                                      <TableRow key={s.id}>
                                        <TableCell className="text-sm">{fmtDate(s.paid_at)}</TableCell>
                                        <TableCell className="text-sm">{fmtDate(s.period_start)} – {fmtDate(s.period_end)}</TableCell>
                                        <TableCell className="text-right text-sm">{s.garments_count}</TableCell>
                                        <TableCell className="text-right text-sm font-medium">{formatCurrency(s.total_amount)}</TableCell>
                                        <TableCell className="text-sm">{PAYMENT_METHODS.find((m) => m.value === s.payment_method)?.label ?? '—'}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </TableCell>
                          {canSettle && <TableCell />}
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Diálogo de liquidación (PAGO — deliberado) */}
      <Dialog open={!!settleTarget} onOpenChange={(open) => !open && setSettleTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-prats-navy">Liquidar comisiones</DialogTitle>
          </DialogHeader>
          {settleTarget && (
            <div className="space-y-4">
              {/* Qué se paga — claro y grande */}
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Vas a registrar el pago a <span className="font-medium text-foreground">{settleTarget.official_name}</span>
                </p>
                <p className="my-1 text-3xl font-bold text-prats-navy">{formatCurrency(settleTarget.total_amount)}</p>
                <p className="text-sm text-muted-foreground">
                  {settleTarget.garments_count} prenda{settleTarget.garments_count !== 1 ? 's' : ''} · periodo {fmtDate(range.start)} – {fmtDate(range.end)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fecha de pago</Label>
                  <DatePickerPopover containerClassName="h-9" value={form.paid_at} onChange={(d) => setForm((f) => ({ ...f, paid_at: d }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Método de pago</Label>
                  <Select value={form.payment_method || undefined} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Referencia (opcional)</Label>
                <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Nº de transferencia, recibo…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)} disabled={isSettling}>Cancelar</Button>
            <Button className="bg-prats-navy hover:bg-prats-navy/90 text-white" onClick={confirmSettle} disabled={isSettling}>
              {isSettling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
              {settleTarget ? `Liquidar ${formatCurrency(settleTarget.total_amount)} a ${settleTarget.official_name}` : 'Liquidar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
