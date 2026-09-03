/**
 * Búsqueda de la ficha de cliente por email.
 *
 * `clients.email` NO es único y hay duplicados reales en producción, muchos de
 * ellos por diferencias de mayúsculas. Buscar con `.eq(email).single()` fallaba
 * por partida doble: `.eq` distingue mayúsculas, y `.single()` devuelve error
 * (data null) en cuanto hay más de una fila. El resultado era que el checkout y
 * la reserva de cita creaban OTRA ficha en cada compra.
 *
 * Aquí se compara sin distinguir mayúsculas y se toleran varias filas,
 * eligiendo la ficha "oficial" de tienda (la que tiene `client_code`) y, si no
 * hay ninguna, la más antigua. Mismo criterio que findLinkableClientsByEmail.
 */

/** Escapa los comodines de LIKE para que `ilike` compare el email literal. */
export function escapeLikePattern(value: string): string {
  return value.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

type MinimalClientRow = { id: string; client_code?: string | null }

/** De varias fichas con el mismo email, la que debe usarse. */
export function pickPreferredClient<T extends MinimalClientRow>(rows: T[] | null | undefined): T | null {
  const list = rows ?? []
  return list.find((c) => c.client_code) ?? list[0] ?? null
}
