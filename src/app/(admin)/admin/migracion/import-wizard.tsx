'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft, ArrowRight, Upload, FileSpreadsheet, CheckCircle, XCircle,
  AlertTriangle, Loader2, Eye, Columns, Play, PartyPopper,
} from 'lucide-react'
import { toast } from 'sonner'
import { importClients, importProducts, importOrders, importMeasurements } from '@/actions/migration'
import { useAuth } from '@/components/providers/auth-provider'
import { cn } from '@/lib/utils'

const targetFields: Record<string, { field: string; label: string; required?: boolean }[]> = {
  clients: [
    { field: 'original_id', label: 'ID original' },
    { field: 'client_code', label: 'Código cliente' },
    { field: 'first_name', label: 'Nombre', required: true },
    { field: 'last_name', label: 'Apellidos' },
    { field: 'full_name', label: 'Nombre completo' },
    { field: 'email', label: 'Email' },
    { field: 'phone', label: 'Teléfono' },
    { field: 'phone_secondary', label: 'Teléfono 2' },
    { field: 'address', label: 'Dirección' },
    { field: 'city', label: 'Ciudad' },
    { field: 'postal_code', label: 'Código postal' },
    { field: 'province', label: 'Provincia' },
    { field: 'country', label: 'País' },
    { field: 'category', label: 'Categoría' },
    { field: 'notes', label: 'Notas' },
  ],
  products: [
    { field: 'original_id', label: 'ID original' },
    { field: 'name', label: 'Nombre', required: true },
    { field: 'sku', label: 'SKU' },
    { field: 'barcode', label: 'Código de barras' },
    { field: 'description', label: 'Descripción' },
    { field: 'price', label: 'Precio venta', required: true },
    { field: 'cost_price', label: 'Precio coste' },
    { field: 'brand', label: 'Marca' },
    { field: 'material', label: 'Material' },
    { field: 'collection', label: 'Colección' },
    { field: 'size', label: 'Talla' },
    { field: 'color', label: 'Color' },
    { field: 'color_hex', label: 'Color HEX' },
    { field: 'stock', label: 'Stock' },
    { field: 'image_url', label: 'URL imagen' },
    { field: 'product_type', label: 'Tipo producto' },
    { field: 'is_visible_web', label: 'Visible en web' },
  ],
  orders: [
    { field: 'original_id', label: 'ID original' },
    { field: 'order_number', label: 'Nº pedido' },
    { field: 'client_email', label: 'Email cliente' },
    { field: 'client_name', label: 'Nombre cliente' },
    { field: 'order_date', label: 'Fecha pedido' },
    { field: 'delivery_date', label: 'Fecha entrega' },
    { field: 'total', label: 'Total', required: true },
    { field: 'deposit', label: 'Anticipo' },
    { field: 'status', label: 'Estado' },
    { field: 'order_type', label: 'Tipo (bespoke/alteration/mtm)' },
    { field: 'notes', label: 'Notas' },
  ],
  measurements: [
    { field: 'client_email', label: 'Email cliente' },
    { field: 'client_code', label: 'Código cliente' },
    { field: 'client_name', label: 'Nombre cliente' },
    { field: 'garment_type', label: 'Tipo prenda' },
    { field: 'measured_at', label: 'Fecha medición' },
    { field: 'chest', label: 'Pecho' },
    { field: 'waist', label: 'Cintura' },
    { field: 'hip', label: 'Cadera' },
    { field: 'shoulder', label: 'Hombro' },
    { field: 'sleeve_length', label: 'Largo manga' },
    { field: 'back_length', label: 'Largo espalda' },
    { field: 'neck', label: 'Cuello' },
    { field: 'inseam', label: 'Entrepierna' },
    { field: 'thigh', label: 'Muslo' },
    { field: 'trouser_length', label: 'Largo pantalón' },
  ],
}

const entityLabels: Record<string, string> = {
  clients: 'Clientes',
  products: 'Productos',
  orders: 'Pedidos',
  measurements: 'Medidas',
}

