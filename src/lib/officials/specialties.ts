/**
 * Catálogo de especialidades de oficiales.
 *
 * Fuente única de verdad: lo importan tanto el formulario de admin
 * (officials-page-content.tsx) como la server action que valida el precio por
 * especialidad (actions/officials.ts). Evita el drift de tener la lista
 * duplicada en cliente y servidor.
 */
export const SPECIALTIES = [
  'Americana',
  'Chaqué',
  'Abrigo',
  'Frac',
  'Chaleco',
  'Pantalón',
  'Teba',
  'Camisería',
  'Americana Industrial',
  'Pantalón Industrial',
  'Chaqué Industrial',
  'Chaleco Industrial',
  'Camisería Industrial',
  'Gabardina',
  'Cortador',
  'Composturas',
] as const

export type Specialty = (typeof SPECIALTIES)[number]
