'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, Plus, Shirt, Printer, FileDown, MoreHorizontal, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import {
  listAlterations,
  createAlteration,
} from '@/actions/alterations'
import { createClient } from '@/lib/supabase/client'
import {
  type AlterationWithRelations,
  ALTERATION_STATUS_LABELS,
  ALTERATION_STATUS_COLORS,
} from '@/types/alterations'
import { downloadAlterationPdf, printAlterationPdf } from '@/lib/pdf/alteration-pdf'

export function ClientAlterationsTab({
  clientId,
  clientName,
  clientPhone,
  basePath = '/admin',
}: {
  clientId: string
  clientName?: string
  clientPhone?: string | null
  basePath?: string
}) {
  const [items, setItems] = useState<AlterationWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [officials, setOfficials] = useState<{ id: string; name: string; specialty: string | null }[]>([])
  const [form, setForm] = useState({
    phone: clientPhone ?? '',
    garment_type: '',
    official_id: '',
    description: '',
    alteration_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  const phoneInitRef = useRef(false)
  useEffect(() => {
    if (!phoneInitRef.current && clientPhone) {
      setForm((f) => ({ ...f, phone: clientPhone }))
      phoneInitRef.current = true
    }
  }, [clientPhone])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await listAlterations({
        clientId,
        status: statusFilter === 'all' ? undefined : (statusFilter as never),
        from: dateFrom || undefined,
        to: dateTo || undefined,
        pageSize: 100,
      })
      if (res.success && res.data) setItems(res.data.data)
    } catch (err) {
      console.error('[ClientAlterationsTab] load', err)
    } finally {
      setIsLoading(false)
    }
  }, [clientId, statusFilter, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!createOpen) return
    let cancelled = false
    async function loadOfficials() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('officials')
          .select('id, name, specialty')
          .eq('is_active', true)
          .order('name')
        if (!cancelled && data) {
          setOfficials(data as { id: string; name: string; specialty: string | null }[])
        }
      } catch (err) {
        console.error('[ClientAlterationsTab] loadOfficials', err)
      }
    }
    loadOfficials()
    return () => { cancelled = true }
  }, [createOpen])

  const resetForm = () => {
    setForm({
      phone: clientPhone ?? '',
      garment_type: '',
      official_id: '',
      description: '',
      alteration_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
  }

  const handleCreate = async () => {
    if (!form.description.trim()) {
      toast.error('Describe el arreglo')
      return
    }
    setCreating(true)
    try {
      const res = await createAlteration({
        client_id: clientId,
        phone: form.phone.trim() || null,
        garment_type: form.garment_type.trim() || null,
        official_id: form.official_id || null,
        description: form.description.trim(),
        alteration_date: form.alteration_date,
        notes: form.notes.trim() || null,
      })
      if (!res.success || !res.data) {
        toast.error('error' in res ? res.error : 'Error al crear arreglo')
        return
      }
      const created = res.data
      toast.success(`Arreglo ${created.alteration_number} creado`, {
        action: {
          label: 'Descargar PDF',
          onClick: () => downloadAlterationPdf(created.id),
        },
      })
      setCreateOpen(false)
      resetForm()
      load()
    } finally {
      setCreating(false)
    }
  }


  const filteredCount = items.length

  const handleDownload = async (id: string) => {
    try {
      await downloadAlterationPdf(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar PDF')
    }
  }

  const handlePrint = async (id: string) => {
    try {
      await printAlterationPdf(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al imprimir')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Estado</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="sent">Enviados al taller</SelectItem>
                <SelectItem value="ready">Listos</SelectItem>
                <SelectItem value="delivered">Entregados</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-9" />
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nuevo arreglo
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCount === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shirt className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p>Este cliente todavía no tiene arreglos registrados.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Prenda</TableHead>
                  <TableHead>Oficial</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => {
                  const officialName = a.official_name || a.official?.name || '—'
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-sm">
                        <Link href={`${basePath}/arreglos/${a.id}`} className="hover:underline">
                          {a.alteration_number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(a.alteration_date)}</TableCell>
                      <TableCell className="text-sm">{a.garment_type || '—'}</TableCell>
                      <TableCell className="text-sm">{officialName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ALTERATION_STATUS_COLORS[a.status]}>
                          {ALTERATION_STATUS_LABELS[a.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`${basePath}/arreglos/${a.id}`}>
                                <ExternalLink className="mr-2 h-4 w-4" /> Ver detalle
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(a.id)}>
                              <FileDown className="mr-2 h-4 w-4" /> Descargar PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePrint(a.id)}>
                              <Printer className="mr-2 h-4 w-4" /> Imprimir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Dialog: Nuevo arreglo ─── */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open && !creating) { setCreateOpen(false); resetForm() } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shirt className="h-5 w-5" /> Nuevo arreglo
            </DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para registrar un nuevo arreglo en la ficha del cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Input value={clientName ?? ''} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="—"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de prenda</Label>
                <Input
                  value={form.garment_type}
                  onChange={(e) => setForm((f) => ({ ...f, garment_type: e.target.value }))}
                  placeholder="Ej: pantalón, americana…"
                />
              </div>
              <div className="space-y-1">
                <Label>Oficial</Label>
                <Select
                  value={form.official_id || 'none'}
                  onValueChange={(v) => setForm((f) => ({ ...f, official_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona oficial" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin asignar —</SelectItem>
                    {officials.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Arreglos *</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe los arreglos a realizar…"
              />
            </div>

            <div className="space-y-1">
              <Label>Fecha del arreglo</Label>
              <Input
                type="date"
                value={form.alteration_date}
                onChange={(e) => setForm((f) => ({ ...f, alteration_date: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Observaciones internas</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notas internas (no aparecen en la ficha del cliente)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm() }} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !form.description.trim()}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crear arreglo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
