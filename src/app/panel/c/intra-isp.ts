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

// Tipo de IVA de la factura recibida, en claro, para saber de un vistazo qué es
// intracomunitaria (ISP), qué es nacional y a qué tipo, y qué viene de fuera de la UE.
export type VatRegimeTag = { label: string; tone: 'intra' | 'extra' | 'nacional' | 'exenta' }
export function vatRegimeTag(f: ApInvoiceLite): VatRegimeTag {
  const noVat = Math.abs(f.vat) < 0.005
  const rate = f.vatRate === null ? 'varios tipos' : `${f.vatRate} %`
  if (f.regime === 'intra') {
    return noVat
      ? { label: `Intracomunitaria · ISP ${ISP_RATE} %`, tone: 'intra' }
      : { label: `Intracomunitaria con IVA ${rate}`, tone: 'intra' }
  }
  if (f.regime === 'extra') {
    return noVat
      ? { label: 'Extracomunitaria · sin IVA', tone: 'extra' }
      : { label: `Extracomunitaria con IVA ${rate}`, tone: 'extra' }
  }
  return noVat
    ? { label: 'Nacional · sin IVA (0 %)', tone: 'exenta' }
    : { label: `Nacional · ${rate}`, tone: 'nacional' }
}
