'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, History, Pencil, ChevronDown, ChevronUp, Save, X as XIcon, Loader2 } from 'lucide-react'
import { formatDateTimeMadrid, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { useAction } from '@/hooks/use-action'
import { updateStateHistoryDate } from '@/actions/orders'

type HistoryEntry = {
  id: string
  from_status: string | null
  to_status: string
  description?: string | null
  notes?: string | null
  changed_by_name?: string | null
  changed_at: string
}

function isEditEntry(h: HistoryEntry): boolean {
  return h.from_status === h.to_status
}

function tryParseJson(raw: string | null | undefined): any | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

/** UTC ISO → valor para <input type="datetime-local"> en hora local del navegador. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function OrderHistoryTab({ history, canEditDates = false }: { history: HistoryEntry[]; canEditDates?: boolean }) {
  const router = useRouter()
  const sorted = [...history].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dateDraft, setDateDraft] = useState('')

  const { execute, isLoading } = useAction(updateStateHistoryDate, {
    successMessage: 'Fecha actualizada',
    onSuccess: () => { setEditingId(null); router.refresh() },
  })

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const startEdit = (h: HistoryEntry) => {
    setDateDraft(toLocalInput(h.changed_at))
    setEditingId(h.id)
  }

  const saveDate = (h: HistoryEntry) => {
    if (!dateDraft) return
    execute({ historyId: h.id, newDate: new Date(dateDraft).toISOString() })
  }

  if (sorted.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <History className="mx-auto h-12 w-12 mb-4 opacity-30" />
      <p>Sin historial.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {sorted.map((h) => {
        const isEdit = isEditEntry(h)
        const diff = isEdit ? tryParseJson(h.notes) : null
        const isExpanded = expanded.has(h.id)
        const isEditingDate = editingId === h.id
        return (
          <div key={h.id} className="flex items-start gap-4 p-3 rounded-lg border">
            <div className="flex items-center gap-2 min-w-[220px]">
              {isEdit ? (
                <Badge variant="outline" className="text-xs gap-1 bg-blue-50 text-blue-800 border-blue-200">
                  <Pencil className="h-3 w-3" /> Edición
                </Badge>
              ) : (
                <>
                  {h.from_status && (
                    <Badge className={`text-xs ${getOrderStatusColor(h.from_status)}`}>
                      {getOrderStatusLabel(h.from_status)}
                    </Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Badge className={`text-xs ${getOrderStatusColor(h.to_status)}`}>
                    {getOrderStatusLabel(h.to_status)}
                  </Badge>
                </>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {isEdit ? (
                <>
                  <p className="text-sm">{h.description || 'Edición de datos'}</p>
                  {diff && (
                    <>
                      <Button
                        variant="ghost" size="sm" className="h-6 px-2 text-xs"
                        onClick={() => toggle(h.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        {isExpanded ? 'Ocultar detalles' : 'Ver detalles'}
                      </Button>
                      {isExpanded && (
                        <div className="mt-2 rounded border bg-muted/30 p-3 text-xs space-y-2 font-mono overflow-x-auto">
                          {diff.header && Object.keys(diff.header).length > 0 && (
                            <div>
                              <p className="font-sans font-semibold text-muted-foreground mb-1">Cabecera</p>
                              {Object.entries(diff.header).map(([field, change]: [string, any]) => (
                                <div key={field} className="flex items-center gap-2 py-0.5">
                                  <span className="text-muted-foreground">{field}:</span>
                                  <span className="line-through opacity-60 truncate max-w-[240px]">{String(change?.old ?? '—')}</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="truncate max-w-[240px]">{String(change?.new ?? '—')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {Array.isArray(diff.lines) && diff.lines.length > 0 && (
                            <div>
                              <p className="font-sans font-semibold text-muted-foreground mb-1 mt-2">Prendas</p>
                              <p className="font-sans text-muted-foreground">
                                {diff.lines.length} cambio{diff.lines.length === 1 ? '' : 's'} en líneas (revisa la pestaña &quot;Prendas&quot; para ver el estado actual).
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                h.notes && !diff && (
                  <p className="text-sm text-muted-foreground italic">&quot;{h.notes}&quot;</p>
                )
              )}
            </div>
            <div className="text-right text-xs text-muted-foreground whitespace-nowrap shrink-0">
              <p>{h.changed_by_name}</p>
              {isEditingDate ? (
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    type="datetime-local"
                    value={dateDraft}
                    onChange={(e) => setDateDraft(e.target.value)}
                    className="h-7 w-[180px] text-xs"
                    disabled={isLoading}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveDate(h)} disabled={isLoading || !dateDraft}>
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)} disabled={isLoading}>
                    <XIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-1">
                  <span>{formatDateTimeMadrid(h.changed_at)}</span>
                  {canEditDates && !isEdit && (
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      title="Corregir fecha"
                      onClick={() => startEdit(h)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
