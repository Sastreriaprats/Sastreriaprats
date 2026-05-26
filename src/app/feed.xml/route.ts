/**
 * RSS 2.0 feed del blog Prats & Co.
 *
 * Lista los últimos 50 posts publicados ordenados por `published_at` DESC.
 * Cacheado 1h (revalidate=3600). Auto-descubrible desde `/blog` vía
 * `<link rel="alternate" type="application/rss+xml">`.
 *
 * Validable con https://validator.w3.org/feed/.
 */
import { createAdminClient } from '@/lib/supabase/admin'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com'
const FEED_URL = `${BASE_URL}/feed.xml`
const BLOG_URL = `${BASE_URL}/blog`

export const revalidate = 3600

type PostRow = {
  slug: string
  title_es: string | null
  excerpt_es: string | null
  seo_description: string | null
  category: string | null
  published_at: string | null
  updated_at: string | null
}

/** Escape XML: amp/lt/gt/quot/apos. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('blog_posts')
    .select('slug, title_es, excerpt_es, seo_description, category, published_at, updated_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  const posts = (data ?? []) as PostRow[]

  const lastBuildDate = posts[0]?.updated_at || posts[0]?.published_at || new Date().toISOString()

  const items = posts
    .map((p) => {
      const link = `${BLOG_URL}/${p.slug}`
      const title = xmlEscape(p.title_es || '')
      const description = xmlEscape(p.excerpt_es || p.seo_description || '')
      const pubDate = p.published_at ? new Date(p.published_at).toUTCString() : ''
      const category = p.category ? `\n      <category>${xmlEscape(p.category)}</category>` : ''
      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}
      <description>${description}</description>${category}
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Prats &amp; Co. — Sastrería Prats</title>
    <link>${BLOG_URL}</link>
    <description>Noticias, consejos y novedades de Sastrería Prats — sastrería de lujo en Madrid.</description>
    <language>es-ES</language>
    <lastBuildDate>${new Date(lastBuildDate).toUTCString()}</lastBuildDate>
    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
