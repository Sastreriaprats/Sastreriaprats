import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublicBlogPosts } from '@/actions/cms'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Noticias, consejos y novedades de Sastrería Prats — sastrería de lujo en Madrid.',
}

export default async function BlogPage() {
  const posts = await getPublicBlogPosts(20)

  if (!posts || posts.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 sm:py-24">
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <p className="text-sm tracking-[0.3em] text-prats-navy/50">Próximamente</p>
          <h2 className="mt-4 font-display text-2xl font-light text-prats-navy">
            Estamos preparando contenido para ti
          </h2>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16 sm:py-20">
      <h1 className="mb-12 font-display text-4xl font-light text-prats-navy">
        Blog
      </h1>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.id}
            className="group flex flex-col"
          >
            <Link href={`/blog/${post.slug}`} className="flex flex-col flex-1">
              <div className="aspect-[4/3] overflow-hidden rounded-lg bg-prats-cream">
                {post.featured_image_url ? (
                  <img
                    src={post.featured_image_url}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-sm text-prats-navy/40"
                    aria-hidden
                  >
                    Imagen
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {post.category && (
                  <Badge variant="secondary" className="text-prats-gold border-prats-gold/30">
                    {post.category}
                  </Badge>
                )}
                {post.published_at && (
                  <time
                    dateTime={
                      typeof post.published_at === 'string'
                        ? post.published_at
                        : post.published_at.toISOString()
                    }
                    className="text-sm text-muted-foreground"
                  >
                    {new Date(post.published_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </time>
                )}
              </div>

              <h2 className="mt-2 text-lg font-semibold text-prats-navy transition-colors group-hover:text-prats-gold">
                {post.title_es}
              </h2>

              {post.excerpt_es && (
                <p className={cn('mt-2 text-sm text-muted-foreground line-clamp-3')}>
                  {post.excerpt_es}
                </p>
              )}

              <span className="mt-4 inline-flex items-center text-sm font-medium text-prats-gold group-hover:underline">
                Leer más
              </span>
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}
