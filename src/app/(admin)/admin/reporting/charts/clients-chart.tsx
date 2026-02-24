'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, UserPlus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type ClientsData = {
  newClients: number
  totalClients: number
  sources: Record<string, number>
  topClients: { full_name: string; total_revenue: number }[]
}

const sourceColors: Record<string, string> = {
  walk_in: 'bg-prats-navy', web_registration: 'bg-blue-500', web_shop: 'bg-green-500',
  referral: 'bg-purple-500', unknown: 'bg-gray-400',
}
const sourceLabels: Record<string, string> = {
  walk_in: 'Tienda', web_registration: 'Registro web', web_shop: 'Tienda online',
  referral: 'Referido', unknown: 'Otro',
}

export function ClientsChart({ data }: { data: ClientsData | null }) {
  if (!data) return <p className="text-center text-muted-foreground py-12">Sin datos</p>

  const sources = data.sources || {}
  const totalSources = Object.values(sources).reduce((s, v) => s + v, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Origen de nuevos clientes</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="h-14 w-14 rounded-full bg-prats-navy/10 flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-prats-navy" />
            </div>
            <div>
              <p className="text-3xl font-bold">{data.newClients}</p>
              <p className="text-xs text-muted-foreground">nuevos clientes en el periodo</p>
            </div>
          </div>
          <div className="h-6 rounded-full overflow-hidden flex bg-gray-100 mb-4">
            {Object.entries(sources).map(([key, value]) => (
              <div
                key={key}
                className={`${sourceColors[key] || 'bg-gray-400'} transition-all`}
                style={{ width: `${totalSources > 0 ? (value / totalSources) * 100 : 0}%` }}
                title={`${sourceLabels[key] || key}: ${value}`}
              />
            ))}
          </div>
          <div className="space-y-2">
            {Object.entries(sources).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${sourceColors[key] || 'bg-gray-400'}`} />
                  {sourceLabels[key] || key}
                </span>
                <span className="font-medium">
                  {value} ({totalSources > 0 ? ((value / totalSources) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Resumen de clientes</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-prats-navy" />
                <div>
                  <p className="text-sm text-muted-foreground">Total clientes</p>
                  <p className="text-2xl font-bold">{data.totalClients}</p>
                </div>
              </div>
            </div>

            {data.topClients && data.topClients.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Top clientes por facturación</h4>
                <div className="space-y-2">
                  {data.topClients.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-bold w-5">{i + 1}</span>
                        <span className="text-sm font-medium">{c.full_name}</span>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(c.total_revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
