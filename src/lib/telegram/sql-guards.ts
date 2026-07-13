// Guardas deterministas sobre el SQL que genera el LLM antes de ejecutarlo.
//
// Caso real (Wellington, 7-9 jul 2026): Kimi generó un JOIN directo de sales con
// sale_lines y sumó sales.total en la misma consulta; cada venta se repite una vez
// por línea y el importe salió multiplicado (los tickets con count(distinct) salían
// bien, lo que disimuló el error). Aquí se rechaza ese patrón con un mensaje que
// enseña al modelo el patrón correcto para que reintente.

// Columnas de la cabecera de "sales" cuyo SUM se infla con un JOIN 1-N a sale_lines.
const SALES_HEADER_COLS = 'total|subtotal|tax_amount|discount_amount|amount_paid|total_returned'

const RESERVED = /^(on|where|join|left|right|inner|cross|full|group|order|limit|as|using|natural)$/i

/**
 * Devuelve un mensaje de error si el SQL suma columnas de la cabecera de "sales"
 * en una consulta con JOIN directo entre "sales" y "sale_lines" (fan-out), o null
 * si la consulta es segura. El patrón correcto (CTE que agrega sale_lines por
 * sale_id y luego se une a sales) no dispara la guarda: ahí "sale_lines" aparece
 * tras FROM dentro de la CTE y el JOIN externo es contra la CTE, no contra la tabla.
 */
export function fanOutError(sql: string): string | null {
  const directJoin =
    (/\bjoin\s+(?:public\.)?sale_lines\b/i.test(sql) && /\b(?:from|join)\s+(?:public\.)?sales\b/i.test(sql)) ||
    (/\bfrom\s+(?:public\.)?sale_lines\b/i.test(sql) && /\bjoin\s+(?:public\.)?sales\b/i.test(sql))
  if (!directJoin) return null

  // Alias con el que se referencia la tabla sales (si lo hay).
  const aliasMatch = sql.match(/\b(?:from|join)\s+(?:public\.)?sales\b(?:\s+as)?\s+([a-zA-Z_][a-zA-Z0-9_]*)?/i)
  const rawAlias = aliasMatch?.[1]
  const alias = rawAlias && !RESERVED.test(rawAlias) ? rawAlias : null

  // SUM(sa.total), SUM(sales.total) o SUM(total) sin cualificar (sale_lines no
  // tiene esas columnas, así que sin prefijo también resuelven a sales).
  const prefix = alias ? `(?:${alias}|sales)` : 'sales'
  const sumHeader = new RegExp(
    `\\bsum\\s*\\(\\s*(?:distinct\\s+)?(?:${prefix}\\.)?(?:${SALES_HEADER_COLS})\\b`,
    'i'
  )
  if (!sumHeader.test(sql)) return null

  return (
    'Consulta rechazada por riesgo de FAN-OUT: sumas una columna de la CABECERA de "sales" ' +
    '(total/subtotal/tax_amount/…) en una consulta con JOIN directo a "sale_lines". El JOIN repite ' +
    'cada venta una vez por línea y el importe sale multiplicado (los tickets con count(distinct) ' +
    'saldrían bien, pero el dinero NO). Reescribe agregando las líneas en una CTE por sale_id y ' +
    'uniéndola a sales, p. ej.: WITH lineas AS (SELECT sale_id, SUM(quantity) AS productos ' +
    'FROM sale_lines GROUP BY sale_id) SELECT ..., SUM(sa.total) AS total_ventas, ' +
    'COALESCE(SUM(l.productos),0) AS productos FROM sales sa LEFT JOIN lineas l ON l.sale_id = sa.id ...'
  )
}
