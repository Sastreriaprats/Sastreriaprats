import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { CatalogContent } from './catalog-content'

// Dinámica: hay que leer searchParams para redirigir las URLs antiguas.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Boutique — Sastrería Prats',
  description: 'Colección de moda masculina de lujo. Americanas, camisas, pantalones y accesorios de las mejores marcas.',
  alternates: { canonical: '/boutique' },
  openGraph: {
    title: 'Boutique — Sastrería Prats',
    description: 'Colección de moda masculina de lujo.',
    url: '/boutique',
  },
}

export default async function BoutiquePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  // Las URLs antiguas con filtro (?category=trajes) tienen ahora página propia:
  // 301 a /boutique/categoria/<slug> para consolidar el posicionamiento.
  const { category } = await searchParams
  if (category) {
    permanentRedirect(`/boutique/categoria/${encodeURIComponent(category)}`)
  }

  return <CatalogContent />
}
