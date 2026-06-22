'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { getOfficialsCommissions, type OfficialCommission } from '@/actions/reports'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { formatCurrency } from '@/lib/utils'
import { Loader2, ChevronDown, ChevronRight, Info, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Pestaña "Comisiones" de /admin/oficiales. Consume getOfficialsCommissions
 * (devengo por prenda terminada/entregada en el periodo). Reusa el DatePickerPopover,
 * las tablas y tarjetas del admin. Lenguaje de usuario: Prendas, Importe, Sin tarifar,
 * Periodo, "terminadas/entregadas" (sin jerga técnica).
 */
export function OfficialsCommissionsTab({ onGoToOficiales }: { onGoToOficiales: () => void }) {
  const [range, setRange] = useState({ start: monthStart(), end: today() })
  const [data, setData] = useState<OfficialCommission[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Cambiar el periodo activa el indicador de carga (en el handler, no en el efecto)
  // y dispara el re-fetch vía las deps del efecto.
  const setRangeField = useCallback((field: 'start' | 'end', value: string) => {
    setLoading(true)
    setRange((p) => ({ ...p, [field]: value }))
  }, [])

  // El efecto solo escribe estado DESPUÉS del await (no sincrónicamente).
  useEffect(() => {
    let active = true
    getOfficialsCommissions({ start_date: range.start, end_date: range.end }).then((res) => {
      if (!active) return
      if (res.success) setData(res.data)
      else {
        toast.error(res.error ?? 'Error al cargar las comisiones')
        setData([])
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [range.start, range.end])

  const hasDevengo = data.some((o) => o.garments_count > 0)
  const hasUntariffed = data.some((o) => o.untariffed_count > 0)
  const totalImporte = data.reduce((s, o) => s + o.total_amount, 0)

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
            <p className="text-xs text-muted-foreground">Total del periodo</p>
            <p className="text-2xl font-bold text-prats-navy">{formatCurrency(totalImporte)}</p>
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
                <TableHead className="text-right">Importe</TableHead>
                <TableHead>Sin tarifar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-prats-navy" />
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No hay oficiales con prendas asignadas en este periodo.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((o) => {
                  const canExpand = o.lines.length > 0
                  const isOpen = expanded === o.official_id
                  return (
                    <Fragment key={o.official_id}>
                      <TableRow
                        className={canExpand ? 'cursor-pointer hover:bg-muted/30' : ''}
                        onClick={() => canExpand && setExpanded(isOpen ? null : o.official_id)}
                      >
                        <TableCell>
                          {canExpand ? (isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />) : null}
                        </TableCell>
                        <TableCell className="font-medium">{o.official_name}</TableCell>
                        <TableCell className="text-right">{o.garments_count}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(o.total_amount)}</TableCell>
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
                      </TableRow>
                      {isOpen && canExpand && (
                        <TableRow className="bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={4} className="p-0">
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
                                    <TableCell className="text-sm">
                                      {l.finished_at ? new Date(l.finished_at).toLocaleDateString('es-ES') : '—'}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
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
    </div>
  )
}
