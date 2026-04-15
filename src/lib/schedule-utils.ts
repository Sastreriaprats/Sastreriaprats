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

/** Filtrar slots que caen dentro de un bloqueo horario */
export function filterBlockedSlots(
  slots: string[],
  blocks: { all_day: boolean; start_time: string | null; end_time: string | null }[]
): string[] {
  if (blocks.length === 0) return slots
  if (blocks.some(b => b.all_day)) return [] // Día completo bloqueado

  return slots.filter(slot => {
    const [h, m] = slot.split(':').map(Number)
    const slotEnd = `${Math.floor((h * 60 + m + 30) / 60).toString().padStart(2, '0')}:${((h * 60 + m + 30) % 60).toString().padStart(2, '0')}`
    return !blocks.some(b => {
      if (!b.start_time || !b.end_time) return false
      return b.start_time < slotEnd && b.end_time > slot
    })
  })
}
