import type { Redirect } from 'next/dist/lib/load-custom-routes'

/**
 * Redirecciones 301 desde las URLs antiguas de Shopify (sastreriaprats.com)
 * hacia la plataforma nueva, para conservar el posicionamiento SEO indexado
 * en Google tras la migración.
 *
 * Estrategia (acordada con negocio):
 *  - Páginas principales y categorías → su equivalente exacto en la web nueva.
 *  - Productos concretos NO se mapean uno a uno (los slugs cambiaron por
 *    completo y no son identificables con fiabilidad). Caen en la red de
 *    seguridad → /boutique, para no dejar nunca un 404.
 *
 * IMPORTANTE: el orden importa. Next.js aplica la PRIMERA coincidencia, así que
 * las rutas específicas van ANTES que los comodines (:path*) del final.
 */

// Categorías de Shopify cuyo handle coincide con el slug de product_categories.
const MATCHING_COLLECTIONS = [
  'trajes', 'corbatas', 'camisas', 'pantalones-lana', 'gabardinas', 'poleras',
  'americanas', 'pantalones', 'accesorios', 'saharianas', 'panuelos', 'pijamas',
  'smoking', 'pantalones-algodon', 'cazadoras', 'sobrecamisas',
]

// Categorías de Shopify renombradas/fusionadas → categoría equivalente actual.
const REMAPPED_COLLECTIONS: Record<string, string> = {
  'americanas-y-tebas': 'americanas-tebas',
  'camisas-y-poleras': 'camisas-poleras',
  'tebas-1': 'tebas',
  'prendas-exteriores-cortas': 'prenda-exterior',
  'new-collection-fw-25-26': 'nueva-coleccion',
  'chaquetas-y-abrigos-1': 'abrigos-anoraks',
  'abrigos-y-anoraks': 'abrigos-anoraks',
  'ropa-de-casa': 'homewear',
  'batas-1': 'batas',
  'jerseys': 'jersey',
}

export const legacyShopifyRedirects: Redirect[] = [
  // ---- Páginas estáticas ----
  { source: '/pages/sobre-nosotros', destination: '/sobre-nosotros', permanent: true },
  { source: '/pages/contacto', destination: '/contacto', permanent: true },
  { source: '/pages/bespoke', destination: '/sastreria', permanent: true },
  { source: '/pages/medida-artesanal', destination: '/sastreria', permanent: true },
  { source: '/pages/ceremonia', destination: '/boutique?category=ceremonia', permanent: true },
  { source: '/pages/camiseria', destination: '/boutique?category=camisas', permanent: true },
  { source: '/pages/trunk-shows', destination: '/blog', permanent: true },
  { source: '/pages/guia-de-tallas-teba', destination: '/boutique?category=tebas', permanent: true },
  { source: '/pages/tallas-pijama', destination: '/boutique?category=pijamas', permanent: true },
  { source: '/pages/tallas-polera', destination: '/boutique?category=poleras', permanent: true },
  { source: '/pages/data-sharing-opt-out', destination: '/privacidad', permanent: true },
  { source: '/pages/traje-ast2f-luka', destination: '/boutique', permanent: true },

  // ---- Políticas ----
  { source: '/policies/refund-policy', destination: '/reembolsos', permanent: true },
  { source: '/policies/privacy-policy', destination: '/privacidad', permanent: true },
  { source: '/policies/terms-of-service', destination: '/terminos', permanent: true },
  { source: '/policies/shipping-policy', destination: '/envios', permanent: true },

  // ---- Colecciones que coinciden exactamente ----
  ...MATCHING_COLLECTIONS.map((slug): Redirect => ({
    source: `/collections/${slug}`,
    destination: `/boutique?category=${slug}`,
    permanent: true,
  })),

  // ---- Colecciones renombradas/fusionadas ----
  ...Object.entries(REMAPPED_COLLECTIONS).map(([from, to]): Redirect => ({
    source: `/collections/${from}`,
    destination: `/boutique?category=${to}`,
    permanent: true,
  })),

  // ---- Rutas de colección anidadas concretas ----
  { source: '/collections/tebas-1/teba', destination: '/boutique?category=tebas', permanent: true },
  { source: '/collections/gabardinas/products/:slug*', destination: '/boutique?category=gabardinas', permanent: true },

  // ---- Índice de colecciones y blog ----
  { source: '/collections', destination: '/boutique', permanent: true },
  { source: '/blogs/sastreria-prats', destination: '/blog', permanent: true },

  // ====================================================================
  // RED DE SEGURIDAD (comodines) — SIEMPRE al final.
  // Cubre todo lo no mapeado para que ninguna URL antigua dé 404.
  // ====================================================================
  { source: '/blogs/:path*', destination: '/blog', permanent: true },
  { source: '/collections/:path*', destination: '/boutique', permanent: true },
  { source: '/products/:path*', destination: '/boutique', permanent: true },
  { source: '/pages/:path*', destination: '/', permanent: true },
  { source: '/policies/:path*', destination: '/', permanent: true },
]
