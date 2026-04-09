/**
 * Ordena tallas en orden lógico: XS → S → M → L → XL → XXL, o numéricas 38 → 40 → 42...
 */

const TEXT_ORDER: Record<string, number> = {
  'U': 0,
  'XS': 1, 'S': 2, 'M': 3, 'M/L': 4, 'L': 5, 'XL': 6, 'XXL': 7, 'XXXL': 8,
}

function sizeSort(sA: string, sB: string): number {
  const upperA = sA.toUpperCase()
  const upperB = sB.toUpperCase()

  // Si ambos están en el mapa de tallas estándar
  if (TEXT_ORDER[upperA] !== undefined && TEXT_ORDER[upperB] !== undefined) {
    return TEXT_ORDER[upperA] - TEXT_ORDER[upperB]
  }

  // Si ambos son numéricos (44, 46, 38.5, etc.)
  const nA = parseFloat(sA)
  const nB = parseFloat(sB)
  if (!isNaN(nA) && !isNaN(nB)) return nA - nB

  // Formato traje "44/38" → ordenar por primer número
  const slashA = parseFloat(sA.split('/')[0])
  const slashB = parseFloat(sB.split('/')[0])
  if (!isNaN(slashA) && !isNaN(slashB)) return slashA - slashB

  // Numérico vs texto: numérico primero
  if (!isNaN(nA) && isNaN(nB)) return -1
  if (isNaN(nA) && !isNaN(nB)) return 1

  // Fallback: alfabético
  return sA.localeCompare(sB)
}

/** Ordena un array de objetos con campo `size` */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sortBySize<T>(items: T[]): T[] {
  return [...items].sort((a, b) => sizeSort(String((a as any).size || ''), String((b as any).size || '')))
}

/** Ordena un array de strings de tallas */
export function sortSizeStrings(sizes: string[]): string[] {
  return [...sizes].sort(sizeSort)
}
