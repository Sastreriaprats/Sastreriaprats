interface SchemaProps {
  data: Record<string, unknown>
}

function JsonLd({ data }: SchemaProps) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}

export function ProductSchema({ product }: { product: Record<string, unknown> & { name: string; description?: string; main_image_url?: string; slug: string; brand?: string; base_price: number; material?: string; product_variants?: Record<string, unknown>[] } }) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || ''}/boutique/${product.slug}`
  const variants = product.product_variants || []
  const prices = variants.map((v) => (v.price_override as number) || product.base_price)

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.main_image_url,
    url,
    sku: variants[0]?.variant_sku,
    material: product.material,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'EUR',
      lowPrice: product.base_price,
      highPrice: Math.max(product.base_price, ...prices),
      availability: variants.some((v) => ((v.total_stock as number) || 0) > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'Sastrería Prats' },
    },
  }
  if (product.brand) {
    data.brand = { '@type': 'Brand', name: product.brand }
  }

  return <JsonLd data={data} />
}

export function ArticleSchema({ post }: { post: { title_es: string; excerpt_es?: string; featured_image_url?: string; slug: string; published_at?: string; updated_at?: string; profiles?: { full_name?: string } | null } }) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || ''}/blog/${post.slug}`

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title_es,
    description: post.excerpt_es,
    image: post.featured_image_url,
    url,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: { '@type': 'Person', name: post.profiles?.full_name || 'Sastrería Prats' },
    publisher: {
      '@type': 'Organization',
      name: 'Sastrería Prats',
      logo: { '@type': 'ImageObject', url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/icons/icon-512.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }

  return <JsonLd data={data} />
}

export function BreadcrumbSchema({ items }: { items: { name: string; url: string }[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }

  return <JsonLd data={data} />
}

export function FAQSchema({ questions }: { questions: { question: string; answer: string }[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  }

  return <JsonLd data={data} />
}

export function OrganizationSchema() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Sastrería Prats',
    url: process.env.NEXT_PUBLIC_APP_URL,
    logo: `${process.env.NEXT_PUBLIC_APP_URL || ''}/icons/icon-512.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+34914356789',
      contactType: 'customer service',
      availableLanguage: ['Spanish', 'English'],
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Calle de Serrano 82',
      addressLocality: 'Madrid',
      postalCode: '28006',
      addressCountry: 'ES',
    },
    sameAs: ['https://instagram.com/sastreriaprats', 'https://facebook.com/sastreriaprats'],
  }

  return <JsonLd data={data} />
}

export function WebSiteSchema() {
  const base = process.env.NEXT_PUBLIC_APP_URL || ''
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Sastrería Prats',
    url: base,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${base}/boutique?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  return <JsonLd data={data} />
}
