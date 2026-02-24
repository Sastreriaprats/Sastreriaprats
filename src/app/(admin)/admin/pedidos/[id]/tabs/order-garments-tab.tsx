'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatCurrency, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'

export function OrderGarmentsTab({ order }: { order: any }) {
  const lines = order.tailoring_order_lines || []

  return (
    <div className="space-y-4">
      {lines.map((line: any, idx: number) => (
        <Card key={line.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-muted-foreground text-sm">#{idx + 1}</span>
                {line.garment_types?.name}
                <Badge variant="outline" className="text-xs">{line.line_type === 'artesanal' ? 'Artesanal' : 'Industrial'}</Badge>
              </CardTitle>
              <Badge className={`text-xs ${getOrderStatusColor(line.status)}`}>{getOrderStatusLabel(line.status)}</Badge>
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

            {line.configuration && Object.keys(line.configuration).length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">CONFIGURACIÓN</p>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {Object.entries(line.configuration).map(([key, val]) => (
                      <div key={key} className="text-sm">
                        <span className="text-muted-foreground text-xs block capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="font-medium">{val as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {line.finishing_notes && (
              <div className="p-2 bg-muted rounded text-sm italic">&quot;{line.finishing_notes}&quot;</div>
            )}

            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div><span className="text-muted-foreground block text-xs">PVP</span><span className="font-medium">{formatCurrency(line.unit_price)}</span></div>
              {line.discount_percentage > 0 && <div><span className="text-muted-foreground block text-xs">Dto.</span>-{line.discount_percentage}%</div>}
              <div><span className="text-muted-foreground block text-xs">Coste material</span>{formatCurrency(line.material_cost)}</div>
              <div><span className="text-muted-foreground block text-xs">Coste M.O.</span>{formatCurrency(line.labor_cost)}</div>
              <div><span className="text-muted-foreground block text-xs">Coste fábrica</span>{formatCurrency(line.factory_cost)}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
