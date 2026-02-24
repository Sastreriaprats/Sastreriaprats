import { Metadata } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://prats.fastia.es'

interface PageMetaParams {
  title: string
  description: string
  path: string
  image?: string
  type?: 'website' | 'article' | 'product'
  noindex?: boolean
  publishedTime?: string
  modifiedTime?: string
}

export function buildMetadata(params: PageMetaParams): Metadata {
  const { title, description, path, image, type = 'website', noindex = false, publishedTime, modifiedTime } = params
  const url = `${BASE_URL}${path}`

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Sastrería Prats',
      locale: 'es_ES',
      type: type === 'article' ? 'article' : 'website',
      images: image
        ? [{ url: image, width: 1200, height: 630, alt: title }]
        : [{ url: `${BASE_URL}/og-default.jpg`, width: 1200, height: 630 }],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : [`${BASE_URL}/og-default.jpg`],
    },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
  }
}

export function buildBreadcrumbs(items: { label: string; path: string }[]) {
  return [
    { name: 'Inicio', url: BASE_URL },
    ...items.map((i) => ({ name: i.label, url: `${BASE_URL}${i.path}` })),
  ]
}
