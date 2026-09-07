/**
 * Lectura paginada de Supabase.
 *
 * PostgREST corta cualquier consulta en 1.000 filas (`max_rows`). Ese tope NO
 * se evita con `.limit(20000)` ni con `.range(0, 99999)`: los dos se traducen a
 * un limit que el servidor vuelve a recortar. La unica forma de leer una tabla
 * grande entera es pedirla por paginas, que es lo que hace este helper.
 *
 * Usalo siempre que el resultado alimente un TOTAL, un KPI o un listado que el
 * usuario espera completo. Para contar filas sin traerlas, usa
 * `select('id', { count: 'exact', head: true })` en su lugar.
 */

/** Tamaño de pagina: el tope que impone PostgREST. */
const PAGE_SIZE = 1000

// `data: any[]` a proposito: las consultas de supabase-js tipan las relaciones
// anidadas como array aunque devuelvan un objeto, asi que una firma estricta
// obligaria a castear en cada llamada. El tipo util es el de salida (T).
type PagedResponse = { data: any[] | null; error?: { message?: string } | null }

/**
 * Lee TODAS las filas de una consulta, pagina a pagina.
 *
 * `build` debe construir una consulta NUEVA en cada llamada y aplicarle el
 * `.range(from, to)` que recibe. Conviene que lleve un `.order(...)` estable:
 * sin orden, PostgREST no garantiza el mismo reparto entre paginas y se pueden
 * repetir o perder filas.
 *
 * Si una pagina falla, LANZA en vez de devolver un resultado incompleto: en un
 * server action el wrapper lo convierte en `{ success: false }` y la pantalla
 * avisa del error, que es preferible a enseñar un total corto como si fuera
 * bueno.
 */
export async function readAllPaged<T = Record<string, unknown>>(
  build: (from: number, to: number) => PromiseLike<PagedResponse>,
  label = 'readAllPaged',
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`[${label}] error leyendo la pagina ${from}: ${error.message ?? 'desconocido'}`)
    }
    const batch = (data ?? []) as T[]
    out.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return out
}

/**
 * Lee todas las filas cuyo id esta en `ids`, troceando el `.in(...)` en lotes.
 *
 * Un `.in('id', [...])` con mas de 1.000 ids devuelve como mucho 1.000 filas, y
 * ese recorte es tan silencioso como el de una tabla sin paginar: el listado
 * pierde filas sin avisar. Con lotes de 500 sobre una clave primaria, cada
 * consulta devuelve como mucho 500 filas y nunca toca el tope.
 */
export async function readAllByIds<T = Record<string, unknown>>(
  ids: readonly string[],
  build: (chunk: string[]) => PromiseLike<PagedResponse>,
  label = 'readAllByIds',
): Promise<T[]> {
  const CHUNK = 500
  const unique = [...new Set(ids)]
  const out: T[] = []
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await build(unique.slice(i, i + CHUNK))
    if (error) {
      throw new Error(`[${label}] error leyendo el lote ${i}: ${error.message ?? 'desconocido'}`)
    }
    out.push(...((data ?? []) as T[]))
  }
  return out
}
