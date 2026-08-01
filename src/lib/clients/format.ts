/**
 * Helpers de formato para datos de cliente.
 *
 * `formatClientAddress` concatena los campos de domicilio (`address`,
 * `postal_code`, `city`, `province`, `country`) en una sola cadena. Se usa
 * en todos los flujos de creación de factura para "snapshotar" la
 * dirección en `invoices.client_address` con un formato uniforme.
 *
 * Devuelve string vacío si todos los campos vienen vacíos — el caller debe
 * convertirlo a `null` antes de persistirlo si es lo que la columna espera.
 */
export function formatClientAddress(c: {
  address?: string | null
  postal_code?: string | null
  city?: string | null
  province?: string | null
  country?: string | null
}): string {
  return [
    c.address?.trim(),
    [c.postal_code?.trim(), c.city?.trim()].filter(Boolean).join(' '),
    c.province?.trim(),
    c.country?.trim(),
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * Destinatario FISCAL de una factura a partir de la ficha de cliente.
 *
 * El nombre y el NIF de una factura tienen que ser del MISMO titular. La ficha
 * mezcla los dos planos —persona de contacto (`full_name`, `document_number`) y
 * sociedad (`company_name`, `company_nif`)—, así que la regla es:
 *
 *   - Con NIF de empresa → la factura va a la SOCIEDAD (razón social + CIF).
 *     El nombre de la persona es solo el contacto y no puede encabezar una
 *     factura cuyo NIF es el de la sociedad.
 *   - Sin NIF de empresa → persona física (nombre + DNI/NIE).
 *
 * Antes se hacía `full_name || company_name` con `company_nif || document_number`,
 * que para un cliente-empresa emitía "Antonio Arias" con el CIF de la sociedad.
 * Ha provocado al menos tres anulaciones en producción (F2026-0008, F2026-0033,
 * F2026-0034).
 */
export function resolveInvoiceParty(
  c: {
    full_name?: string | null
    company_name?: string | null
    company_nif?: string | null
    document_number?: string | null
  },
  fallbackName = 'Consumidor final',
): { name: string; nif: string | null } {
  const person = c.full_name?.trim() || ''
  const company = c.company_name?.trim() || ''
  const companyNif = c.company_nif?.trim() || ''
  const personNif = c.document_number?.trim() || ''

  if (companyNif) {
    return { name: company || person || fallbackName, nif: companyNif }
  }
  return { name: person || company || fallbackName, nif: personNif || null }
}
