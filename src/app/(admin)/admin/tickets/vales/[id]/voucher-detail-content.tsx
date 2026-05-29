'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import {
  cancelVoucherAction, reactivateVoucher, adjustVoucherBalance, updateVoucherNotes,
  updateVoucherExpiryAction, reassignVoucherClientAction, type VoucherDetail,
} from '@/actions/vouchers'
import { listClients } from '@/actions/clients'
import { formatCurrency, formatDate } from '@/lib/utils'

const KIND_LABEL: Record<string, string> = { gift_card: 'Tarjeta regalo', return: 'Devolución', residual: 'Residual' }
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700', used: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700', partially_used: 'bg-amber-100 text-amber-700', expired: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Activo', used: 'Usado', cancelled: 'Anulado', partially_used: 'Usado parcial', expired: 'Caducado',
}

export function VoucherDetailContent({ voucher }: { voucher: VoucherDetail }) {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const v = voucher
  const canManage = can('vouchers.manage')
  const canSell = can('pos.sell')
  const expired = v.expiry_date ? v.expiry_date < new Date().toISOString().slice(0, 10) : false

  const [busy, setBusy] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjAmount, setAdjAmount] = useState(String(v.remaining_amount))
  const [adjReason, setAdjReason] = useState('')
  const [reactivateOpen, setReactivateOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesVal, setNotesVal] = useState(v.notes ?? '')
  const [expiryOpen, setExpiryOpen] = useState(false)
  const [expiryVal, setExpiryVal] = useState(v.expiry_date ?? '')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [reassignOpen, setReassignOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; full_name: string; client_code?: string }[]>([])

  useEffect(() => {
    if (!reassignOpen) return
    const term = clientSearch.trim()
    if (term.length < 2) { setClientResults([]); return }
    let cancelled = false
    const h = setTimeout(async () => {
      const r = await listClients({ page: 1, pageSize: 8, search: term, sortBy: 'full_name', sortOrder: 'asc' })
      if (!cancelled && r.success) setClientResults(r.data.data as { id: string; full_name: string; client_code?: string }[])
    }, 300)
    return () => { cancelled = true; clearTimeout(h) }
  }, [clientSearch, reassignOpen])

  const doReassign = async (clientId: string | null) => {
    setBusy(true)
    const r = await reassignVoucherClientAction({ voucherId: v.id, clientId })
    setReassignOpen(false); setClientSearch(''); setClientResults([])
    after(clientId ? 'Cliente reasignado' : 'Cliente desasignado')(r)
  }

  const after = (msg: string) => (r: { success: boolean; error?: string }) => {
    setBusy(false)
    if (r.success) { toast.success(msg); router.refresh() }
    else toast.error(r.error)
  }

  const newAmt = parseFloat(adjAmount)
  const exceedsOriginal = !isNaN(newAmt) && newAmt > v.original_amount
  const raisesBalance = !isNaN(newAmt) && newAmt > v.remaining_amount

  const doAdjust = async () => {
    if (isNaN(newAmt) || newAmt < 0) { toast.error('Importe inválido'); return }
    if (adjReason.trim().length < 10) { toast.error('El motivo debe tener al menos 10 caracteres'); return }
    setBusy(true)
    const r = await adjustVoucherBalance({ voucherId: v.id, newRemaining: newAmt, reason: adjReason.trim() })
    setAdjustOpen(false); after('Saldo ajustado')(r)
  }
  const doReactivate = async () => { setBusy(true); const r = await reactivateVoucher({ voucherId: v.id }); setReactivateOpen(false); after('Vale reactivado')(r) }
  const doNotes = async () => { setBusy(true); const r = await updateVoucherNotes({ voucherId: v.id, notes: notesVal }); setNotesOpen(false); after('Notas actualizadas')(r) }
  const doExpiry = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryVal)) { toast.error('Fecha inválida'); return }
    setBusy(true); const r = await updateVoucherExpiryAction({ voucherId: v.id, expiryDate: expiryVal }); setExpiryOpen(false); after('Caducidad actualizada')(r)
  }
  const doCancel = async () => { setBusy(true); const r = await cancelVoucherAction({ voucherId: v.id, reason: cancelReason.trim() || null }); setCancelOpen(false); after('Vale anulado')(r) }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon"><Link href="/admin/tickets/vales"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight font-mono">{v.code}</h1>
            <Badge className={`text-xs ${STATUS_BADGE[v.status] ?? ''}`}>{STATUS_LABEL[v.status] ?? v.status}</Badge>
            <Badge variant="outline" className="text-xs">{KIND_LABEL[v.voucher_kind ?? ''] ?? v.voucher_kind}</Badge>
            {expired && v.status !== 'cancelled' && <Badge className="text-xs bg-red-100 text-red-700">Caducado</Badge>}
          </div>
          <p className="text-muted-foreground">Saldo {formatCurrency(v.remaining_amount)} de {formatCurrency(v.original_amount)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canManage && isAdmin && v.status !== 'cancelled' && (
          <Button variant="outline" size="sm" onClick={() => { setAdjAmount(String(v.remaining_amount)); setAdjReason(''); setAdjustOpen(true) }}>Ajustar saldo</Button>
        )}
        {canManage && v.status === 'cancelled' && (
          <Button variant="outline" size="sm" onClick={() => setReactivateOpen(true)}>Reactivar</Button>
        )}
        {canSell && (v.status === 'active' || v.status === 'partially_used') && (
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => { setCancelReason(''); setCancelOpen(true) }}>Anular</Button>
        )}
        {canSell && v.status !== 'cancelled' && (
          <Button variant="outline" size="sm" onClick={() => { setExpiryVal(v.expiry_date ?? ''); setExpiryOpen(true) }}>Editar caducidad</Button>
        )}
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => { setNotesVal(v.notes ?? ''); setNotesOpen(true) }}>Editar notas</Button>
        )}
        {canSell && (
          <Button variant="outline" size="sm" onClick={() => { setClientSearch(''); setClientResults([]); setReassignOpen(true) }}>Reasignar cliente</Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del vale</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Tipo:</span> {KIND_LABEL[v.voucher_kind ?? ''] ?? v.voucher_kind} ({v.voucher_type})</p>
            <p><span className="text-muted-foreground">Importe original:</span> {formatCurrency(v.original_amount)}</p>
            <p><span className="text-muted-foreground">Saldo restante:</span> <span className="font-semibold text-green-700">{formatCurrency(v.remaining_amount)}</span></p>
            <p><span className="text-muted-foreground">Cliente:</span> {v.client_id ? <Link href={`/admin/clientes/${v.client_id}`} className="underline">{v.client_name ?? '—'}</Link> : '—'}</p>
            <p><span className="text-muted-foreground">Emitido:</span> {v.issued_date ? formatDate(v.issued_date) : '—'} · Caduca: {v.expiry_date ? formatDate(v.expiry_date) : '—'}</p>
            <p><span className="text-muted-foreground">Tienda emisora:</span> {v.store_name ?? '—'}</p>
            <p><span className="text-muted-foreground">Origen:</span> {v.origin_ticket ? <span className="font-mono">{v.origin_ticket}</span> : (v.voucher_kind === 'gift_card' ? 'Creado desde admin' : '—')}</p>
            {v.parent && <p><span className="text-muted-foreground">Vale padre:</span> <Link href={`/admin/tickets/vales/${v.parent.id}`} className="font-mono underline">{v.parent.code}</Link></p>}
            {v.children.length > 0 && (
              <p><span className="text-muted-foreground">Vales residuales:</span> {v.children.map((c) => <Link key={c.id} href={`/admin/tickets/vales/${c.id}`} className="font-mono underline mr-2">{c.code}</Link>)}</p>
            )}
            {v.notes && <div className="mt-2 p-2 rounded bg-muted text-xs whitespace-pre-line">{v.notes}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Historial de canjes</CardTitle></CardHeader>
          <CardContent>
            {v.redemptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este vale no se ha canjeado en ninguna venta.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Canjeado</TableHead><TableHead>Tienda</TableHead></TableRow></TableHeader>
                <TableBody>
                  {v.redemptions.map((rd, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{rd.ticket_number ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{rd.created_at ? formatDate(rd.created_at) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(rd.amount)}</TableCell>
                      <TableCell>{rd.store_name ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ajustar saldo */}
      <Dialog open={adjustOpen} onOpenChange={(o) => { if (!o) setAdjustOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar saldo del vale</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Saldo actual: <b>{formatCurrency(v.remaining_amount)}</b> · Original: <b>{formatCurrency(v.original_amount)}</b></p>
            <div className="space-y-2">
              <Label>Nuevo saldo (€)</Label>
              <Input type="number" step="0.01" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} autoFocus />
            </div>
            {exceedsOriginal && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Esto subirá también el importe original a {formatCurrency(newAmt)}. Es un ajuste de pasivo sin asiento contable.
              </div>
            )}
            {raisesBalance && !exceedsOriginal && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Estás aumentando el saldo (regalando crédito sin contrapartida de caja). Asegúrate de tener la justificación clara.
              </div>
            )}
            <div className="space-y-2">
              <Label>Motivo (obligatorio, mín. 10 caracteres)</Label>
              <Textarea rows={2} value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Ej: corrección de devolución TICK-XXXX que se calculó mal" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={doAdjust} disabled={busy || adjReason.trim().length < 10}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Aplicar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivar */}
      <AlertDialog open={reactivateOpen} onOpenChange={(o) => { if (!o) setReactivateOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reactivar este vale?</AlertDialogTitle>
            <AlertDialogDescription>
              El vale {v.code} volverá a estar disponible.{expired ? ' ⚠️ Está caducado por fecha: no será canjeable hasta que edites la caducidad.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doReactivate() }} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Reactivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editar notas */}
      <Dialog open={notesOpen} onOpenChange={(o) => { if (!o) setNotesOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar notas</DialogTitle></DialogHeader>
          <Textarea rows={5} value={notesVal} onChange={(e) => setNotesVal(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={doNotes} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar caducidad */}
      <Dialog open={expiryOpen} onOpenChange={(o) => { if (!o) setExpiryOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar caducidad</DialogTitle></DialogHeader>
          <Input type="date" value={expiryVal} onChange={(e) => setExpiryVal(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpiryOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={doExpiry} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anular */}
      <AlertDialog open={cancelOpen} onOpenChange={(o) => { if (!o) setCancelOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular este vale?</AlertDialogTitle>
            <AlertDialogDescription>El vale {v.code} ({formatCurrency(v.remaining_amount)} de saldo) quedará anulado. Podrás reactivarlo después.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-1"><Textarea rows={2} placeholder="Motivo de anulación (opcional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doCancel() }} disabled={busy} className="bg-red-600 hover:bg-red-700">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Anular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reasignar cliente */}
      <Dialog open={reassignOpen} onOpenChange={(o) => { if (!o) setReassignOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reasignar cliente</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Cliente actual: <b>{v.client_name ?? 'sin cliente'}</b></p>
            <Input placeholder="Buscar cliente por nombre, email, teléfono…" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} autoFocus />
            <div className="max-h-52 overflow-y-auto divide-y rounded-md border">
              {clientResults.length === 0 && clientSearch.trim().length >= 2 && <p className="text-xs text-muted-foreground p-3">Sin resultados</p>}
              {clientResults.map((c) => (
                <button key={c.id} type="button" disabled={busy} onClick={() => doReassign(c.id)} className="w-full text-left p-2 hover:bg-muted text-sm">
                  <span className="font-medium">{c.full_name}</span>{c.client_code ? <span className="text-muted-foreground"> · {c.client_code}</span> : null}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)} disabled={busy}>Cancelar</Button>
            {v.client_id && <Button variant="ghost" className="text-red-600" onClick={() => doReassign(null)} disabled={busy}>Quitar cliente</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
