import type { Metadata } from 'next'
import { ProductContent } from './product-content'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/public/catalog/${slug}`, { next: { revalidate: 60 } })
    if (!res.ok) return { title: 'Producto no encontrado' }
    const product = await res.json()
    const title = `${product.name} — Sastrería Prats`
    const description = product.description?.slice(0, 160) || `${product.name} en Sastrería Prats.`
    return {
      title,
      description,
      alternates: { canonical: `/boutique/${slug}` },
      openGraph: {
        title,
        description,
        url: `/boutique/${slug}`,
        images: product.main_image_url ? [product.main_image_url] : [],
      },
    }
  } catch {
    return { title: 'Producto — Sastrería Prats' }
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ProductContent slug={slug} />
}
