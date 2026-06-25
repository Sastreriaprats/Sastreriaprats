/**
 * Utilidades de horarios de tienda.
 * Sábados: 10:00–13:30 | Domingos: cerrado
 * Lunes–Viernes: 10:00–13:30, 17:00–19:30
 */

/** Slots públicos de reserva según el día de la semana */
export function getPublicSlots(dateStr: string): string[] {
  const dow = new Date(dateStr + 'T12:00:00').getDay() // 0=Dom, 6=Sáb

  if (dow === 0) return [] // Domingo cerrado

  const morningSlots = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30']

  if (dow === 6) return morningSlots // Sábado solo mañana

  // Lunes-Viernes: mañana + tarde
  return [
    ...morningSlots,
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  ]
}

/** Rango de horas para la vista admin según el día de la semana */
export function getAdminHours(dateStr: string): number[] {
  const dow = new Date(dateStr + 'T12:00:00').getDay()
  if (dow === 0) return [] // Domingo cerrado
  if (dow === 6) return [8, 9, 10, 11, 12, 13] // Sábado: 8:00-13:59
  return Array.from({ length: 13 }, (_, i) => i + 8) // L-V: 8:00-20:00
}

/** Hora de apertura y cierre para getTailorAvailability */
export function getBusinessHours(dateStr: string): { open: string; close: string } | null {
  const dow = new Date(dateStr + 'T12:00:00').getDay()
  if (dow === 0) return null // Domingo cerrado
  if (dow === 6) return { open: '09:00', close: '14:00' }
  return { open: '09:00', close: '20:00' }
}

/** ¿Está cerrado este día (domingo)? */
export function isDayClosed(dateStr: string): boolean {
  return new Date(dateStr + 'T12:00:00').getDay() === 0
}

/** ¿Es sábado? */
export function isSaturday(dateStr: string): boolean {
  return new Date(dateStr + 'T12:00:00').getDay() === 6
}

export interface ScheduleBlockLike {
  all_day: boolean
  start_time: string | null
  end_time: string | null
  title?: string | null
}

/**
 * FUENTE ÚNICA de la lógica de choque cita↔bloqueo.
 *
 * Devuelve el primer bloqueo que choca con la franja [startTime, endTime), o
 * null si la franja está libre. Se asume que `blocks` ya viene filtrado por
 * fecha y por alcance de tienda (la query usa `store_id.eq.X OR store_id IS
 * NULL`, donde NULL = "Todas las tiendas").
 *
 * Un bloqueo choca si:
 *   - es de día completo (`all_day`), o
 *   - solapa el horario: block.start < cita.end && block.end > cita.start
 *     (el borde toca-pero-no-solapa NO cuenta: cita 10–11 vs bloqueo 11–12 = libre).
 *
 * Las horas se normalizan a HH:MM (la BD guarda HH:MM:SS; las citas, HH:MM).
 */
export function isSlotBlocked<T extends ScheduleBlockLike>(
  blocks: T[],
  startTime: string,
  endTime: string,
): T | null {
  const s = startTime.slice(0, 5)
  const e = endTime.slice(0, 5)
  for (const b of blocks) {
    if (b.all_day) return b
    if (!b.start_time || !b.end_time) continue
    if (b.start_time.slice(0, 5) < e && b.end_time.slice(0, 5) > s) return b
  }
  return null
}

/** Filtrar slots que caen dentro de un bloqueo horario */
export function filterBlockedSlots(
  slots: string[],
  blocks: ScheduleBlockLike[]
): string[] {
  if (blocks.length === 0) return slots

  return slots.filter(slot => {
    const [h, m] = slot.split(':').map(Number)
    const slotEnd = `${Math.floor((h * 60 + m + 30) / 60).toString().padStart(2, '0')}:${((h * 60 + m + 30) % 60).toString().padStart(2, '0')}`
    return !isSlotBlocked(blocks, slot, slotEnd)
  })
}
