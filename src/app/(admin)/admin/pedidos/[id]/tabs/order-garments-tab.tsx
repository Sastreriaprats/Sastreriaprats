'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Printer, Pencil, Loader2 } from 'lucide-react'
import { formatCurrency, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { generateFichaForLine, generateFichaForLineCamiseria } from '@/lib/pdf/ficha-confeccion'
import { EditFichaDialog } from '@/components/orders/edit-ficha-dialog'
import { toast } from 'sonner'

type LineGroup = 'sastreria' | 'camiseria' | 'complemento'

function getLineGroup(line: any): LineGroup {
  const cfg = line?.configuration ?? {}
  if (cfg.product_name !== undefined) return 'complemento'
  if (cfg.tipo === 'camiseria' || cfg.puno !== undefined) return 'camiseria'
  return 'sastreria'
}

const LOCKED_STATUSES = new Set(['delivered', 'cancelled'])

export function OrderGarmentsTab({ order }: { order: any }) {
  const router = useRouter()
  const lines = order.tailoring_order_lines || []
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null)
  const [editingLine, setEditingLine] = useState<any | null>(null)

  const canEdit = !LOCKED_STATUSES.has(order?.status)

  const handleDownload = async (line: any, group: LineGroup, idx: number) => {
    if (group === 'complemento') return
    setPdfLoadingId(line.id)
    try {
      if (group === 'camiseria') await generateFichaForLineCamiseria(order, line, idx)
      else await generateFichaForLine(order, line)
    } catch (err) {
      console.error(err)
      toast.error('No se pudo generar la ficha')
    } finally {
      setPdfLoadingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {lines.map((line: any, idx: number) => {
        const group = getLineGroup(line)
        const canPrintFicha = group !== 'complemento'
        return (
        <Card key={line.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-muted-foreground text-sm">#{idx + 1}</span>
                {line.garment_types?.name}
                <Badge variant="outline" className="text-xs">{line.line_type === 'artesanal' ? 'Artesanal' : 'Industrial'}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${getOrderStatusColor(line.status)}`}>{getOrderStatusLabel(line.status)}</Badge>
                {canPrintFicha && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-8"
                    onClick={() => handleDownload(line, group, idx)}
                    disabled={pdfLoadingId === line.id}
                  >
                    {pdfLoadingId === line.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                    Descargar ficha
                  </Button>
                )}
                {canEdit && canPrintFicha && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-8"
                    onClick={() => setEditingLine(line)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar ficha
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {line.fabric_description && (
                <div><span className="text-muted-foreground block text-xs">Tejido</span>{line.fabric_description}</div>
              )}
              {line.fabrics && (
                <div><span className="text-muted-foreground block text-xs">Ref. tejido</span>{line.fabrics.fabric_code} — {line.fabrics.name}</div>
              )}
              {line.fabric_meters > 0 && (
                <div><span className="text-muted-foreground block text-xs">Metros</span>{line.fabric_meters} m</div>
              )}
              {line.suppliers && (
                <div><span className="text-muted-foreground block text-xs">Proveedor</span>{line.suppliers.name}</div>
              )}
              {line.officials && (
                <div>
                  <span className="text-muted-foreground block text-xs">Oficial</span>
                  <span className="font-medium text-blue-700">{line.officials.name}</span>
                </div>
              )}
              {line.model_name && (
                <div><span className="text-muted-foreground block text-xs">Modelo</span>{line.model_name} {line.model_size && `(${line.model_size})`}</div>
              )}
            </div>

            {(() => {
              const cfg = line.configuration || {}
              const ALLOWED_KEYS = [
                // Sastrería - prenda
                'prenda', 'prendaLabel', 'tejido', 'forro', 'manga', 'solapa',
                'anchoSolapa', 'botones', 'vueltas', 'pliegues', 'aberturas',
                'escote', 'metros', 'picado34', 'forroDesc',
                'bolsilloTipo', 'cerrilleraExterior', 'primerBoton',
                'ojalesAbiertos', 'ojalesCerrados', 'medidaHombro', 'sinHombreras',
                // Sastrería - pantalón
                'pretinaTamano', 'pretinaCorrida', 'pretina2Botones',
                'tejidoPantalon', 'pBotonesTirantes',
                // Sastrería - chaleco
                'chalecoCorte', 'chalecoBolsillo', 'tejidoChaleco', 'forroChaleco',
                // Sastrería - gestión
                'cortador', 'oficial', 'situacionTrabajo', 'SituacionTrabajo',
                'fechaCompromiso', 'FechaCompromiso', 'descripcion', 'observaciones',
                'notas', 'Notas', 'caracteristicas',
                // Camisería - medidas
                'cuello', 'canesu', 'manga', 'frenPecho', 'contPecho',
                'cintura', 'cadera', 'largo', 'hombro', 'biceps',
                // Camisería - opciones
                'modCuello', 'puno', 'jareton', 'espPliegues',
                'erguido', 'hombrosAltos', 'iniciales', 'obs',
                // Camisería - tipo
                'tipo',
                // Complementos
                'product_name',
              ]
              const entries = Object.entries(cfg).filter(([key, val]) =>
                ALLOWED_KEYS.includes(key) &&
                val != null && val !== '' && val !== 0 && val !== false
              )
              if (entries.length === 0) return null
              return (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">CONFIGURACIÓN</p>
                    <div className="flex flex-wrap gap-1.5">
                      {entries.map(([key, val]) => (
                        <span key={key} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                          <span className="text-muted-foreground capitalize">
                            {key.replace(/_/g, ' ')}:
                          </span>
                          <span className="font-medium">{String(val)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )
            })()}

            {line.finishing_notes && (
              <div className="p-2 bg-muted rounded text-sm italic">&quot;{line.finishing_notes}&quot;</div>
            )}

            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div><span className="text-muted-foreground block text-xs">PVP</span><span className="font-medium">{formatCurrency(line.unit_price)}</span></div>
              {line.discount_percentage > 0 && <div><span className="text-muted-foreground block text-xs">Dto.</span>-{line.discount_percentage}%</div>}
              {(() => {
                const material = Number(line.material_cost) || 0
                const labor = Number(line.labor_cost) || 0
                const factory = Number(line.factory_cost) || 0
                const anyCost = material > 0 || labor > 0 || factory > 0
                if (!anyCost) return null
                const totalCost = Math.round((material + labor + factory) * 100) / 100
                return (
                  <>
                    {material > 0 && (
                      <div><span className="text-muted-foreground block text-xs">Material</span>{formatCurrency(material)}</div>
                    )}
                    {labor > 0 && (
                      <div><span className="text-muted-foreground block text-xs">Mano de obra</span>{formatCurrency(labor)}</div>
                    )}
                    {factory > 0 && (
                      <div><span className="text-muted-foreground block text-xs">Fabricación</span>{formatCurrency(factory)}</div>
                    )}
                    <div>
                      <span className="text-muted-foreground block text-xs">Total coste</span>
                      <span className="font-semibold">{formatCurrency(totalCost)}</span>
                    </div>
                  </>
                )
              })()}
            </div>
          </CardContent>
        </Card>
        )
      })}

      <EditFichaDialog
        open={!!editingLine}
        onOpenChange={(v) => { if (!v) setEditingLine(null) }}
        order={order}
        line={editingLine}
        onSaved={() => { setEditingLine(null); router.refresh() }}
      />
    </div>
  )
}
