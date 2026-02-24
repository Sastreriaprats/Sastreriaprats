import Link from "next/link"
import { cn } from "@/lib/utils"

interface BlogPost {
  slug: string
  title_es: string
  excerpt_es?: string | null
  featured_image_url?: string | null
  category?: string | null
  published_at?: string | null
}

interface BlogPreviewProps {
  posts: BlogPost[]
}

export function BlogPreview({ posts }: BlogPreviewProps) {
  if (!posts || posts.length === 0) {
    return null
  }

  const displayPosts = posts.slice(0, 3)

  return (
    <section className="py-20 sm:py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
          <h2 className="text-3xl sm:text-4xl font-serif text-prats-navy">
            Últimas noticias
          </h2>
          <Link
            href="/blog"
            className="text-prats-gold hover:text-prats-gold/80 font-medium transition-colors"
          >
            Ver todos →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {displayPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col"
            >
              <div className="aspect-[4/3] rounded-lg overflow-hidden bg-gray-200 mb-4">
                {post.featured_image_url ? (
                  <img
                    src={post.featured_image_url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-gray-400 text-sm"
                    aria-hidden
                  >
                    Imagen
                  </div>
                )}
              </div>

              {post.category && (
                <span className="text-prats-gold text-sm font-medium mb-2">
                  {post.category}
                </span>
              )}

              <h3 className="text-lg font-semibold text-prats-navy group-hover:text-prats-gold transition-colors mb-2 line-clamp-2">
                {post.title_es}
              </h3>

              {post.excerpt_es && (
                <p className="text-muted-foreground text-sm line-clamp-2 mb-2">
                  {post.excerpt_es}
                </p>
              )}

              {post.published_at && (
                <time
                  dateTime={new Date(post.published_at).toISOString()}
                  className="text-sm text-muted-foreground"
                >
                  {new Date(post.published_at).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
