'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Ruler, Info } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export function MeasurementsContent({ measurements }: { measurements: Record<string, unknown>[] }) {
  const grouped: Record<string, Record<string, unknown>[]> = {}
  for (const m of measurements) {
    const garment = m.garment_types as Record<string, unknown> | null
    const key = (garment?.name as string) || 'General'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(m)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-prats-navy flex items-center gap-2">
          <Ruler className="h-6 w-6" />Mis medidas
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Tus medidas corporales registradas por nuestros sastres
        </p>
      </div>

      {measurements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Ruler className="mx-auto h-12 w-12 text-gray-200 mb-4" />
            <p className="text-gray-400">Aún no tienes medidas registradas</p>
            <p className="text-xs text-gray-300 mt-2">
              Se registrarán en tu primera visita a la sastrería
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-sm text-blue-700">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              Las medidas solo pueden ser actualizadas por nuestros sastres en tienda.
              Si necesitas actualizar tus medidas, reserva una cita.
            </p>
          </div>

          {Object.entries(grouped).map(([garmentType, items]) => {
            const latest = items[0]
            const profile = latest?.profiles as Record<string, unknown> | null

            return (
              <Card key={garmentType}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge variant="outline" className="text-prats-gold border-prats-gold/30">
                      {garmentType}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      Última medición: {formatDate(latest?.taken_at as string)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map((m) => {
                      const data = typeof m.values === 'string'
                        ? JSON.parse(m.values as string)
                        : (m.values as Record<string, unknown>) || {}
                      return Object.entries(data).map(([key, value]) => (
                        <div key={`${m.id}-${key}`} className="p-3 rounded-lg bg-gray-50">
                          <p className="text-xs text-gray-400 capitalize">{key.replace(/_/g, ' ')}</p>
                          <p className="text-lg font-bold text-prats-navy">
                            {String(value)} <span className="text-xs text-gray-400 font-normal">cm</span>
                          </p>
                        </div>
                      ))
                    })}
                  </div>
                  {(profile?.full_name as string) && (
                    <p className="text-xs text-gray-400 mt-3">
                      Medido por: {profile?.full_name as string}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
