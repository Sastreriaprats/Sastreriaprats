/**
 * Utilidades de fecha en hora LOCAL.
 *
 * `toISOString()` convierte a UTC y en España (UTC+1/+2) devuelve el día
 * anterior para cualquier fecha a medianoche local. Construir rangos con él
 * corre el rango un día: el "1 de septiembre" se pide como 31 de agosto y el
 * último día del mes se pierde. Este fallo ya mordió en Contabilidad, en el
 * Dashboard y en el Calendario, así que el formateo local vive aquí, en un
 * único sitio, y no se reimplementa en cada pantalla.
 */

/** YYYY-MM-DD en hora local (nunca corre el día como `toISOString()`). */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Hoy en YYYY-MM-DD, hora local. */
export function todayLocalISODate(): string {
  return toLocalISODate(new Date())
}

/** Primer y último día del mes de `d`, en YYYY-MM-DD local. */
export function monthRangeLocal(d: Date): { start: string; end: string } {
  return {
    start: toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: toLocalISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  }
}
