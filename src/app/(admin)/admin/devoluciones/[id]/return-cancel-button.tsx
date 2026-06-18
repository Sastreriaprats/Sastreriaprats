'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Undo2, AlertTriangle, Ban, Package, Ticket, Banknote, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { previewReturnCancellation, cancelReturn, type ReturnCancellationPreview } from '@/actions/returns'
import { formatCurrency } from '@/lib/utils'

export function ReturnCancelButton({ returnId }: { returnId: string }) {
  const router = useRouter()
  const { can } = usePermissions()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [preview, setPreview] = useState<ReturnCancellationPreview | null>(null)

  // Mismo permiso que el server (cancelReturn → sales.edit). Sin él, no se ve.
  if (!can('sales.edit')) return null

  async function openDialog() {
    setOpen(true)
    setLoading(true)
    setPreview(null)
    try {
      const res = await previewReturnCancellation({ returnId })
      if (res.success) setPreview(res.data)
      else toast.error(res.error ?? 'No se pudo cargar la previsualización')
    } catch {
      toast.error('Error inesperado al cargar la previsualización')
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    setCancelling(true)
    try {
      const res = await cancelReturn({ returnId })
      if (res.success) {
        toast.success('Devolución anulada. La venta vuelve a su estado anterior.')
        setOpen(false)
        router.push('/admin/devoluciones')
        router.refresh()
      } else {
        toast.error(res.error ?? 'No se pudo anular la devolución')
      }
    } catch {
      toast.error('Error inesperado al anular')
    } finally {
      setCancelling(false)
    }
  }

  const reverts = preview?.reverts
  const nStock = reverts?.stock_back_to_sold?.length ?? 0

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
        onClick={openDialog}
      >
        <Undo2 className="h-4 w-4" />
        Anular devolución
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!cancelling) setOpen(v) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anular devolución</DialogTitle>
            <DialogDescription>
              Deshacer una devolución revierte sus efectos (stock, vale, caja) y restaura la venta original.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : preview ? (
            preview.can_cancel ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Se revertirá:</p>
                <ul className="space-y-2 text-sm">
                  {reverts?.voucher_to_cancel && (
                    <li className="flex items-start gap-2">
                      <Ticket className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <span>Se cancelará el vale <span className="font-mono">{reverts.voucher_to_cancel.code ?? '—'}</span> de {formatCurrency(reverts.voucher_to_cancel.amount)}.</span>
                    </li>
                  )}
                  {reverts?.cash && (
                    <li className="flex items-start gap-2">
                      <Banknote className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <span>Se devolverá {formatCurrency(reverts.cash.amount)} a la caja{reverts.cash.session_status === 'closed' ? ' (sesión cerrada: se recalculará su arqueo)' : ''}.</span>
                    </li>
                  )}
                  {nStock > 0 && (
                    <li className="flex items-start gap-2">
                      <Package className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <span>{nStock} {nStock === 1 ? 'artículo vuelve' : 'artículos vuelven'} a contar como vendido (sale del inventario).</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <RotateCcw className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <span>La venta <span className="font-mono">{preview.sale?.ticket_number ?? '—'}</span> vuelve a su estado anterior y la devolución desaparece.</span>
                  </li>
                </ul>
                {preview.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {preview.blockers.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-2.5 text-sm text-red-800">
                    <Ban className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </div>
                ))}
                {preview.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={cancelling}>
              {preview && !preview.can_cancel ? 'Cerrar' : 'Cancelar'}
            </Button>
            {preview?.can_cancel && (
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirm}
                disabled={cancelling}
              >
                {cancelling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar anulación
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
