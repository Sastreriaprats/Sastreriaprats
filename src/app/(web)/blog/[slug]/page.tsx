import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar } from 'lucide-react'

export const revalidate = 1800
import { getPublicBlogPost } from '@/actions/cms'
import { cn } from '@/lib/utils'
import { ArticleSchema, BreadcrumbSchema } from '@/components/seo/schema-org'
import { buildBreadcrumbs } from '@/lib/seo/metadata'

type Props = {
  params: Promise<{ slug: string }>
}

/**
 * Agrupa las imágenes consecutivas del cuerpo en una galería en fila.
 * El editor TipTap guarda cada imagen como un <img> de bloque, lo que las
 * apila verticalmente. Aquí detectamos 2+ <img> seguidos (incluidos los que
 * TipTap envuelve en su propio <p>) y los metemos en un <div class="blog-gallery">
 * que el CSS dispone lado a lado. Una imagen suelta se queda a ancho completo.
 */
/**
 * Normaliza los encabezados del CUERPO para que la página tenga un único H1
 * (el título del post, que se renderiza aparte). Dos pasos:
 *  1) Elimina encabezados vacíos (sin texto: solo espacios, &nbsp; o <br>),
 *     como el H2 en blanco que a veces deja el editor.
 *  2) Si el cuerpo trae algún H1 (el editor ofrecía botón H1), baja toda la
 *     jerarquía un nivel (h1→h2 … h5→h6; h6 se mantiene). Solo se degrada
 *     cuando hay H1, así los posts que ya empiezan bien en H2 no se tocan.
 * No modifica lo guardado en BD: es una capa de presentación, reversible.
 */
function normalizeBodyHeadings(html: string): string {
  // 1) Fuera encabezados vacíos.
  let out = html.replace(
    /<h([1-6])(?:\s[^>]*)?>(?:\s|&nbsp;|<br\s*\/?>)*<\/h\1>/gi,
    ''
  )
  // 2) Degradar un nivel solo si hay algún H1 en el cuerpo.
  if (/<h1[\s>]/i.test(out)) {
    out = out.replace(
      /<(\/?)h([1-5])((?:\s[^>]*)?)>/gi,
      (_m, slash: string, level: string, attrs: string) =>
        `<${slash}h${Number(level) + 1}${attrs}>`
    )
  }
  return out
}

function groupImageGalleries(html: string): string {
  // 1) Normalizar: una imagen sola dentro de su propio <p> → <img> de bloque,
  //    así ambos flujos de TipTap (inline:false y <p><img></p>) quedan iguales.
  const normalized = html.replace(
    /<p>\s*(<img\b[^>]*>)\s*<\/p>/gi,
    '$1'
  )
  // 2) Una sola pasada: 2+ <img> consecutivos → galería en fila.
  return normalized.replace(
    /(?:<img\b[^>]*>\s*){2,}/gi,
    (run) => {
      const imgs = run.match(/<img\b[^>]*>/gi) || []
      return `<div class="blog-gallery">${imgs.join('')}</div>`
    }
  )
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
    alternates: { canonical: `/blog/${slug}` },
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

  // DOMPurify (isomorphic-dompurify) puede fallar en runtime serverless de
  // Vercel: jsdom hace requires dinámicos que el file-tracing de Next no
  // empaqueta, y un `import` estático a nivel de módulo CRASHEA la ruta (500)
  // ANTES de que cualquier try/catch entre. Por eso lo cargamos con import
  // dinámico DENTRO del try: así un fallo de carga es capturable y cae al
  // saneado por regex — el HTML viene del admin autenticado, no de externos.
  let body = ''
  try {
    const { default: DOMPurify } = await import('isomorphic-dompurify')
    body = DOMPurify.sanitize(post.body_es || '')
  } catch (err) {
    console.error('[blog/[slug]] DOMPurify no disponible para slug=' + slug, err)
    body = (post.body_es || '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '')
  }

  // Un solo H1 en la página: el título del post. Los del cuerpo bajan un nivel.
  body = normalizeBodyHeadings(body)

  // Agrupar imágenes consecutivas en galerías en fila (lado a lado).
  body = groupImageGalleries(body)

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

    </article>
  )
}
