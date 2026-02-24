'use client'

import { Badge } from '@/components/ui/badge'
import { ArrowRight, History } from 'lucide-react'
import { formatDateTime, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'

export function OrderHistoryTab({ history }: { history: any[] }) {
  const sorted = [...history].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())

  if (sorted.length === 0) return (
    <div className="text-center py-12 text-muted-foreground"><History className="mx-auto h-12 w-12 mb-4 opacity-30" /><p>Sin historial.</p></div>
  )

  return (
    <div className="space-y-3">
      {sorted.map((h: any) => (
        <div key={h.id} className="flex items-start gap-4 p-3 rounded-lg border">
          <div className="flex items-center gap-2 min-w-[200px]">
            {h.from_status && <Badge className={`text-xs ${getOrderStatusColor(h.from_status)}`}>{getOrderStatusLabel(h.from_status)}</Badge>}
            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Badge className={`text-xs ${getOrderStatusColor(h.to_status)}`}>{getOrderStatusLabel(h.to_status)}</Badge>
          </div>
          <div className="flex-1">
            {h.notes && <p className="text-sm text-muted-foreground italic">&quot;{h.notes}&quot;</p>}
          </div>
          <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
            <p>{h.changed_by_name}</p>
            <p>{formatDateTime(h.changed_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
