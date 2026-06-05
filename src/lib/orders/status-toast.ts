'use client'

import { toast } from 'sonner'

/**
 * Toast informativo tras cambiar el estado GENERAL de un pedido de sastrería.
 * Estilo B sutil: informa (sin bloquear ni pedir confirmación) de las prendas
 * que se mantienen en su estado por estar ya más adelantadas que el nuevo
 * estado general (propagación forward-only).
 *
 * Compartido entre el diálogo del admin y el detalle del sastre.
 */
export function statusChangeToast(aheadCount: number) {
  if (aheadCount > 0) {
    const n = aheadCount === 1
      ? '1 prenda se mantiene en su estado actual porque ya estaba más adelantada'
      : `${aheadCount} prendas se mantienen en su estado actual porque ya estaban más adelantadas`
    toast.success(`Estado cambiado. ${n}.`)
  } else {
    toast.success('Estado actualizado')
  }
}
