'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Eye, FileText, Plus, RefreshCw, Upload, CheckCircle2, Ban, Truck, Info } from 'lucide-react'
import { toast } from 'sonner'
import {
  getDeliveryNotes,
  getDeliveryNote,
  confirmDeliveryNote,
  cancelDeliveryNote,
  getSupplierDeliveryNotes,
  markSupplierDeliveryNoteReceived,
  uploadSupplierDeliveryNoteAttachment,
} from '@/actions/delivery-notes'
import { generateDeliveryNotePdf } from '@/lib/delivery-note-pdf'
import { formatDate } from '@/lib/utils'

const ownTypeLabels: Record<string, string> = {
  traspaso: 'Traspaso',
  entrada_stock: 'Entrada stock',
  salida_stock: 'Salida stock',
  ajuste: 'Ajuste',
}

const ownStatusLabels: Record<string, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  anulado: 'Anulado',
}

const supplierStatusLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  recibido: 'Recibido',
  incidencia: 'Incidencia',
}

export function AlbaranesContent() {
  const router = useRouter()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const uploadTargetIdRef = useRef<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('propios')

  const [ownRows, setOwnRows] = useState<any[]>([])
  const [ownStatus, setOwnStatus] = useState('all')
  const [ownType, setOwnType] = useState('all')
  const [ownSearch, setOwnSearch] = useState('')
  const [ownDateFrom, setOwnDateFrom] = useState('')
  const [ownDateTo, setOwnDateTo] = useState('')

  const [supplierRows, setSupplierRows] = useState<any[]>([])
  const [supplierStatus, setSupplierStatus] = useState('all')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierDateFrom, setSupplierDateFrom] = useState('')
  const [supplierDateTo, setSupplierDateTo] = useState('')

  const [loadingOwn, setLoadingOwn] = useState(false)
  const [loadingSupplier, setLoadingSupplier] = useState(false)

  const loadOwn = useCallback(async () => {
    setLoadingOwn(true)
    try {
      const res = await getDeliveryNotes({
        type: ownType,
        status: ownStatus,
        page: 1,
        limit: 50,
        fromDate: ownDateFrom || undefined,
        toDate: ownDateTo || undefined,
        search: ownSearch || undefined,
      })
      if (res.success && res.data) setOwnRows(res.data.data)
      else setOwnRows([])
    } finally {
      setLoadingOwn(false)
    }
  }, [ownDateFrom, ownDateTo, ownSearch, ownStatus, ownType])

  const loadSupplier = useCallback(async () => {
    setLoadingSupplier(true)
    try {
      const res = await getSupplierDeliveryNotes({
        status: supplierStatus,
        page: 1,
        limit: 50,
        fromDate: supplierDateFrom || undefined,
        toDate: supplierDateTo || undefined,
        search: supplierSearch || undefined,
      })
      if (res.success && res.data) setSupplierRows(res.data.data)
      else setSupplierRows([])
    } finally {
      setLoadingSupplier(false)
    }
  }, [supplierDateFrom, supplierDateTo, supplierSearch, supplierStatus])

  useEffect(() => { loadOwn() }, [loadOwn])
  useEffect(() => { loadSupplier() }, [loadSupplier])

  const printOwn = async (id: string) => {
    const res = await getDeliveryNote(id)
    if (!res.success || !res.data) return toast.error('No se pudo cargar el albarán')
    await generateDeliveryNotePdf(res.data)
  }

  const onUploadPdf = async (file: File | null) => {
    const targetId = uploadTargetIdRef.current || uploadingId
    if (!file || !targetId) {
      toast.error('No se pudo identificar el albarán para subir el PDF')
      return
    }
    const fd = new FormData()
    fd.append('id', targetId)
    fd.append('file', file)
    const res = await uploadSupplierDeliveryNoteAttachment(fd)
    if (res.success) {
      toast.success('PDF subido')
      uploadTargetIdRef.current = null
      setUploadingId(null)
      loadSupplier()
    } else {
      toast.error(res.error || 'No se pudo subir el PDF')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Albaranes</h1>
          <p className="text-muted-foreground">Gestión de albaranes propios y albaranes de proveedor</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => router.push('/admin/proveedores')}>
            <Truck className="h-4 w-4" /> Recibir pedido de proveedor
          </Button>
          <Button className="gap-2 bg-prats-navy hover:bg-prats-navy-light" onClick={() => router.push('/admin/almacen/albaranes/nuevo')}>
            <Plus className="h-4 w-4" /> Nuevo albarán
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <Info className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
        <div>
          <p className="font-medium">¿Cómo registrar la recepción de un pedido a proveedor?</p>
          <p className="mt-1 text-blue-800">
            Ve a <strong>Proveedores</strong> → selecciona el proveedor → abre el pedido → pulsa <strong>Registrar recepción</strong>.
            Allí podrás indicar las cantidades recibidas y el sistema actualizará el stock automáticamente.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="propios">Albaranes propios</TabsTrigger>
          <TabsTrigger value="proveedor">Albaranes proveedor</TabsTrigger>
        </TabsList>

        <TabsContent value="propios" className="space-y-4 mt-5">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <Input placeholder="Buscar por número..." value={ownSearch} onChange={(e) => setOwnSearch(e.target.value)} />
                <Select value={ownType} onValueChange={setOwnType}>
                  <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    {Object.entries(ownTypeLabels).map(([k, v]) => <SelectItem value={k} key={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={ownStatus} onValueChange={setOwnStatus}>
                  <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {Object.entries(ownStatusLabels).map(([k, v]) => <SelectItem value={k} key={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <DatePickerPopover id="own-from" value={ownDateFrom} onChange={setOwnDateFrom} />
                <DatePickerPopover id="own-to" value={ownDateTo} onChange={setOwnDateTo} />
                <Button variant="outline" className="gap-2" onClick={loadOwn}><RefreshCw className="h-4 w-4" />Filtrar</Button>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origen → Destino</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingOwn ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : ownRows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Sin albaranes</TableCell></TableRow>
                ) : ownRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">{row.number}</TableCell>
                    <TableCell><Badge variant="outline">{ownTypeLabels[row.type] || row.type}</Badge></TableCell>
                    <TableCell className="text-sm">{row.from_warehouse?.name || '-'} → {row.to_warehouse?.name || '-'}</TableCell>
                    <TableCell className="text-sm">{row.created_by_name || 'Sistema'}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'confirmado' ? 'default' : row.status === 'anulado' ? 'destructive' : 'secondary'}>
                        {ownStatusLabels[row.status] || row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(row.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push(`/admin/almacen/albaranes/${row.id}`)}>
                          <Eye className="h-3 w-3" /> Ver
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => printOwn(row.id)}>
                          <FileText className="h-3 w-3" /> Imprimir PDF
                        </Button>
                        {row.status === 'borrador' && (
                          <Button size="sm" className="gap-1" onClick={async () => { const r = await confirmDeliveryNote(row.id); if (r.success) { toast.success('Albarán confirmado'); loadOwn() } }}>
                            <CheckCircle2 className="h-3 w-3" /> Confirmar
                          </Button>
                        )}
                        {row.status !== 'anulado' && (
                          <Button size="sm" variant="outline" className="gap-1" onClick={async () => { const r = await cancelDeliveryNote(row.id); if (r.success) { toast.success('Albarán anulado'); loadOwn() } }}>
                            <Ban className="h-3 w-3" /> Anular
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="proveedor" className="space-y-4 mt-5">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <Input placeholder="Buscar referencia proveedor..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
                <Select value={supplierStatus} onValueChange={setSupplierStatus}>
                  <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {Object.entries(supplierStatusLabels).map(([k, v]) => <SelectItem value={k} key={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <DatePickerPopover id="supplier-from" value={supplierDateFrom} onChange={setSupplierDateFrom} />
                <DatePickerPopover id="supplier-to" value={supplierDateTo} onChange={setSupplierDateTo} />
                <Button variant="outline" className="gap-2" onClick={loadSupplier}><RefreshCw className="h-4 w-4" />Filtrar</Button>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia proveedor</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Pedido vinculado</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead>Fecha entrega</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSupplier ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : supplierRows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Sin albaranes</TableCell></TableRow>
                ) : supplierRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">{row.supplier_reference || '-'}</TableCell>
                    <TableCell>{row.suppliers?.name || '-'}</TableCell>
                    <TableCell>{row.supplier_orders?.order_number || '-'}</TableCell>
                    <TableCell className="text-sm">{row.created_by_name || 'Sistema'}</TableCell>
                    <TableCell>{row.delivery_date ? formatDate(row.delivery_date) : '-'}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'recibido' ? 'default' : row.status === 'incidencia' ? 'destructive' : 'secondary'}>
                        {supplierStatusLabels[row.status] || row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => {
                            uploadTargetIdRef.current = row.id
                            setUploadingId(row.id)
                            uploadInputRef.current?.click()
                          }}
                        >
                          <Upload className="h-3 w-3" /> Subir PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={!row.attachment_url}
                          onClick={() => row.attachment_url && window.open(row.attachment_url, '_blank')}
                        >
                          <Eye className="h-3 w-3" /> Ver PDF
                        </Button>
                        {row.status !== 'recibido' && (
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={async () => {
                              const r = await markSupplierDeliveryNoteReceived(row.id)
                              if (r.success) {
                                toast.success('Marcado como recibido')
                                loadSupplier()
                              }
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3" /> Marcar recibido
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        accept="application/pdf"
        onChange={(e) => onUploadPdf(e.target.files?.[0] || null)}
      />
    </div>
  )
}
