'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Printer, Loader2, Usb, Monitor } from 'lucide-react'
import { buildPosTicket, type TicketData } from '@/lib/printing/ticket-builder'
import { printService, type PrinterConnection } from '@/lib/printing/print-service'
import { toast } from 'sonner'

interface TicketPreviewProps {
  open: boolean
  onClose: () => void
  ticketData: TicketData
}

export function TicketPreview({ open, onClose, ticketData }: TicketPreviewProps) {
  const [isPrinting, setIsPrinting] = useState(false)
  const [printerType, setPrinterType] = useState<PrinterConnection>('browser')

  const handlePrint = async () => {
    setIsPrinting(true)
    try {
      if (printerType === 'browser') {
        printService.printBrowser(buildTicketHtml(ticketData))
        toast.success('Imprimiendo...')
      } else {
        const escposData = buildPosTicket(ticketData)
        const config = { type: printerType, name: 'POS Printer', baudRate: 9600 }
        const ok = await printService.print(escposData, config)
        if (ok) toast.success('Ticket impreso')
        else toast.error('Error al imprimir')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error de impresión'
      toast.error(msg)
    }
    setIsPrinting(false)
  }

  const paymentLabels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', mixed: 'Mixto' }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Preview del ticket</DialogTitle></DialogHeader>

        <div className="flex gap-2 mb-4">
          {([
            { type: 'browser' as const, icon: Monitor, label: 'Navegador' },
            { type: 'usb' as const, icon: Usb, label: 'USB' },
            { type: 'serial' as const, icon: Printer, label: 'Serial' },
          ]).map(p => (
            <Button
              key={p.type}
              variant={printerType === p.type ? 'default' : 'outline'}
              size="sm"
              className="flex-1 text-xs gap-1"
              onClick={() => setPrinterType(p.type)}
            >
              <p.icon className="h-3 w-3" />{p.label}
            </Button>
          ))}
        </div>

        <div
          className="bg-white border rounded-lg p-4 font-mono text-[11px] leading-relaxed max-h-[500px] overflow-y-auto shadow-inner"
          style={{ fontFamily: "'Courier New', monospace" }}
        >
          <div className="text-center font-bold text-lg tracking-widest">PRATS</div>
          <div className="text-center text-[9px] tracking-[4px] mb-2">MADRID</div>
          <div className="text-center text-[10px]">{ticketData.store_name}</div>
          <div className="text-center text-[10px]">{ticketData.store_address}</div>
          <div className="text-center text-[10px]">Tel: {ticketData.store_phone}</div>
          <div className="text-center text-[10px] mb-1">CIF: {ticketData.store_cif}</div>
          <div className="border-t border-dashed border-gray-400 my-2" />

          <div className="flex justify-between"><span>Ticket:</span><span>{ticketData.ticket_number}</span></div>
          <div className="flex justify-between"><span>Fecha:</span><span>{ticketData.date} {ticketData.time}</span></div>
          <div className="flex justify-between"><span>Cajero:</span><span>{ticketData.cashier}</span></div>
          {ticketData.client_name && (
            <div className="flex justify-between"><span>Cliente:</span><span>{ticketData.client_name}</span></div>
          )}
          <div className="border-t border-dashed border-gray-400 my-2" />

          <div className="font-bold flex justify-between"><span>Artículo</span><span>Importe</span></div>
          <div className="border-b border-dashed border-gray-300 mb-1" />
          {ticketData.items.map((item, i) => (
            <div key={i}>
              <div>{item.name}</div>
              <div className="flex justify-between text-gray-500">
                <span>  {item.qty} x {item.price.toFixed(2)}€</span>
                <span>{item.total.toFixed(2)}€</span>
              </div>
            </div>
          ))}
          <div className="border-t border-dashed border-gray-400 my-2" />

          <div className="flex justify-between"><span>Subtotal:</span><span>{ticketData.subtotal.toFixed(2)}€</span></div>
          <div className="flex justify-between">
            <span>IVA ({ticketData.tax_rate}%):</span>
            <span>{ticketData.tax_amount.toFixed(2)}€</span>
          </div>
          <div className="border-t border-double border-gray-600 my-1" />
          <div className="flex justify-between font-bold text-base">
            <span>TOTAL:</span><span>{ticketData.total.toFixed(2)}€</span>
          </div>
          <div className="border-b border-double border-gray-600 my-1" />

          <div className="mt-2">
            <div className="flex justify-between">
              <span>Pago:</span>
              <span>{paymentLabels[ticketData.payment_method] || ticketData.payment_method}</span>
            </div>
            {ticketData.amount_paid != null && (
              <div className="flex justify-between">
                <span>Entregado:</span><span>{ticketData.amount_paid.toFixed(2)}€</span>
              </div>
            )}
            {ticketData.change != null && ticketData.change > 0 && (
              <div className="flex justify-between">
                <span>Cambio:</span><span>{ticketData.change.toFixed(2)}€</span>
              </div>
            )}
          </div>

          <div className="text-center mt-4">¡Gracias por su compra!</div>
          <div className="text-center text-[10px] text-gray-400">www.sastreriaprats.com</div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button
            onClick={handlePrint}
            disabled={isPrinting}
            className="gap-2 bg-prats-navy hover:bg-prats-navy/90"
          >
            {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {isPrinting ? 'Imprimiendo...' : 'Imprimir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildTicketHtml(data: TicketData): string {
  const paymentLabels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', mixed: 'Mixto' }
  return `
    <div class="center bold big" style="letter-spacing:6px;">PRATS</div>
    <div class="center" style="letter-spacing:4px;font-size:9px;">MADRID</div>
    <br>
    <div class="center">${data.store_name}</div>
    <div class="center">${data.store_address}</div>
    <div class="center">Tel: ${data.store_phone}</div>
    <div class="center">CIF: ${data.store_cif}</div>
    <div class="line"></div>
    <div class="row"><span>Ticket:</span><span>${data.ticket_number}</span></div>
    <div class="row"><span>Fecha:</span><span>${data.date} ${data.time}</span></div>
    <div class="row"><span>Cajero:</span><span>${data.cashier}</span></div>
    ${data.client_name ? `<div class="row"><span>Cliente:</span><span>${data.client_name}</span></div>` : ''}
    <div class="line"></div>
    ${data.items.map(i => `<div>${i.name}</div><div class="row"><span>  ${i.qty} x ${i.price.toFixed(2)}€</span><span>${i.total.toFixed(2)}€</span></div>`).join('')}
    <div class="line"></div>
    <div class="row"><span>Subtotal:</span><span>${data.subtotal.toFixed(2)}€</span></div>
    <div class="row"><span>IVA (${data.tax_rate}%):</span><span>${data.tax_amount.toFixed(2)}€</span></div>
    <div class="line"></div>
    <div class="row bold big"><span>TOTAL:</span><span>${data.total.toFixed(2)}€</span></div>
    <div class="line"></div>
    <br>
    <div class="row"><span>Pago:</span><span>${paymentLabels[data.payment_method] || data.payment_method}</span></div>
    ${data.amount_paid != null ? `<div class="row"><span>Entregado:</span><span>${data.amount_paid.toFixed(2)}€</span></div>` : ''}
    ${data.change != null && data.change > 0 ? `<div class="row"><span>Cambio:</span><span>${data.change.toFixed(2)}€</span></div>` : ''}
    <br><br>
    <div class="center">¡Gracias por su compra!</div>
    <div class="center" style="font-size:10px;color:#999;">www.sastreriaprats.com</div>
  `
}
