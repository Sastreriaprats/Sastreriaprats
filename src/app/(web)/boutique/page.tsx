import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { CategoryLinks } from '@/components/web/category-links'
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

  return (
    <main>
      <section className="border-b border-gray-200 px-4 py-8 text-center">
        <h1 className="font-serif text-3xl font-light text-black md:text-4xl">Boutique</h1>
        <div className="mt-6">
          <CategoryLinks />
        </div>
      </section>
      <CatalogContent />
    </main>
  )
}
