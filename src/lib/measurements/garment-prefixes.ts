/**
 * Prefijos con los que buscar las medidas de una prenda en
 * `client_measurements.values`.
 *
 * El formulario de medidas (admin y sastre) solo tiene pestañas para
 * Americana, Pantalón, Chaleco, Camisería, Abrigo, Levita y Frac, y guarda cada
 * medida como `<prenda>_<campo>` (americana_talle, pantalon_tiro…). La camisería
 * es la excepción: se guarda sin prefijo (cuello, canesu, largo_manga…).
 *
 * Pero SÍ se hacen pedidos de prendas sin pestaña propia — chaqué, teba, bata,
 * smoking — cuyas medidas el sastre toma en la pestaña de la prenda equivalente.
 * Un chaqué se mide en "Americana", así que sus medidas viven bajo `americana_`.
 * Buscar solo por `chaque_` no encuentra nada y la ficha sale sin medidas.
 */

/** Prenda → pestaña del formulario en la que realmente se toman sus medidas. */
const FAMILIA_MEDIDAS: Record<string, string> = {
  // Se miden como una americana
  chaque: 'americana',
  chaquet: 'americana',
  teba: 'americana',
  bata: 'americana',
  smoking_jacket: 'americana',
  chaqueta_smoking: 'americana',
  abrigo: 'americana',
  levita: 'americana',
  frac: 'americana',
  // Se miden como un pantalón
  smoking_trouser: 'pantalon',
  pantalon_smoking: 'pantalon',
  // Se miden en Camisería
  camisa: 'camiseria',
  camiseria_industrial: 'camiseria',
}

/**
 * Prefijos a probar, en orden de preferencia:
 *   1. el de la propia prenda (si alguien tomó medidas específicas ahí),
 *   2. el de la pestaña en la que se mide esa prenda,
 *   3. sin prefijo — camisería y registros antiguos.
 *
 * Ejemplos: 'chaque' → ['chaque_', 'americana_', ''] · 'americana' →
 * ['americana_', ''] · '' (sin prenda) → ['americana_', ''].
 */
export function buildMedidasPrefixes(prendaSlug: string): string[] {
  const slug = (prendaSlug || '').trim()
  const prefixes: string[] = []
  if (slug) prefixes.push(`${slug}_`)
  const familia = FAMILIA_MEDIDAS[slug]
  if (familia && familia !== slug) prefixes.push(`${familia}_`)
  // Sin prenda reconocible se mantiene el comportamiento histórico: americana.
  if (!slug) prefixes.push('americana_')
  prefixes.push('')
  return prefixes
}
