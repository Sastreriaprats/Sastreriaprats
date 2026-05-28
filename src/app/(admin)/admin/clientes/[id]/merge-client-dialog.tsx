'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Search, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { listClients, previewClientMerge, mergeClients } from '@/actions/clients'

type MergeSource = { id: string; full_name: string }
type TargetLite = { id: string; full_name: string; client_code?: string; email?: string | null; phone?: string | null }
type Preview = {
  counts?: Record<string, number>
  warnings?: string[]
  blockers?: string[]
  can_merge?: boolean
}

const TABLE_LABELS: Record<string, string> = {
  sales: 'ventas', tailoring_orders: 'pedidos de sastrería', alterations: 'arreglos',
  boutique_alterations: 'arreglos (antiguos)', client_measurements: 'medidas', appointments: 'citas',
  vouchers: 'vales', invoices: 'facturas', online_orders: 'pedidos online', pending_online_orders: 'pedidos online en curso',
  product_reservations: 'reservas', reservations: 'reservas', client_notes: 'notas', client_companies: 'empresas',
  client_contacts: 'contactos', client_wishlist: 'lista de deseos', email_logs: 'emails enviados',
  client_email_history: 'historial de emails', estimates: 'presupuestos', loyalty_points: 'puntos de fidelidad',
  client_documents: 'documentos', client_files: 'archivos', newsletter_subscribers: 'suscripción newsletter',
  gift_registry: 'lista de regalos',
}
const labelFor = (t: string) => TABLE_LABELS[t.replace(/^public\./, '')] ?? t.replace(/^public\./, '')

export function MergeClientDialog({ open, onOpenChange, source, basePath }: {
  open: boolean; onOpenChange: (v: boolean) => void; source: MergeSource; basePath: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<TargetLite[]>([])
  const [searching, setSearching] = useState(false)
  const [target, setTarget] = useState<TargetLite | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [fillEmpty, setFillEmpty] = useState(true)
  const [confirmText, setConfirmText] = useState('')
  const [merging, setMerging] = useState(false)

  const reset = () => { setSearch(''); setResults([]); setTarget(null); setPreview(null); setConfirmText(''); setFillEmpty(true) }

  useEffect(() => {
    if (!open) return
    if (target) return
    const term = search.trim()
    if (term.length < 2) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const h = setTimeout(async () => {
      const r = await listClients({ page: 1, pageSize: 8, search: term, sortBy: 'full_name', sortOrder: 'asc' })
      if (cancelled) return
      setSearching(false)
      if (r.success) setResults((r.data.data as TargetLite[]).filter((c) => c.id !== source.id))
    }, 300)
    return () => { cancelled = true; clearTimeout(h) }
  }, [search, open, target, source.id])

  const pickTarget = useCallback(async (t: TargetLite) => {
    setTarget(t)
    setPreviewing(true)
    const r = await previewClientMerge({ sourceId: source.id, targetId: t.id })
    setPreviewing(false)
    if (r.success) setPreview(r.data)
    else { toast.error(r.error); setTarget(null) }
  }, [source.id])

  const handleMerge = async () => {
    if (!target) return
    setMerging(true)
    const r = await mergeClients({ sourceId: source.id, targetId: target.id, fillEmpty })
    setMerging(false)
    if (r.success) {
      toast.success('Clientes fusionados')
      onOpenChange(false)
      router.push(`${basePath}/clientes/${target.id}`)
    } else {
      toast.error(r.error)
    }
  }

  const canConfirm = !!target && preview?.can_merge === true && confirmText.trim() === source.full_name.trim() && !merging

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Fusionar cliente</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 text-sm bg-muted/30">
            <span className="font-semibold text-red-600">{source.full_name}</span> será <span className="font-semibold">absorbido</span> y eliminado. Todo lo suyo pasará al cliente que elijas.
          </div>

          {!target ? (
            <div className="space-y-2">
              <Label>Cliente superviviente (destino)</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar por nombre, email, teléfono, código…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              </div>
              {searching && <p className="text-xs text-muted-foreground">Buscando…</p>}
              <div className="max-h-52 overflow-y-auto divide-y rounded-md border">
                {results.length === 0 && search.trim().length >= 2 && !searching && (
                  <p className="text-xs text-muted-foreground p-3">Sin resultados</p>
                )}
                {results.map((c) => (
                  <button key={c.id} type="button" onClick={() => pickTarget(c)} className="w-full text-left p-2 hover:bg-muted text-sm">
                    <span className="font-medium">{c.full_name}</span>
                    <span className="text-muted-foreground"> · {c.client_code}{c.email ? ' · ' + c.email : ''}{c.phone ? ' · ' + c.phone : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div>Destino: <span className="font-semibold text-green-700">{target.full_name}</span> <span className="text-muted-foreground">· {target.client_code}</span></div>
                <Button variant="ghost" size="sm" onClick={() => { setTarget(null); setPreview(null); setConfirmText('') }}>Cambiar</Button>
              </div>

              {previewing && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</div>}

              {preview && (
                <>
                  {preview.counts && Object.keys(preview.counts).length > 0 ? (
                    <div className="rounded-md border p-3 text-sm">
                      <p className="font-medium mb-1">Se reasignará al destino:</p>
                      <ul className="text-muted-foreground space-y-0.5">
                        {Object.entries(preview.counts).map(([t, n]) => (
                          <li key={t}>· {n} {labelFor(t)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">El cliente origen no tiene datos vinculados; solo se borrará.</p>
                  )}

                  {(preview.warnings ?? []).map((w, i) => (
                    <div key={i} className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> {w}
                    </div>
                  ))}
                  {(preview.blockers ?? []).map((b, i) => (
                    <div key={i} className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700">{b}</div>
                  ))}

                  {preview.can_merge && (
                    <>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={fillEmpty} onCheckedChange={(v) => setFillEmpty(v === true)} />
                        Completar campos vacíos del destino con datos del cliente actual
                      </label>
                      <div className="space-y-1">
                        <Label className="text-xs">Para confirmar, escribe el nombre del cliente a absorber: <span className="font-semibold">{source.full_name}</span></Label>
                        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={source.full_name} />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false) }} disabled={merging}>Cancelar</Button>
          <Button variant="destructive" onClick={handleMerge} disabled={!canConfirm}>
            {merging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Fusionar definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
