import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { CatalogContent } from './catalog-content'
import { PratsSpinner } from '@/components/ui/prats-spinner'

// No usamos `revalidate` porque la página depende de searchParams (?category=...).
// Con ISR + useSearchParams sin Suspense, el prerender dejaba los params vacíos
// y el fetch se disparaba sin filtro de categoría.
export const dynamic = 'force-dynamic'

// Sin rutas dedicadas de categoría, /boutique?category=<slug> hace de página de
// categoría: título, descripción y canonical propios para que Google las indexe
// como páginas distintas (van también en el sitemap).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}): Promise<Metadata> {
  const { category } = await searchParams

  const base: Metadata = {
    title: 'Boutique — Sastrería Prats',
    description:
      'Colección de moda masculina de lujo. Americanas, camisas, pantalones y accesorios de las mejores marcas.',
    alternates: { canonical: '/boutique' },
    openGraph: {
      title: 'Boutique — Sastrería Prats',
      description: 'Colección de moda masculina de lujo.',
      url: '/boutique',
    },
  }

  if (!category) return base

  try {
    const admin = createAdminClient()
    const { data: cat } = await admin
      .from('product_categories')
      .select('name, slug')
      .eq('slug', category)
      .eq('is_active', true)
      .eq('is_visible_web', true)
      .single()
    if (!cat?.name) return base

    const title = `${cat.name} — Boutique Sastrería Prats`
    const description = `${cat.name} de la colección de moda masculina de Sastrería Prats. Calidad artesanal y marcas de prestigio en Madrid, con envío online.`
    const path = `/boutique?category=${encodeURIComponent(cat.slug)}`
    return {
      title,
      description,
      alternates: { canonical: path },
      openGraph: { title, description, url: path },
    }
  } catch {
    return base
  }
}

export default function BoutiquePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><PratsSpinner /></div>}>
      <CatalogContent />
    </Suspense>
  )
}
