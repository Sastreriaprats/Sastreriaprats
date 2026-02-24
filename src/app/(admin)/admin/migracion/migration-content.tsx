'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Upload, Users, ShoppingBag, Scissors, Ruler,
  CheckCircle, Loader2, RotateCcw, FileSpreadsheet,
} from 'lucide-react'
import { getMigrationLogs, rollbackMigration } from '@/actions/migration'
import { ImportWizard } from './import-wizard'
import { formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'

const entityConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  clients: { label: 'Clientes', icon: Users, color: 'text-blue-500 bg-blue-50' },
  products: { label: 'Productos', icon: ShoppingBag, color: 'text-green-500 bg-green-50' },
  orders: { label: 'Pedidos', icon: Scissors, color: 'text-purple-500 bg-purple-50' },
  measurements: { label: 'Medidas', icon: Ruler, color: 'text-amber-500 bg-amber-50' },
}

export function MigrationContent() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeImport, setActiveImport] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  const loadLogs = useCallback(async () => {
    const res = await getMigrationLogs()
    if (res.success) setLogs(res.data)
    setIsLoading(false)
  }, [])

  useEffect(() => { loadLogs() }, [loadLogs])

  const handleRollback = async (batchId: string) => {
    if (!confirm('¿Seguro? Se eliminarán todos los datos importados en este lote.')) return
    setRollingBack(batchId)
    const res = await rollbackMigration(batchId)
    if (res.success) {
      toast.success(`Rollback completado: ${res.data.deleted} registros eliminados`)
      loadLogs()
    } else {
      toast.error(res.error || 'Error al revertir')
    }
    setRollingBack(null)
  }

  if (activeImport) {
    return <ImportWizard entityType={activeImport} onClose={() => { setActiveImport(null); loadLogs() }} />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Migración de datos</h1>
        <p className="text-muted-foreground">Importar datos desde Power Shop u otros sistemas</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(entityConfig).map(([key, config]) => {
          const Icon = config.icon
          return (
            <Card key={key} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveImport(key)}>
              <CardContent className="pt-6 text-center">
                <div className={`h-12 w-12 rounded-xl ${config.color} flex items-center justify-center mx-auto mb-3`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-prats-navy">{config.label}</h3>
                <p className="text-xs text-muted-foreground mt-1">Importar CSV</p>
                <Button variant="outline" size="sm" className="mt-3 gap-1 text-xs">
                  <Upload className="h-3 w-3" /> Importar
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Historial de importaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sin importaciones previas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Importados</TableHead>
                  <TableHead>Actualizados</TableHead>
                  <TableHead>Errores</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const batchId = log.batch_id as string
                  const entityType = log.entity_type as string
                  const config = entityConfig[entityType]
                  const Icon = config?.icon || FileSpreadsheet
                  const profile = log.profiles as Record<string, unknown> | null
                  return (
                    <TableRow key={log.id as string} className={log.rolled_back ? 'opacity-50' : ''}>
                      <TableCell className="font-mono text-xs">{batchId}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Icon className="h-3 w-3" /> {config?.label || entityType}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.total_rows as number}</TableCell>
                      <TableCell className="text-green-600 font-medium">{log.imported as number}</TableCell>
                      <TableCell className="text-blue-600">{log.updated as number}</TableCell>
                      <TableCell>
                        {(log.skipped as number) > 0 ? (
                          <span className="text-red-500 font-medium">{log.skipped as number}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.created_at as string)}</TableCell>
                      <TableCell className="text-xs">{(profile?.full_name as string) || '—'}</TableCell>
                      <TableCell>
                        {log.rolled_back ? (
                          <Badge variant="secondary" className="text-[10px]">
                            <CheckCircle className="h-3 w-3 mr-1" />Revertido
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-600"
                            disabled={rollingBack === batchId}
                            onClick={() => handleRollback(batchId)}
                          >
                            {rollingBack === batchId
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <RotateCcw className="h-4 w-4" />}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