const STEPS = ['upload', 'mapping', 'preview', 'import', 'result'] as const
type Step = (typeof STEPS)[number]

const stepLabels: Record<Step, string> = {
  upload: 'Subir CSV',
  mapping: 'Mapear columnas',
  preview: 'Previsualizar',
  import: 'Importar',
  result: 'Resultado',
}

interface ImportResult {
  imported: number
  updated?: number
  skipped?: number
  errors?: { row: number; error: string }[]
  batchId: string
}

export function ImportWizard({ entityType, onClose }: { entityType: string; onClose: () => void }) {
  const { activeStoreId } = useAuth()
  const [currentStep, setCurrentStep] = useState<Step>('upload')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [dedupField, setDedupField] = useState('email')
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)

  const fields = targetFields[entityType] || []

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) {
        toast.error('El archivo debe tener al menos una cabecera y una fila')
        return
      }

      const firstLine = lines[0]
      const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','

      const headers = parseCsvLine(firstLine, delimiter)
      setCsvHeaders(headers)

      const rows = lines.slice(1).map(line => {
        const values = parseCsvLine(line, delimiter)
        const row: Record<string, string> = {}
        headers.forEach((h, i) => { row[h] = values[i] || '' })
        return row
      })
      setCsvRows(rows)

      const autoMapping: Record<string, string> = {}
      for (const header of headers) {
        const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const match = fields.find(f =>
          f.field === normalized ||
          f.label.toLowerCase().replace(/[^a-z0-9]/g, '_') === normalized ||
          normalized.includes(f.field) ||
          f.field.includes(normalized)
        )
        if (match) autoMapping[header] = match.field
      }
      setMapping(autoMapping)

      toast.success(`${rows.length} filas detectadas`)
      setCurrentStep('mapping')
    }
    reader.readAsText(file, 'UTF-8')
  }, [fields])

  const handleImport = async () => {
    setIsImporting(true)
    setCurrentStep('import')
    setProgress(10)

    try {
      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(p + 5, 90))
      }, 500)

      let res: { success: boolean; data?: ImportResult; error?: string }

      if (entityType === 'clients') {
        res = await importClients({ rows: csvRows, mapping, dedup_field: dedupField })
      } else if (entityType === 'products') {
        res = await importProducts({ rows: csvRows, mapping, store_id: activeStoreId || '' })
      } else if (entityType === 'orders') {
        res = await importOrders({ rows: csvRows, mapping, store_id: activeStoreId || '' })
      } else {
        res = await importMeasurements({ rows: csvRows, mapping })
      }

      clearInterval(progressInterval)
      setProgress(100)

      if (res?.success && res.data) {
        setResult(res.data)
        setCurrentStep('result')
      } else {
        toast.error(res?.error || 'Error en la importación')
        setCurrentStep('preview')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado')
      setCurrentStep('preview')
    }
    setIsImporting(false)
  }

  const mapPreviewRow = useCallback((row: Record<string, string>) => {
    const result: Record<string, string> = {}
    for (const [source, target] of Object.entries(mapping)) {
      if (target) result[target] = row[source]
    }
    return result
  }, [mapping])

  const getValidationErrors = useCallback((row: Record<string, string>): string[] => {
    const errors: string[] = []
    const mapped = mapPreviewRow(row)
    for (const f of fields) {
      if (f.required && !mapped[f.field]) errors.push(`${f.label} obligatorio`)
    }
    return errors
  }, [fields, mapPreviewRow])

  const totalErrors = csvRows.reduce((s, r) => s + (getValidationErrors(r).length > 0 ? 1 : 0), 0)
  const mappedCount = Object.values(mapping).filter(Boolean).length
  const requiredMapped = fields.filter(f => f.required).every(f => Object.values(mapping).includes(f.field))
  const mappedFields = fields.filter(f => Object.values(mapping).includes(f.field))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar {entityLabels[entityType]}</h1>
          <p className="text-muted-foreground">Paso a paso desde archivo CSV</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                currentStep === step ? 'bg-prats-navy text-white border-prats-navy' :
                STEPS.indexOf(currentStep) > i ? 'bg-green-500 text-white border-green-500' :
                'border-gray-200 text-gray-400'
              )}>
                {STEPS.indexOf(currentStep) > i ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('text-xs hidden md:inline', currentStep === step ? 'font-bold text-prats-navy' : 'text-gray-400')}>
                {stepLabels[step]}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-2', STEPS.indexOf(currentStep) > i ? 'bg-green-500' : 'bg-gray-200')} />
            )}
          </div>
        ))}
      </div>

      {/* STEP 1: Upload */}
      {currentStep === 'upload' && (
        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="text-center max-w-md mx-auto">
              <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Upload className="h-8 w-8 text-gray-400" />
              </div>
              <h2 className="text-lg font-semibold text-prats-navy mb-2">Sube tu archivo CSV</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Formatos aceptados: CSV, TSV. Delimitadores: coma, punto y coma, tabulador. Codificación: UTF-8.
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-prats-navy text-white cursor-pointer hover:bg-prats-navy/90 transition-colors">
                <FileSpreadsheet className="h-4 w-4" /> Seleccionar archivo
                <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
              <p className="text-xs text-muted-foreground mt-4">
                Descarga una{' '}
                <button onClick={() => downloadTemplate(entityType)} className="text-prats-gold hover:underline">
                  plantilla de ejemplo
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Mapping */}
      {currentStep === 'mapping' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Columns className="h-5 w-5" /> Mapear columnas
                <Badge variant="outline">{mappedCount}/{csvHeaders.length} mapeadas</Badge>
              </CardTitle>
              {!requiredMapped ? (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />Faltan campos obligatorios
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {csvHeaders.map(header => (
                <div key={header} className="flex items-center gap-4 p-3 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{header}</p>
                    <p className="text-xs text-muted-foreground truncate">Ej: {csvRows[0]?.[header] || '—'}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  <Select
                    value={mapping[header] || '__skip__'}
                    onValueChange={v => setMapping(p => ({ ...p, [header]: v === '__skip__' ? '' : v }))}
                  >
                    <SelectTrigger className="w-52"><SelectValue placeholder="Omitir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">— Omitir —</SelectItem>
                      {fields.map(f => (
                        <SelectItem key={f.field} value={f.field}>
                          {f.label} {f.required ? '*' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {entityType === 'clients' && (
              <div className="mt-6 p-4 rounded-lg bg-gray-50">
                <Label className="text-xs font-semibold">Campo de deduplicación</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Si ya existe un cliente con este dato, se actualizará en vez de duplicar.
                </p>
                <Select value={dedupField} onValueChange={setDedupField}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Teléfono</SelectItem>
                    <SelectItem value="none">Sin deduplicación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setCurrentStep('upload')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
              </Button>
              <Button
                onClick={() => setCurrentStep('preview')}
                disabled={!requiredMapped}
                className="bg-prats-navy hover:bg-prats-navy/90"
              >
                Previsualizar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Preview */}
      {currentStep === 'preview' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-5 w-5" /> Preview — {csvRows.length} filas
              </CardTitle>
              <div className="flex gap-2">
                {totalErrors > 0 ? (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" />{totalErrors} con errores
                  </Badge>
                ) : null}
                <Badge className="bg-green-100 text-green-700 text-xs">{csvRows.length - totalErrors} válidas</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="w-12">Estado</TableHead>
                    {mappedFields.map(f => (
                      <TableHead key={f.field} className="text-xs">{f.label}{f.required ? ' *' : ''}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvRows.slice(0, 100).map((row, i) => {
                    const mapped = mapPreviewRow(row)
                    const errors = getValidationErrors(row)
                    return (
                      <TableRow key={i} className={errors.length > 0 ? 'bg-red-50' : ''}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          {errors.length > 0
                            ? <span title={errors.join(', ')}><XCircle className="h-4 w-4 text-red-400" /></span>
                            : <CheckCircle className="h-4 w-4 text-green-400" />}
                        </TableCell>
                        {mappedFields.map(f => (
                          <TableCell key={f.field} className={cn('text-xs', !mapped[f.field] && f.required ? 'bg-red-100' : '')}>
                            {mapped[f.field] || <span className="text-gray-300">—</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {csvRows.length > 100 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Mostrando 100 de {csvRows.length} filas
              </p>
            )}

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setCurrentStep('mapping')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
              </Button>
              <Button onClick={handleImport} className="bg-prats-navy hover:bg-prats-navy/90 gap-2">
                <Play className="h-4 w-4" /> Importar {csvRows.length} filas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Importing */}
      {currentStep === 'import' && (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-prats-navy mb-4" />
            <h2 className="text-lg font-semibold text-prats-navy">Importando datos...</h2>
            <p className="text-sm text-muted-foreground mt-1">No cierres esta ventana</p>
            <Progress value={progress} className="max-w-md mx-auto mt-6" />
            <p className="text-xs text-muted-foreground mt-2">{progress}%</p>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: Result */}
      {currentStep === 'result' && result && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center mb-8">
              <PartyPopper className="mx-auto h-12 w-12 text-prats-gold mb-4" />
              <h2 className="text-xl font-bold text-prats-navy">Importación completada</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Batch: <span className="font-mono">{result.batchId}</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8">
              <div className="text-center p-4 rounded-xl bg-green-50">
                <p className="text-3xl font-bold text-green-600">{result.imported}</p>
                <p className="text-xs text-green-600">Importados</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-blue-50">
                <p className="text-3xl font-bold text-blue-600">{result.updated || 0}</p>
                <p className="text-xs text-blue-600">Actualizados</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-red-50">
                <p className="text-3xl font-bold text-red-600">{result.skipped || 0}</p>
                <p className="text-xs text-red-600">Errores</p>
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="max-w-2xl mx-auto">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" /> Detalle de errores
                </h3>
                <div className="max-h-48 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Fila</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{e.row}</TableCell>
                          <TableCell className="text-xs text-red-600">{e.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3 mt-8">
              <Button variant="outline" onClick={onClose}>Volver al panel</Button>
              <Button
                onClick={() => {
                  setCsvRows([])
                  setCsvHeaders([])
                  setMapping({})
                  setResult(null)
                  setProgress(0)
                  setCurrentStep('upload')
                }}
                className="bg-prats-navy hover:bg-prats-navy/90 gap-2"
              >
                <Upload className="h-4 w-4" /> Nueva importación
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ==========================================
// HELPERS
// ==========================================

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function downloadTemplate(entityType: string) {
  const templates: Record<string, string> = {
    clients: 'nombre,apellidos,email,telefono,direccion,ciudad,codigo_postal,provincia,notas\nJuan,García,juan@email.com,+34600111222,Calle Mayor 1,Madrid,28001,Madrid,Cliente VIP',
    products: 'nombre,sku,descripcion,precio,precio_coste,marca,talla,color,stock\nTraje Clásico Navy,TRJ-001,Traje italiano en lana super 120s,1250.00,450.00,Prats,52,Navy,5',
    orders: 'numero_pedido,email_cliente,nombre_cliente,fecha_pedido,total,anticipo,tipo,estado,notas\nPED-001,juan@email.com,Juan García,2024-01-15,1250.00,500.00,bespoke,delivered,Traje dos piezas',
    measurements: 'email_cliente,tipo_prenda,pecho,cintura,cadera,hombro,largo_manga,largo_espalda,cuello,entrepierna\njuan@email.com,Traje,102,88,98,46,64,76,40,82',
  }

  const csv = templates[entityType] || ''
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `plantilla-${entityType}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
