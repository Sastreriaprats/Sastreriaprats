'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Printer, Pencil, Loader2 } from 'lucide-react'
import { formatCurrency, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { generateFichaForLine, generateFichaForLineCamiseria } from '@/lib/pdf/ficha-confeccion'
import { EditFichaDialog } from '@/components/orders/edit-ficha-dialog'
import { LinePhotosViewer } from '@/components/orders/line-photos-viewer'
import { getOrderLinePhotosBatch } from '@/actions/order-line-photos'
import { usePermissions } from '@/hooks/use-permissions'
import { toast } from 'sonner'
import { getLineGroup, type LineGroup } from '@/lib/orders/line-groups'

const LOCKED_STATUSES = new Set(['delivered', 'cancelled'])

export function OrderGarmentsTab({ order }: { order: any }) {
  const router = useRouter()
  const { can } = usePermissions()
  const canViewCosts = can('orders.view_costs')
  const lines = order.tailoring_order_lines || []
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null)
  const [editingLine, setEditingLine] = useState<any | null>(null)

  // Fotos por prenda (signed URLs) — 1 sola llamada batch, no N+1.
  const lineIdsKey = lines.map((l: { id: string }) => l.id).filter(Boolean).join(',')
  const photosSig = lines.map((l: { id: string; photos?: string[] }) => (l.photos || []).join('+')).join('|')
  const [photosByLine, setPhotosByLine] = useState<Record<string, { path: string; url: string }[]>>({})
  useEffect(() => {
    const ids = lineIdsKey ? lineIdsKey.split(',') : []
    if (ids.length === 0) { setPhotosByLine({}); return }
    let cancelled = false
    getOrderLinePhotosBatch(ids).then((res) => { if (!cancelled && res.success) setPhotosByLine(res.data) })
    return () => { cancelled = true }
  }, [lineIdsKey, photosSig])

  const canEdit = !LOCKED_STATUSES.has(order?.status)

  const handleDownload = async (line: any, group: LineGroup, idx: number) => {
    if (group === 'complementos') return
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
        const canPrintFicha = group !== 'complementos'
        const displayName = group === 'complementos'
          ? (line.configuration?.product_name || 'Complemento')
          : line.garment_types?.name
        const badgeLabel = group === 'complementos'
          ? 'Boutique'
          : (line.line_type === 'artesanal' ? 'Artesanal' : 'Industrial')
        return (
        <Card key={line.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-muted-foreground text-sm">#{idx + 1}</span>
                {displayName}
                <Badge variant="outline" className="text-xs">{badgeLabel}</Badge>
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
                // Sastrería - forro elegido (stock/catálogo) + características por prenda.
                // Estas claves se guardan al crear el pedido pero antes no se mostraban.
                'forroStockNombre', 'forroCatalogo', 'forroMetros', 'caracteristicasPrenda',
                // Sastrería - pantalón
                'pretinaTamano', 'pretinaCorrida', 'pretina2Botones',
                'pretinaReforzada', 'pretinaReforzadaDelante',
                'tejidoPantalon', 'pBotonesTirantes',
                // Sastrería - chaleco
                'chalecoCorte', 'chalecoBolsillo', 'tejidoChaleco', 'forroChaleco',
                // Sastrería - gestión
                'cortador', 'oficial', 'situacionTrabajo', 'SituacionTrabajo',
                'fechaCompromiso', 'FechaCompromiso', 'descripcion', 'observaciones',
                'notas', 'Notas', 'caracteristicas',
                // Camisería - medidas (claves modernas + legacy fallback)
                'cuello', 'canesu', 'largoManga', 'frentePecho', 'pecho',
                'cintura', 'cadera', 'largoCuerpo', 'hombro', 'punoDerecho', 'punoIzquierdo',
                // Camisería - medidas legacy (pedidos antiguos pre-mig 072)
                'manga', 'frenPecho', 'contPecho', 'largo', 'biceps',
                // Camisería - opciones
                'modCuello', 'puno', 'jareton', 'espPliegues',
                'erguido', 'hombrosAltos', 'iniciales', 'inicialesTexto',
                'inicialesSituacion', 'inicialesColor',
                'iniciales_situacion', 'iniciales_color',
                'obs',
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
              const INICIALES_SITUACION_LABEL: Record<string, string> = {
                puno_derecho: 'Puño derecho',
                puno_izquierdo: 'Puño izquierdo',
                pecho: 'Pecho',
                talle: 'Talle',
              }
              // Etiquetas legibles para claves camelCase (el fallback genérico
              // `key.replace(/_/g,' ')` dejaría "forroStockNombre" tal cual).
              const KEY_LABELS: Record<string, string> = {
                forro: 'Tipo de forro',
                forroStockNombre: 'Forro',
                forroCatalogo: 'Forro (catálogo)',
                forroMetros: 'Metros forro',
                caracteristicasPrenda: 'Características',
              }
              const FORRO_TIPO_LABEL: Record<string, string> = {
                sin_forro: 'Sin forro',
                medio: 'Medio forro',
                completo: 'Forro completo',
              }
              const labelFor = (key: string): string =>
                KEY_LABELS[key] ?? key.replace(/_/g, ' ')
              const formatValue = (key: string, val: unknown): string => {
                if ((key === 'inicialesSituacion' || key === 'iniciales_situacion') && typeof val === 'string') {
                  return INICIALES_SITUACION_LABEL[val] ?? val
                }
                if (key === 'forro' && typeof val === 'string') {
                  return FORRO_TIPO_LABEL[val] ?? val
                }
                if (key === 'forroMetros') return `${val} m`
                return String(val)
              }
              return (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">CONFIGURACIÓN</p>
                    <div className="flex flex-wrap gap-1.5">
                      {entries.map(([key, val]) => (
                        <span key={key} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                          <span className="text-muted-foreground capitalize">
                            {labelFor(key)}:
                          </span>
                          <span className="font-medium">{formatValue(key, val)}</span>
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

            {photosByLine[line.id]?.length > 0 && (
              <div className="space-y-1">
                <span className="text-muted-foreground block text-xs">Fotos</span>
                <LinePhotosViewer urls={photosByLine[line.id]} />
              </div>
            )}

            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div><span className="text-muted-foreground block text-xs">PVP</span><span className="font-medium">{formatCurrency(line.unit_price)}</span></div>
              {line.discount_percentage > 0 && <div><span className="text-muted-foreground block text-xs">Dto.</span>-{line.discount_percentage}%</div>}
              {canViewCosts && (() => {
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
