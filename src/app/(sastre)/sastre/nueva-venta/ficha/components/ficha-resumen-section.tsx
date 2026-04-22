'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'bizum'

interface Props {
  precioConfeccion: number
  totalCamisas: number
  totalComplementos: number
  total: number
  pendiente: number
  entregaACuenta: number
  setEntregaACuenta: (v: number) => void
  metodoPago: MetodoPago
  setMetodoPago: (v: MetodoPago) => void
  submitting: boolean
  onSubmit: () => void
}

export function FichaResumenSection({
  precioConfeccion, totalCamisas, totalComplementos, total, pendiente,
  entregaACuenta, setEntregaACuenta, metodoPago, setMetodoPago,
  submitting, onSubmit,
}: Props) {
  return (
    <section className="rounded-xl border border-[#c9a96e]/30 bg-[#0d1629] p-5 space-y-3">
      <h2 className="font-serif text-lg text-[#c9a96e]">Resumen precios</h2>
      <dl className="space-y-1 text-white/90">
        {precioConfeccion > 0 && (
          <div className="flex justify-between">
            <span>Precio confección:</span>
            <span>{precioConfeccion.toFixed(2)} €</span>
          </div>
        )}
        {totalCamisas > 0 && (
          <div className="flex justify-between">
            <span>Camisas:</span>
            <span>{totalCamisas.toFixed(2)} €</span>
          </div>
        )}
        {totalComplementos > 0 && (
          <div className="flex justify-between">
            <span>Complementos:</span>
            <span>{totalComplementos.toFixed(2)} €</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-white pt-2 border-t border-[#c9a96e]/20">
          <span>TOTAL:</span>
          <span>{total.toFixed(2)} €</span>
        </div>
      </dl>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-white/80">Entrega a cuenta (€)</Label>
          <Input type="number" min={0} step={0.01} className="mt-1 min-h-[48px] bg-[#1a2744] border-[#c9a96e]/20 text-white" value={entregaACuenta || ''} onChange={(e) => setEntregaACuenta(parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <Label className="text-white/80">
            Método de pago
            {(Number(entregaACuenta) || 0) > 0 && <span className="text-[#c9a96e] ml-0.5">*</span>}
          </Label>
          <Select value={metodoPago} onValueChange={(v: MetodoPago) => setMetodoPago(v)}>
            <SelectTrigger className="mt-1 min-h-[48px] bg-[#1a2744] border-[#c9a96e]/20 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
              <SelectItem value="efectivo" className="text-white focus:bg-white/10 focus:text-white">Efectivo</SelectItem>
              <SelectItem value="tarjeta" className="text-white focus:bg-white/10 focus:text-white">Tarjeta</SelectItem>
              <SelectItem value="transferencia" className="text-white focus:bg-white/10 focus:text-white">Transferencia</SelectItem>
              <SelectItem value="bizum" className="text-white focus:bg-white/10 focus:text-white">Bizum</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-white/80">Pendiente: <strong className="text-white">{pendiente.toFixed(2)} €</strong></p>
      <Button type="button" className="w-full min-h-[48px] bg-[#c9a96e]/20 border border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/30" onClick={onSubmit} disabled={submitting || total <= 0}>
        {submitting ? 'Creando pedido...' : 'Crear pedido y descargar ficha'}
      </Button>
    </section>
  )
}
