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
  phone: '912 401 845',
  email: 'info@sastreriaprats.com',
  web: 'www.sastreriaprats.com',
  payment: {
    form: 'Transferencia bancaria',
    beneficiary: 'Prast Eugercios y Gonzalez S.L.',
    bank: 'Santander',
    iban: 'ES20 0049 1921 4929 1018 6941',
    bic: 'BSCHESM',
  },
  estimateValidity: 'El presente presupuesto tiene una validez de 30 días naturales a partir de la fecha de emisión. Transcurrido dicho plazo sin confirmación por parte del cliente, Prast, Eugercios y González S.L. se reserva el derecho de revisar o modificar las condiciones económicas y los plazos indicados. La aceptación del presupuesto por parte del cliente implicará la conformidad con los conceptos, importes y condiciones reflejadas en el mismo. Cualquier modificación o trabajo adicional no contemplado inicialmente podrá ser objeto de un nuevo presupuesto o ajuste en el importe final.',
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

/** Datos de cada tienda para el ticket PDF (cabecera y teléfonos). */
export const STORE_PDF_CONFIGS: Record<string, { address: string; subtitle?: string; phones: string }> = {
  pinzon: {
    address: 'Calle Hermanos Pinzón, 4 - 28036 Madrid',
    phones: '+34 912 401 845 - +34 669 98 55 47',
  },
  wellington: {
    address: 'Calle Velázquez, 8 - 28001 Madrid',
    subtitle: 'Wellington Hotel & Spa',
    phones: '+34 671 35 34 65',
  },
}

/** Devuelve la config de tienda para el ticket según el nombre de tienda del sistema. */
export function getStorePdfData(storeName: string | null | undefined): { address: string; subtitle?: string; phones: string } {
  if (storeName) {
    const key = storeName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (key.includes('wellington')) return STORE_PDF_CONFIGS.wellington
    if (key.includes('pinzon') || key.includes('hermanos') || key.includes('principal')) return STORE_PDF_CONFIGS.pinzon
  }
  return STORE_PDF_CONFIGS.pinzon
}

/** En cliente (browser): carga el logo desde /images/logo-prats-crop.png y devuelve data URL base64. */
export async function getLogoBase64Client(): Promise<string | null> {
  try {
    const res = await fetch('/images/logo-prats-crop.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
