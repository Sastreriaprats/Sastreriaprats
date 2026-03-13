'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, UserPlus, UserCheck, Trophy } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type ClientsData = {
  newClients: number
  totalClients: number
  sources: Record<string, number>
  topClients: { full_name: string; total_revenue: number }[]
  clientsWithPurchases: number
}

const sourceColors: Record<string, string> = {
  walk_in: 'bg-prats-navy', web_registration: 'bg-blue-500', web_shop: 'bg-green-500',
  referral: 'bg-purple-500', unknown: 'bg-gray-400',
}
const sourceLabels: Record<string, string> = {
  walk_in: 'Tienda', web_registration: 'Registro web', web_shop: 'Tienda online',
  referral: 'Referido', unknown: 'Otro',
}

const MEDAL_COLORS = ['text-yellow-500', 'text-gray-400', 'text-amber-600']
const MEDAL_BG = ['bg-yellow-50 border-yellow-200', 'bg-gray-50 border-gray-200', 'bg-amber-50 border-amber-200']

export function ClientsChart({ data }: { data: ClientsData | null }) {
  if (!data) return <p className="text-center text-muted-foreground py-12">Sin datos</p>

  const sources = data.sources || {}
  const totalSources = Object.values(sources).reduce((s, v) => s + v, 0)
  const top3 = (data.topClients || []).slice(0, 3)
  const activePct = data.totalClients > 0 ? Math.round((data.clientsWithPurchases / data.totalClients) * 100) : 0

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
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <Users className="h-7 w-7 text-prats-navy shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Total clientes</p>
                  <p className="text-xl font-bold">{data.totalClients}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50">
                <UserCheck className="h-7 w-7 text-green-600 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Con compras</p>
                  <p className="text-xl font-bold">{data.clientsWithPurchases}
                    <span className="text-xs font-normal text-muted-foreground ml-1">{activePct}%</span>
                  </p>
                </div>
              </div>
            </div>

            {top3.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  <h4 className="text-sm font-semibold">Top 3 clientes</h4>
                </div>
                <div className="space-y-2">
                  {top3.map((c, i) => (
                    <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${MEDAL_BG[i]}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold w-5 ${MEDAL_COLORS[i]}`}>{i + 1}</span>
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
