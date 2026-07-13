import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com'

// Cache 1h en el edge: el sitemap se regenera en cada rebuild + cada hora máximo.
export const revalidate = 3600

// Páginas estáticas con prioridad y frecuencia ajustadas a su importancia SEO.
const STATIC_PAGES: Array<{
  path: string
  priority: number
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
}> = [
  { path: '',                 priority: 1.0, changeFrequency: 'weekly'  },
  { path: '/sastreria',       priority: 0.9, changeFrequency: 'monthly' },
  { path: '/boutique',        priority: 0.9, changeFrequency: 'weekly'  },
  { path: '/tiendas',         priority: 0.8, changeFrequency: 'monthly' },
  { path: '/sobre-nosotros',  priority: 0.7, changeFrequency: 'monthly' },
  { path: '/contacto',        priority: 0.7, changeFrequency: 'monthly' },
  { path: '/blog',            priority: 0.7, changeFrequency: 'weekly'  },
  { path: '/cita-previa',     priority: 0.6, changeFrequency: 'monthly' },
  { path: '/reservar',        priority: 0.5, changeFrequency: 'monthly' },
  { path: '/newsletter',      priority: 0.3, changeFrequency: 'yearly'  },
  { path: '/aviso-legal',     priority: 0.2, changeFrequency: 'yearly'  },
  { path: '/privacidad',      priority: 0.2, changeFrequency: 'yearly'  },
  { path: '/cookies',         priority: 0.2, changeFrequency: 'yearly'  },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const admin = createAdminClient()
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${BASE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))

  // Posts del blog publicados
  let blogEntries: MetadataRoute.Sitemap = []
  try {
    const { data: posts } = await admin
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
    blogEntries = (posts || []).map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: post.updated_at ? new Date(post.updated_at) : (post.published_at ? new Date(post.published_at) : now),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  } catch (err) {
    console.error('[sitemap] blog_posts:', err)
  }

  // Productos boutique visibles en la web (canonical: /boutique/<slug>)
  let productEntries: MetadataRoute.Sitemap = []
  try {
    const { data: products } = await admin
      .from('products')
      .select('web_slug, updated_at')
      .eq('is_visible_web', true)
      .eq('is_active', true)
      .not('web_slug', 'is', null)
    productEntries = (products || [])
      .filter((p) => typeof p.web_slug === 'string' && p.web_slug.length > 0)
      .map((p) => ({
        url: `${BASE_URL}/boutique/${p.web_slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
  } catch (err) {
    console.error('[sitemap] products:', err)
  }

  // Categorías visibles en web, con ruta propia: /boutique/categoria/<slug>.
  let categoryEntries: MetadataRoute.Sitemap = []
  try {
    const { data: categories } = await admin
      .from('product_categories')
      .select('slug, updated_at, level')
      .eq('is_active', true)
      .eq('is_visible_web', true)
      .in('product_type', ['boutique', 'accessory'])
    categoryEntries = (categories || [])
      .filter((c) => typeof c.slug === 'string' && c.slug.length > 0)
      .map((c) => ({
        url: `${BASE_URL}/boutique/categoria/${encodeURIComponent(c.slug)}`,
        lastModified: c.updated_at ? new Date(c.updated_at) : now,
        changeFrequency: 'weekly' as const,
        // Categorías padre prioridad mayor que subcategorías.
        priority: c.level === 0 ? 0.75 : 0.6,
      }))
  } catch (err) {
    console.error('[sitemap] categories:', err)
  }

  return [
    ...staticEntries,
    ...blogEntries,
    ...categoryEntries,
    ...productEntries,
  ]
}
