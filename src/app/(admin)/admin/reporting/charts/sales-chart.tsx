'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

type ChartItem = { date: string; pos: number; online: number; tailoring: number; total: number }

export function SalesChart({ data }: { data: ChartItem[] }) {
  if (!data.length) return <p className="text-center text-muted-foreground py-12">Sin datos para el periodo seleccionado</p>

  const maxTotal = Math.max(...data.map(d => d.total))
  const maxRounded = maxTotal > 0 ? Math.ceil(maxTotal / 100) * 100 : 100
  const rotateLabels = data.length > 14

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Evolución de ventas</CardTitle></CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {/* Y-axis */}
          <div className="flex flex-col justify-between text-right shrink-0 pb-5" style={{ height: '288px' }}>
            {[1, 0.75, 0.5, 0.25, 0].map(s => (
              <span key={s} className="text-[9px] text-muted-foreground leading-none">
                {formatCurrency(maxRounded * s)}
              </span>
            ))}
          </div>

          {/* Chart area */}
          <div className="flex-1 min-w-0">
            <div className="flex items-end gap-px h-72">
              {data.map((d, i) => {
                const posH = maxTotal > 0 ? (d.pos / maxTotal) * 100 : 0
                const onlineH = maxTotal > 0 ? (d.online / maxTotal) * 100 : 0
                const tailoringH = maxTotal > 0 ? (d.tailoring / maxTotal) * 100 : 0
                const stackH = posH + onlineH + tailoringH

                return (
                  <div key={i} className="flex-1 flex flex-col justify-end h-full group relative cursor-pointer">
                    <div className="flex flex-col justify-end" style={{ height: `${stackH}%` }}>
                      {tailoringH > 0 && (
                        <div className="bg-purple-400 rounded-t-sm" style={{ height: `${stackH > 0 ? (tailoringH / stackH) * 100 : 0}%`, minHeight: '2px' }} />
                      )}
                      {onlineH > 0 && (
                        <div className="bg-blue-400" style={{ height: `${stackH > 0 ? (onlineH / stackH) * 100 : 0}%`, minHeight: '2px' }} />
                      )}
                      {posH > 0 && (
                        <div className="bg-prats-navy rounded-b-sm" style={{ height: `${stackH > 0 ? (posH / stackH) * 100 : 0}%`, minHeight: '2px' }} />
                      )}
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 bg-white border rounded-lg shadow-lg p-2 text-xs w-36">
                      <p className="font-medium mb-1">{d.date}</p>
                      <p className="flex justify-between"><span className="text-prats-navy">TPV:</span>{formatCurrency(d.pos)}</p>
                      <p className="flex justify-between"><span className="text-blue-500">Online:</span>{formatCurrency(d.online)}</p>
                      <p className="flex justify-between"><span className="text-purple-500">Sastrería:</span>{formatCurrency(d.tailoring)}</p>
                      <p className="flex justify-between font-bold border-t mt-1 pt-1"><span>Total:</span>{formatCurrency(d.total)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className={`flex gap-px mt-1 ${rotateLabels ? 'items-start' : ''}`} style={{ height: rotateLabels ? '48px' : 'auto' }}>
              {data.map((d, i) => (
                <div key={i} className="flex-1 text-center overflow-hidden">
                  {(i % Math.ceil(data.length / 10) === 0 || i === data.length - 1) && (
                    <span
                      className="text-[9px] text-muted-foreground block"
                      style={rotateLabels ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '40px' } : {}}
                    >
                      {d.date.slice(5)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-6 mt-4 text-xs">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-prats-navy" />TPV</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-400" />Online</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-purple-400" />Sastrería</span>
        </div>
      </CardContent>
    </Card>
  )
}
