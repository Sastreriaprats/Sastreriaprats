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
