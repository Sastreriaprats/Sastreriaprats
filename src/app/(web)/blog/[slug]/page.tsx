import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, User, Tag } from 'lucide-react'
import { getPublicBlogPost } from '@/actions/cms'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ArticleSchema, BreadcrumbSchema } from '@/components/seo/schema-org'
import { buildBreadcrumbs } from '@/lib/seo/metadata'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPublicBlogPost(slug)
  if (!post) {
    return { title: 'Entrada no encontrada' }
  }
  return {
    title: post.seo_title || post.title_es,
    description: post.seo_description || post.excerpt_es || undefined,
    openGraph: {
      title: post.seo_title || post.title_es,
      description: post.seo_description || post.excerpt_es || undefined,
      images: post.og_image_url ? [post.og_image_url] : undefined,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await getPublicBlogPost(slug)

  if (!post) {
    notFound()
  }

  const author = post.profiles as { full_name?: string } | null
  const body = post.body_es || ''

  return (
    <article className="container mx-auto px-4 py-12 sm:py-16">
      <ArticleSchema post={post as Parameters<typeof ArticleSchema>[0]['post']} />
      <BreadcrumbSchema items={buildBreadcrumbs([
        { label: 'Blog', path: '/blog' },
        { label: post.title_es, path: `/blog/${post.slug}` },
      ])} />
      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-2 text-sm text-prats-navy/70 transition-colors hover:text-prats-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al blog
      </Link>

      {post.featured_image_url && (
        <div className="mb-8 aspect-[21/9] overflow-hidden rounded-lg">
          <img
            src={post.featured_image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {post.category && (
          <Badge variant="secondary" className="text-prats-gold border-prats-gold/30">
            {post.category}
          </Badge>
        )}
        {post.published_at && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {new Date(post.published_at).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        )}
        {author?.full_name && (
          <span className="flex items-center gap-1.5">
            <User className="h-4 w-4" />
            {author.full_name}
          </span>
        )}
      </div>

      <h1 className="mt-6 font-display text-4xl font-light text-prats-navy sm:text-5xl">
        {post.title_es}
      </h1>

      {body && (
        <div
          className={cn(
            'prose prose-lg prose-gray max-w-none mt-8',
            'prose-headings:text-prats-navy prose-a:text-prats-gold'
          )}
          dangerouslySetInnerHTML={{ __html: body }}
        />
      )}

      {post.tags && Array.isArray(post.tags) && post.tags.length > 0 && (
        <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-border pt-8">
          <Tag className="h-4 w-4 text-prats-navy/60" />
          {post.tags.map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-prats-navy">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </article>
  )
}
