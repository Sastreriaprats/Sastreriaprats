// Adquisiciones intracomunitarias con INVERSIÓN DEL SUJETO PASIVO: el proveedor
// UE factura sin IVA y la empresa autorrepercute el IVA español (devengado,
// 303 casillas 10-11) y lo deduce a la vez (36-37 bienes corrientes / 28-29
// servicios): efecto neto cero en el resultado, pero debe figurar en ambos lados.
// Si el proveedor UE ya factura con IVA (p.ej. Adobe vía OSS) no hay ISP.
// Tipo general del 21 %: el de los tejidos, avíos y servicios que se compran.
import type { ApInvoiceLite } from '@/lib/ops/types'

export const ISP_RATE = 21
export const isIsp = (f: ApInvoiceLite) => f.isIntraEU && Math.abs(f.vat) < 0.005
export const ispVat = (f: ApInvoiceLite) => Number(((f.base * ISP_RATE) / 100).toFixed(2))
