/**
 * EAN-13: generación, validación y dígito de control.
 * Prefijo 847 = España. 12 dígitos de datos + 1 dígito de control = 13.
 */

const DEFAULT_PREFIX = '847'
const EAN13_LENGTH = 13

/**
 * Calcula el dígito de control EAN-13.
 * Algoritmo: suma (dígitos en posiciones impares x1) + (dígitos en posiciones pares x3), mod 10, luego (10 - resto) mod 10.
 * Posiciones 1-based: impar = 1,3,5,7,9,11 ; par = 2,4,6,8,10,12.
 */
export function calculateCheckDigit(digits: string): number {
  if (digits.length !== 12) return 0
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i]!, 10)
    if (isNaN(d)) return 0
    sum += (i % 2 === 0 ? 1 : 3) * d
  }
  const remainder = sum % 10
  return (10 - remainder) % 10
}

/**
 * Genera un código EAN-13 único.
 * prefix: 3 dígitos (default '847' España), luego 9 dígitos (aleatorios o basados en seed), luego dígito de control.
 */
export function generateEAN13(prefix: string = DEFAULT_PREFIX): string {
  if (prefix.length !== 3 || !/^\d{3}$/.test(prefix)) {
    prefix = DEFAULT_PREFIX
  }
  const min = 100_000_000
  const max = 999_999_999
  const middle = String(Math.floor(Math.random() * (max - min + 1)) + min)
  const twelve = prefix + middle
  const check = calculateCheckDigit(twelve)
  return twelve + String(check)
}

/**
 * Valida un código EAN-13 (longitud 13, solo dígitos, dígito de control correcto).
 */
export function validateEAN13(code: string): boolean {
  if (!code || code.length !== EAN13_LENGTH) return false
  if (!/^\d{13}$/.test(code)) return false
  const twelve = code.slice(0, 12)
  const expectedCheck = calculateCheckDigit(twelve)
  const actualCheck = parseInt(code[12]!, 10)
  return expectedCheck === actualCheck
}
