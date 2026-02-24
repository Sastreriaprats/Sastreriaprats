'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, CheckCircle2, XCircle, Ban, Calendar, Globe, Phone, Settings } from 'lucide-react'
import { listClientAppointments } from '@/actions/calendar'
import { formatDate } from '@/lib/utils'

const typeLabels: Record<string, string> = {
  fitting: 'Prueba', delivery: 'Entrega', consultation: 'Consulta',
  boutique: 'Boutique', meeting: 'Reunión', other: 'Otro',
}

const statusConfig: Record<string, { label: string; color: string; icon?: React.ReactNode }> = {
  scheduled: { label: 'Programada', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  confirmed: { label: 'Confirmada', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  completed: { label: 'Acudió', color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: <Ban className="h-3 w-3" /> },
  no_show: { label: 'No acudió', color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="h-3 w-3" /> },
}

const sourceIcons: Record<string, React.ReactNode> = {
  online: <Globe className="h-3 w-3 text-blue-500" title="Online" />,
  phone: <Phone className="h-3 w-3 text-green-600" title="Teléfono" />,
  admin: <Settings className="h-3 w-3 text-gray-400" title="Panel" />,
}

export function ClientAppointmentsTab({ clientId }: { clientId: string }) {
  const [appointments, setAppointments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listClientAppointments({ client_id: clientId }).then(result => {
      if (result.success && result.data) {
        setAppointments(result.data as any[])
      }
      setIsLoading(false)
    })
  }, [clientId])

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  const total = appointments.length
  const completed = appointments.filter(a => a.status === 'completed').length
  const noShow = appointments.filter(a => a.status === 'no_show').length
  const cancelled = appointments.filter(a => a.status === 'cancelled').length
  const pending = appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length
  const attendanceRate = (completed + noShow) > 0 ? Math.round((completed / (completed + noShow)) * 100) : null

  return (
    <div className="space-y-5">
      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-3 pb-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />Total citas</p>
          <p className="text-xl font-bold">{total}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-3">
          <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Acudió</p>
          <p className="text-xl font-bold text-green-700">{completed}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-3">
          <p className="text-xs text-red-500 flex items-center gap-1"><XCircle className="h-3 w-3" />No acudió</p>
          <p className="text-xl font-bold text-red-600">{noShow}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Ban className="h-3 w-3" />Canceladas</p>
          <p className="text-xl font-bold text-gray-500">{cancelled}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-3">
          <p className="text-xs text-muted-foreground">% Asistencia</p>
          <p className={`text-xl font-bold ${attendanceRate !== null ? (attendanceRate >= 70 ? 'text-green-700' : 'text-amber-600') : 'text-muted-foreground'}`}>
            {attendanceRate !== null ? `${attendanceRate}%` : '—'}
          </p>
        </CardContent></Card>
      </div>

      {/* Tabla */}
      {total === 0 ? (
        <div className="rounded-lg border py-16 text-center text-muted-foreground">
          <Calendar className="mx-auto h-8 w-8 mb-2 opacity-30" />
          <p>Este cliente no tiene citas registradas</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead>Sastre</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map((a) => {
                const sc = statusConfig[a.status] || statusConfig.scheduled
                const isPast = a.date < new Date().toISOString().split('T')[0]
                return (
                  <TableRow key={a.id} className={a.status === 'cancelled' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium text-sm whitespace-nowrap">
                      {formatDate(a.date)}
                      {!isPast && a.status !== 'cancelled' && (
                        <Badge variant="outline" className="ml-1 text-[10px] text-blue-600 border-blue-200 px-1">Próxima</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-mono whitespace-nowrap">
                      {String(a.start_time).slice(0, 5)} – {String(a.end_time).slice(0, 5)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{typeLabels[a.type] || a.type}</Badge>
                    </TableCell>
                    <TableCell className={`text-sm ${a.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}`}>
                      {a.title}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.stores?.name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.profiles?.full_name || '—'}</TableCell>
                    <TableCell>
                      <span title={a.source}>{sourceIcons[a.source] || null}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs flex items-center gap-1 w-fit ${sc.color}`}>
                        {sc.icon}{sc.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
