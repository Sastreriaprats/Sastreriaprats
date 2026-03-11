/**
 * Datos de empresa y helpers compartidos para PDFs (factura, presupuesto, ticket).
 */

export const COMPANY = {
  name: 'Prast, Eugercios y González S.L.',
  nif: 'B88391834',
  address: 'Calle Hermanos Pinzón, 4',
  postalCode: '28036',
  city: 'Madrid',
  country: 'España',
  fullAddress: 'Calle Hermanos Pinzón, 4\n28036, Madrid, España',
  footerLine1: 'Prast, Eugercios y González S.L. · B88391834 · Calle Hermanos Pinzón, 4, 28036, Madrid, España',
  registroMercantil: 'Inscrita en el Registro Mercantil de Madrid, Tomo 39.266, Sección: 8, Folio: 140, Hoja: M-697.467, Inscripción 1ª',
  phone: '912 402 845',
  email: 'info@sastreriaprats.com',
  web: 'www.sastreriaprats.com',
  payment: {
    form: 'Transferencia bancaria',
    beneficiary: 'Prast Eugercios y Gonzalez S.L.',
    bank: 'Santander',
    iban: 'ES20 0049 1921 4929 1018 6941',
    bic: 'BSCHESM',
  },
  estimateValidity: 'Este presupuesto tiene una validez de 30 días desde la fecha de emisión.',
  returnsPolicy: `Sastrería Prats, acepta el cambio o la devolución de sus productos en el plazo máximo de 15 días naturales desde la fecha de compra, siempre que estos no hayan sido ajustados, usados y/o deteriorados. El importe pagado por los artículos se devolverá en un vale con saldo a favor del cliente con una caducidad de 6 meses. Para ello será imprescindible la presentación del tique de compra y, en su caso, resguardo de la operación. Cuando el único documento que se presente para el cambio o devolución sea el tique regalo, se entregará una tarjeta abono, consultar las condiciones que constan en el anverso de la misma, y disponibles en tienda. No se admiten ni cambios ni devoluciones de prendas modificadas y/o personalizadas a petición del cliente, ropa interior y baño.`,
} as const

export function formatDateDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

export function eurFormat(value: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' €'
}

/** Logo en data URL base64 (public/images/logo-prats) */
export const LOGO_BASE64 =
  "data:image/jpeg;base64,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" as const;

/** En servidor o cliente: devuelve el logo como data URL base64. */
export function getLogoBase64(): string | null {
  return LOGO_BASE64;
}

/** En cliente (browser): devuelve el logo como data URL base64. */
export function getLogoBase64Client(): string | null {
  return LOGO_BASE64;
}
