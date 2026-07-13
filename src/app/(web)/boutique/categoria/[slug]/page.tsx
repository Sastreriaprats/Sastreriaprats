import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { BreadcrumbSchema } from '@/components/seo/schema-org'
import { buildBreadcrumbs } from '@/lib/seo/metadata'
import { CatalogContent, type CatalogInitialData } from '../../catalog-content'

// Página de categoría con URL propia (/boutique/categoria/<slug>) en lugar del
// filtro por query (?category=), que Google trataba como una sola página.
// ISR: se regenera como mucho cada 5 minutos.
export const revalidate = 300

const getCategory = cache(async (slug: string) => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('product_categories')
    .select('name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('is_visible_web', true)
    .single()
  return data
})

async function getInitialProducts(slug: string): Promise<CatalogInitialData | undefined> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(
      `${baseUrl}/api/public/catalog?category=${encodeURIComponent(slug)}&page=1&sort=name`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return undefined
    const data = await res.json()
    return { products: data.products || [], total: data.total || 0, totalPages: data.totalPages || 1 }
  } catch {
    // Sin datos del servidor, CatalogContent hace el fetch en cliente.
    return undefined
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const category = await getCategory(slug)
  // notFound() aquí (y no solo en la página): generateMetadata corre antes del
  // primer flush del streaming, así el 404 llega con status HTTP real y no
  // como soft-404 (shell 200 + UI de "no encontrado").
  if (!category) notFound()

  const title = `${category.name} — Boutique | Sastrería Prats`
  const description = `${category.name} de la colección de moda masculina de Sastrería Prats. Calidad artesanal y marcas de prestigio en Madrid, con envío online.`
  const path = `/boutique/categoria/${category.slug}`
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  }
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const category = await getCategory(slug)
  if (!category) notFound()

  const initialData = await getInitialProducts(slug)

  return (
    <main>
      <BreadcrumbSchema
        items={buildBreadcrumbs([
          { label: 'Boutique', path: '/boutique' },
          { label: category.name, path: `/boutique/categoria/${category.slug}` },
        ])}
      />
      <section className="border-b border-gray-200 px-4 py-8 text-center">
        <h1 className="font-serif text-3xl font-light text-black md:text-4xl">{category.name}</h1>
      </section>
      <CatalogContent category={category.slug} initialData={initialData} />
    </main>
  )
}
