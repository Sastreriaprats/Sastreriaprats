/**
 * Textos que ve el cliente en la tienda online.
 *
 * En el admin (Producto → Editar → Web / Tienda online) se pueden rellenar
 * `web_title` y `web_description` para dar al producto un texto comercial
 * distinto del interno de almacén (que suele ir en mayúsculas y con la
 * referencia del proveedor: "AMERICANA ESTERILLA CELESTE VBC"). Si están
 * vacíos se cae al `name`/`description` de siempre, así que un producto sin
 * datos web se sigue viendo igual que antes.
 *
 * Ojo: el nombre INTERNO es el que se guarda en el carrito, el pedido y el
 * albarán, para que quien prepara el pedido en tienda vea la referencia que
 * conoce. Estos helpers son solo para el escaparate (listado, ficha, SEO).
 */

type MaybeText = unknown

function clean(value: MaybeText): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Nombre público: `web_title` si lo hay, si no el nombre interno. */
export function publicProductName(product: Record<string, unknown> | null | undefined): string {
  if (!product) return ''
  return clean(product.web_title) || clean(product.name)
}

/**
 * Descripción pública: `web_description` si la hay, si no la interna.
 *
 * Se devuelve como texto plano: parte del catálogo viene importado de Shopify
 * y trae HTML pegado (`<p>`, `<b>`, `<meta>`), que sin limpiar se vería crudo
 * en la ficha. Los cortes de bloque se conservan como saltos de línea porque
 * la ficha la pinta con `whitespace-pre-line`.
 */
export function publicProductDescription(product: Record<string, unknown> | null | undefined): string {
  if (!product) return ''
  return toPlainText(clean(product.web_description) || clean(product.description))
}

function toPlainText(input: string): string {
  if (!input || !/<[a-z!/]/i.test(input)) return input
  return input
    .replace(/<\s*(br|hr)\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6]|ul|ol|table|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
