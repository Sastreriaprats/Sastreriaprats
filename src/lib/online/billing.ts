// Datos de facturación que el cliente rellena en el checkout cuando quiere
// FACTURA (mig 287). Sin ellos el pedido online lleva ticket (mig 286).
// Se valida igual en el navegador y en /api/public/checkout.

export type OnlineBilling = {
  /** Nombre completo o razón social */
  name: string
  /** NIF / CIF / NIE (o VAT number fuera de España) */
  tax_id: string
  address: string
  postal_code: string
  city: string
  province: string
  /** ISO-2 */
  country: string
}

export const EMPTY_BILLING: OnlineBilling = {
  name: '', tax_id: '', address: '', postal_code: '', city: '', province: '', country: 'ES',
}

/** NIF/CIF/NIE sin espacios, guiones ni puntos, en mayúsculas. */
export function normalizeTaxId(value: string): string {
  return value.replace(/[\s.\-]/g, '').toUpperCase()
}

// DNI (8 dígitos + letra), NIE (X/Y/Z + 7 dígitos + letra) o CIF (letra + 7
// dígitos + dígito/letra). Solo forma; la letra de control no se comprueba.
const SPANISH_TAX_ID = /^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])$/

const FIELD_LABELS: Record<keyof OnlineBilling, string> = {
  name: 'nombre o razón social',
  tax_id: 'NIF/CIF',
  address: 'dirección',
  postal_code: 'código postal',
  city: 'ciudad',
  province: 'provincia',
  country: 'país',
}

/**
 * Limpia y valida los datos de factura. Todos los campos son obligatorios.
 * Devuelve el primer error legible o los datos normalizados.
 */
export function validateBilling(raw: unknown): { ok: true; billing: OnlineBilling } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (k: keyof OnlineBilling) => String(r[k] ?? '').trim().slice(0, 200)
  const billing: OnlineBilling = {
    name: str('name'),
    tax_id: normalizeTaxId(str('tax_id')),
    address: str('address'),
    postal_code: str('postal_code'),
    city: str('city'),
    province: str('province'),
    country: str('country').toUpperCase() || 'ES',
  }
  for (const key of Object.keys(FIELD_LABELS) as (keyof OnlineBilling)[]) {
    if (!billing[key]) return { ok: false, error: `Para la factura falta: ${FIELD_LABELS[key]}` }
  }
  if (billing.country === 'ES' && !SPANISH_TAX_ID.test(billing.tax_id)) {
    return { ok: false, error: 'El NIF/CIF de la factura no tiene un formato válido' }
  }
  if (billing.tax_id.length < 5) {
    return { ok: false, error: 'El NIF/CIF de la factura no es válido' }
  }
  return { ok: true, billing }
}

/** Lee `billing` guardado en el pedido (jsonb) si está completo. */
export function readStoredBilling(raw: unknown): OnlineBilling | null {
  if (!raw || typeof raw !== 'object') return null
  const v = validateBilling(raw)
  return v.ok ? v.billing : null
}
