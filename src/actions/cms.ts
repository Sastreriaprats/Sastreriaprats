'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

// Tipos para contenido de la home (CMS)
export type HomeHero = {
  title_es: string
  subtitle_es: string
  image_url: string
  video_url: string
  button1_label: string
  button1_url: string
  button2_label: string
  button2_url: string
}

export type HomeEditorialStrip = { content_es: string }

export type HomeCategoryCard = { title_es: string; image_url: string; link_url: string }
export type HomeCategories = { title_es: string; blocks: HomeCategoryCard[] }

export type HomeFeatured = { title_es: string }

export type HomeEditorialDouble = {
  title_es: string
  content_es: string
  image_url: string
  button_label: string
  button_url: string
}

export type HomeStoreCard = { title_es: string; content_es: string; image_url: string; link_url: string }
export type HomeStores = { title_es: string; blocks: HomeStoreCard[] }

export type HomeCta = { title_es: string; button_label: string; button_url: string }

export type HomeProcessStep = { title_es: string; content_es: string }
export type HomeProcessSteps = { title_es: string; blocks: HomeProcessStep[] }

export type HomeContent = {
  hero: HomeHero | null
  editorial_strip: HomeEditorialStrip | null
  categories: HomeCategories | null
  featured: HomeFeatured | null
  editorial_double: HomeEditorialDouble | null
  stores: HomeStores | null
  cta: HomeCta | null
  process_steps: HomeProcessSteps | null
}

const DEFAULT_HERO: HomeHero = {
  title_es: 'SASTRERÍA PRATS',
  subtitle_es: 'Madrid · Est. 1985',
  image_url: 'https://www.sastreriaprats.com/cdn/shop/files/AW25_-_DIEGO_MARTIN-191.jpg?v=1762421411&width=2000',
  video_url: '',
  button1_label: 'DESCUBRIR COLECCIÓN',
  button1_url: '/boutique',
  button2_label: 'RESERVAR CITA',
  button2_url: '/reservar',
}

const DEFAULT_EDITORIAL_STRIP: HomeEditorialStrip = {
  content_es: 'NUEVA COLECCIÓN · OTOÑO INVIERNO 2025 · HECHO A MEDIDA EN MADRID',
}

const DEFAULT_CATEGORIES: HomeCategories = {
  title_es: 'Categorías',
  blocks: [
    { title_es: 'Sastrería a Medida', image_url: 'https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-3.jpg?v=1718892989&width=1200', link_url: '/sastreria' },
    { title_es: 'Boutique', image_url: 'https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-6.jpg?v=1718892990&width=1200', link_url: '/boutique' },
    { title_es: 'Cita Previa', image_url: 'https://www.sastreriaprats.com/cdn/shop/files/AW25_-_DIEGO_MARTIN-191.jpg?v=1762421411&width=800', link_url: '/reservar' },
  ],
}

const DEFAULT_FEATURED: HomeFeatured = { title_es: 'SELECCIÓN' }

const DEFAULT_EDITORIAL_DOUBLE: HomeEditorialDouble = {
  title_es: 'Arte hecho prenda',
  content_es: 'Cada pieza nace en nuestro taller de Madrid. Descubre la sastrería a medida y la colección de boutique.',
  image_url: 'https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-3.jpg?v=1718892989&width=1200',
  button_label: 'DESCUBRIR',
  button_url: '/sastreria',
}

const DEFAULT_STORES: HomeStores = {
  title_es: 'NUESTRAS TIENDAS',
  blocks: [
    { title_es: 'Hermanos Pinzón', content_es: 'Calle Hermanos Pinzón, 4 - 28036 Madrid', image_url: 'https://www.sastreriaprats.com/cdn/shop/files/MENINA_-_PRATS_389bd184-3fe5-4fa5-a9f0-0d28a69d5626.jpg?v=1718899181&width=1200', link_url: 'https://maps.app.goo.gl/Vf8puqTToyqvTirq5' },
    { title_es: 'Wellington', content_es: 'Calle Velázquez, 8 - 28001 Madrid', image_url: 'https://www.sastreriaprats.com/cdn/shop/files/DIEGO_PRATS-76.jpg?v=1718899328&width=1200', link_url: 'https://maps.app.goo.gl/Cd36bN32ctpTmtub8' },
  ],
}

const DEFAULT_CTA: HomeCta = {
  title_es: 'El traje perfecto comienza aquí.',
  button_label: 'RESERVAR CITA',
  button_url: '/reservar',
}

const DEFAULT_PROCESS_STEPS: HomeProcessSteps = {
  title_es: 'Proceso artesanal, del boceto al ajuste final',
  blocks: [
    { title_es: 'Toma de medidas', content_es: 'Una de las claves de la sastrería a medida es la precisión. En Sastrería Prats realizamos una toma de medidas completa, analizando no solo las dimensiones del cuerpo, sino también la postura, la caída de los hombros y la forma natural del cliente. Este estudio permite crear un patrón único que garantiza comodidad, equilibrio y una silueta elegante.' },
    { title_es: 'Patronaje personalizado', content_es: 'Con las medidas definidas se elabora el patrón personalizado, el plano técnico que dará forma al traje. Posteriormente se realiza el corte del tejido seleccionado, siempre respetando la dirección de la fibra y las características del material. Este paso es fundamental para asegurar que la prenda mantenga su estructura y caída con el paso del tiempo.' },
    { title_es: 'Pruebas de ajuste', content_es: 'Un traje verdaderamente a medida requiere varias pruebas. En ellas se evalúa cómo se comporta la prenda sobre el cuerpo del cliente y se realizan los ajustes necesarios. Cada modificación se realiza con precisión para alcanzar un resultado perfecto.' },
    { title_es: 'Acabados a mano', content_es: 'La confección se realiza mediante técnicas tradicionales de sastrería. Muchas partes del traje se cosen a mano, especialmente aquellas que influyen en la estructura y la movilidad de la prenda. El objetivo es construir una prenda que combine durabilidad, confort y elegancia.' },
  ],
}

/** Obtiene el contenido de la home desde el CMS. Público; usa fallbacks si no hay datos. */
export async function getHomeContent(): Promise<HomeContent> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: page } = await admin
      .from('cms_pages')
      .select('id')
      .eq('slug', 'home')
      .eq('status', 'published')
      .single()
    if (!page?.id) {
      return {
        hero: DEFAULT_HERO,
        editorial_strip: DEFAULT_EDITORIAL_STRIP,
        categories: DEFAULT_CATEGORIES,
        featured: DEFAULT_FEATURED,
        editorial_double: DEFAULT_EDITORIAL_DOUBLE,
        stores: DEFAULT_STORES,
        cta: DEFAULT_CTA,
        process_steps: DEFAULT_PROCESS_STEPS,
      }
    }
    const { data: sections } = await admin
      .from('cms_sections')
      .select('id, section_type, title_es, subtitle_es, content_es, settings')
      .eq('page_id', page.id)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })
    const sectionMap = new Map((sections || []).map((s: { section_type: string }) => [s.section_type, s]))
    const get = (type: string) => sectionMap.get(type) as Record<string, unknown> | undefined

    const heroRow = get('hero')
    const hero: HomeHero | null = heroRow
      ? {
          title_es: (heroRow.title_es as string) || DEFAULT_HERO.title_es,
          subtitle_es: (heroRow.subtitle_es as string) || DEFAULT_HERO.subtitle_es,
          image_url: ((heroRow.settings as Record<string, string>)?.image_url) || DEFAULT_HERO.image_url,
          video_url: ((heroRow.settings as Record<string, string>)?.video_url) || '',
          button1_label: ((heroRow.settings as Record<string, string>)?.button1_label) || DEFAULT_HERO.button1_label,
          button1_url: ((heroRow.settings as Record<string, string>)?.button1_url) || DEFAULT_HERO.button1_url,
          button2_label: ((heroRow.settings as Record<string, string>)?.button2_label) || DEFAULT_HERO.button2_label,
          button2_url: ((heroRow.settings as Record<string, string>)?.button2_url) || DEFAULT_HERO.button2_url,
        }
      : DEFAULT_HERO

    const stripRow = get('editorial_strip')
    const editorial_strip: HomeEditorialStrip | null = stripRow
      ? { content_es: (stripRow.content_es as string) || DEFAULT_EDITORIAL_STRIP.content_es }
      : DEFAULT_EDITORIAL_STRIP

    let categories: HomeCategories | null = DEFAULT_CATEGORIES
    const catRow = get('categories')
    if (catRow?.id) {
      const { data: blocks } = await admin
        .from('cms_blocks')
        .select('title_es, image_url, link_url, sort_order')
        .eq('section_id', catRow.id)
        .order('sort_order', { ascending: true })
      const cards: HomeCategoryCard[] = (blocks || []).map((b: Record<string, unknown>) => ({
        title_es: (b.title_es as string) || '',
        image_url: (b.image_url as string) || '',
        link_url: (b.link_url as string) || '#',
      }))
      if (cards.length) categories = { title_es: (catRow.title_es as string) || DEFAULT_CATEGORIES.title_es, blocks: cards }
    }

    const featRow = get('featured')
    const featured: HomeFeatured | null = featRow ? { title_es: (featRow.title_es as string) || DEFAULT_FEATURED.title_es } : DEFAULT_FEATURED

    const editRow = get('editorial_double')
    const editorial_double: HomeEditorialDouble | null = editRow
      ? {
          title_es: (editRow.title_es as string) || DEFAULT_EDITORIAL_DOUBLE.title_es,
          content_es: (editRow.content_es as string) || DEFAULT_EDITORIAL_DOUBLE.content_es,
          image_url: ((editRow.settings as Record<string, string>)?.image_url) || DEFAULT_EDITORIAL_DOUBLE.image_url,
          button_label: ((editRow.settings as Record<string, string>)?.button_label) || DEFAULT_EDITORIAL_DOUBLE.button_label,
          button_url: ((editRow.settings as Record<string, string>)?.button_url) || DEFAULT_EDITORIAL_DOUBLE.button_url,
        }
      : DEFAULT_EDITORIAL_DOUBLE

    let stores: HomeStores | null = DEFAULT_STORES
    const storesRow = get('stores')
    if (storesRow?.id) {
      const { data: blocks } = await admin
        .from('cms_blocks')
        .select('title_es, content_es, image_url, link_url, sort_order')
        .eq('section_id', storesRow.id)
        .order('sort_order', { ascending: true })
      const cards: HomeStoreCard[] = (blocks || []).map((b: Record<string, unknown>) => ({
        title_es: (b.title_es as string) || '',
        content_es: (b.content_es as string) || '',
        image_url: (b.image_url as string) || '',
        link_url: (b.link_url as string) || '#',
      }))
      if (cards.length) stores = { title_es: (storesRow.title_es as string) || DEFAULT_STORES.title_es, blocks: cards }
    }

    const ctaRow = get('cta')
    const cta: HomeCta | null = ctaRow
      ? {
          title_es: (ctaRow.title_es as string) || DEFAULT_CTA.title_es,
          button_label: ((ctaRow.settings as Record<string, string>)?.button_label) || DEFAULT_CTA.button_label,
          button_url: ((ctaRow.settings as Record<string, string>)?.button_url) || DEFAULT_CTA.button_url,
        }
      : DEFAULT_CTA

    let process_steps: HomeProcessSteps | null = DEFAULT_PROCESS_STEPS
    const psRow = get('process_steps')
    if (psRow?.id) {
      const { data: blocks } = await admin
        .from('cms_blocks')
        .select('title_es, content_es, sort_order')
        .eq('section_id', psRow.id)
        .order('sort_order', { ascending: true })
      const steps: HomeProcessStep[] = (blocks || []).map((b: Record<string, unknown>) => ({
        title_es: (b.title_es as string) || '',
        content_es: (b.content_es as string) || '',
      }))
      if (steps.length) process_steps = { title_es: (psRow.title_es as string) || DEFAULT_PROCESS_STEPS.title_es, blocks: steps }
    }

    return {
      hero,
      editorial_strip,
      categories,
      featured,
      editorial_double,
      stores,
      cta,
      process_steps,
    }
  } catch (err) {
    console.error('[getHomeContent]', err)
    return {
      hero: DEFAULT_HERO,
      editorial_strip: DEFAULT_EDITORIAL_STRIP,
      categories: DEFAULT_CATEGORIES,
      featured: DEFAULT_FEATURED,
      editorial_double: DEFAULT_EDITORIAL_DOUBLE,
      stores: DEFAULT_STORES,
      cta: DEFAULT_CTA,
      process_steps: DEFAULT_PROCESS_STEPS,
    }
  }
}

/** Productos destacados para la sección SELECCIÓN de la home (4 productos). */
export async function getFeaturedProductsForHome(): Promise<
  { id: string; name: string; slug: string; base_price: number; main_image_url: string | null }[]
> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data } = await admin
      .from('products')
      .select('id, name, web_slug, base_price, price_with_tax, main_image_url')
      .eq('is_active', true)
      .eq('is_visible_web', true)
      .order('created_at', { ascending: false })
      .limit(4)
    return (data || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      slug: (p.web_slug as string) || (p.id as string),
      base_price: Number(p.base_price) || 0,
      main_image_url: (p.main_image_url as string) || null,
    }))
  } catch (err) {
    console.error('[getFeaturedProductsForHome]', err)
    return []
  }
}

/** Sección de la home para edición en admin (con bloques si aplica). */
export type HomeSectionForAdmin = {
  id: string
  section_type: string
  title_es: string | null
  subtitle_es: string | null
  content_es: string | null
  settings: Record<string, string>
  blocks?: { id: string; title_es: string | null; content_es: string | null; image_url: string | null; link_url: string | null; sort_order: number }[]
}

export const getHomeSectionsForAdmin = protectedAction<void, HomeSectionForAdmin[]>(
  { permission: 'cms.edit_pages', auditModule: 'cms' },
  async (ctx) => {
    const { data: page } = await ctx.adminClient
      .from('cms_pages')
      .select('id')
      .eq('slug', 'home')
      .single()
    if (!page?.id) return success([])
    const { data: sections } = await ctx.adminClient
      .from('cms_sections')
      .select('id, section_type, title_es, subtitle_es, content_es, settings, sort_order')
      .eq('page_id', page.id)
      .order('sort_order', { ascending: true })
    if (!sections?.length) return success([])
    const withBlocks: HomeSectionForAdmin[] = []
    for (const s of sections) {
      const settings = (s.settings as Record<string, string>) || {}
      const section: HomeSectionForAdmin = {
        id: s.id,
        section_type: s.section_type,
        title_es: s.title_es,
        subtitle_es: s.subtitle_es,
        content_es: s.content_es,
        settings,
        blocks: undefined,
      }
      if (s.section_type === 'categories' || s.section_type === 'stores' || s.section_type === 'process_steps') {
        const { data: blocks } = await ctx.adminClient
          .from('cms_blocks')
          .select('id, title_es, content_es, image_url, link_url, sort_order')
          .eq('section_id', s.id)
          .order('sort_order', { ascending: true })
        section.blocks = (blocks || []).map((b: Record<string, unknown>) => ({
          id: b.id as string,
          title_es: b.title_es as string | null,
          content_es: b.content_es as string | null,
          image_url: b.image_url as string | null,
          link_url: b.link_url as string | null,
          sort_order: Number(b.sort_order) || 0,
        }))
      }
      withBlocks.push(section)
    }
    return success(withBlocks)
  }
)

export const updateHomeSection = protectedAction<
  { sectionId: string; title_es?: string; subtitle_es?: string; content_es?: string; settings?: Record<string, string>; blocks?: { id: string; title_es?: string; content_es?: string; image_url?: string; link_url?: string }[] },
  { ok: boolean }
>(
  {
    permission: 'cms.edit_pages',
    auditModule: 'cms',
    revalidate: ['/', '/admin/tienda-online'],
  },
  async (ctx, input) => {
    const { sectionId, title_es, subtitle_es, content_es, settings, blocks } = input
    const updates: Record<string, unknown> = {}
    if (title_es !== undefined) updates.title_es = title_es
    if (subtitle_es !== undefined) updates.subtitle_es = subtitle_es
    if (content_es !== undefined) updates.content_es = content_es
    if (settings !== undefined) updates.settings = settings
    if (Object.keys(updates).length > 0) {
      const { error } = await ctx.adminClient
        .from('cms_sections')
        .update(updates)
        .eq('id', sectionId)
      if (error) return failure(error.message)
    }
    if (blocks?.length) {
      for (const b of blocks) {
        const blockUpdates: Record<string, unknown> = {}
        if (b.title_es !== undefined) blockUpdates.title_es = b.title_es
        if (b.content_es !== undefined) blockUpdates.content_es = b.content_es
        if (b.image_url !== undefined) blockUpdates.image_url = b.image_url
        if (b.link_url !== undefined) blockUpdates.link_url = b.link_url
        if (Object.keys(blockUpdates).length > 0) {
          const { error } = await ctx.adminClient
            .from('cms_blocks')
            .update(blockUpdates)
            .eq('id', b.id)
          if (error) return failure(error.message)
        }
      }
    }
    return success({ ok: true })
  }
)

const WEB_CONTENT_BUCKET = 'web-content'

export const uploadWebContentImage = protectedAction<FormData, { url: string }>(
  {
    permission: 'cms.edit_pages',
    auditModule: 'cms',
    revalidate: ['/', '/admin/tienda-online'],
  },
  async (ctx, formData) => {
    const file = formData.get('file') as File | null
    if (!file?.size) return failure('No se ha subido ningún archivo')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `home/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error } = await ctx.adminClient.storage
      .from(WEB_CONTENT_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true })
    if (error) return failure(error.message)
    const { data } = ctx.adminClient.storage.from(WEB_CONTENT_BUCKET).getPublicUrl(path)
    return success({ url: data.publicUrl })
  }
)

export const listCmsPages = protectedAction<void, unknown[]>(
  { permission: 'cms.view', auditModule: 'cms' },
  async (ctx) => {
    const { data } = await ctx.adminClient
      .from('cms_pages')
      .select('id, slug, title_es, title_en, status, page_type, sort_order, updated_at')
      .order('sort_order')
    return success(data || [])
  }
)

export const listBlogPosts = protectedAction<void, unknown[]>(
  { permission: 'cms.edit', auditModule: 'cms' },
  async (ctx) => {
    const { data } = await ctx.adminClient
      .from('blog_posts')
      .select('id, slug, title_es, title_en, status, category, featured_image_url, published_at, author_id, profiles!blog_posts_author_id_fkey(full_name)')
      .order('published_at', { ascending: false })
    return success(data || [])
  }
)

export const upsertBlogPost = protectedAction<Record<string, unknown>, unknown>(
  {
    permission: 'cms.edit',
    auditModule: 'cms',
    auditAction: 'create',
    auditEntity: 'blog_post',
    revalidate: ['/admin/cms', '/blog'],
  },
  async (ctx, input) => {
    const { id, ...postData } = input
    if (id) {
      const { error } = await ctx.adminClient
        .from('blog_posts')
        .update({ ...postData, updated_by: ctx.userId })
        .eq('id', id as string)
      if (error) return failure(error.message)
      return success({ id })
    } else {
      const { data, error } = await ctx.adminClient
        .from('blog_posts')
        .insert({ ...postData, author_id: ctx.userId, created_by: ctx.userId })
        .select('id')
        .single()
      if (error) return failure(error.message)
      return success({ id: data.id })
    }
  }
)

export const getBlogPost = protectedAction<string, unknown>(
  { permission: 'cms.edit', auditModule: 'cms' },
  async (ctx, id) => {
    const { data, error } = await ctx.adminClient
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return failure(error.message)
    return success(data)
  }
)

export async function getPublicBlogPosts(limit: number = 10) {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { serializeForServerAction } = await import('@/lib/server/serialize')
    const admin = createAdminClient()
    const { data } = await admin
      .from('blog_posts')
      .select('id, slug, title_es, title_en, excerpt_es, excerpt_en, featured_image_url, category, tags, published_at, profiles!blog_posts_author_id_fkey(full_name)')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit)
    return serializeForServerAction(data || [])
  } catch (err) {
    console.error('[getPublicBlogPosts]', err)
    return []
  }
}

export async function getPublicBlogPost(slug: string) {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { serializeForServerAction } = await import('@/lib/server/serialize')
    const admin = createAdminClient()
    const { data } = await admin
      .from('blog_posts')
      .select('*, profiles!blog_posts_author_id_fkey(full_name)')
      .eq('slug', slug)
      .eq('status', 'published')
      .single()
    return data ? serializeForServerAction(data) : null
  } catch (err) {
    console.error('[getPublicBlogPost]', err)
    return null
  }
}

/** Categorías visibles en la web para el menú de navegación */
export type WebCategory = {
  name: string
  slug: string
  sort_order: number
  children?: { name: string; slug: string; sort_order: number }[]
}

export async function getWebCategories(): Promise<WebCategory[]> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    // Obtener categorías principales + subcategorías en una sola query
    const { data } = await admin
      .from('product_categories')
      .select('id, name, slug, sort_order, parent_id')
      .eq('is_active', true)
      .eq('is_visible_web', true)
      .in('product_type', ['boutique', 'accessory'])
      .order('sort_order', { ascending: true })

    if (!data) return []

    // Separar padres e hijos
    const parents = data.filter(c => !c.parent_id)
    const children = data.filter(c => c.parent_id)

    return parents.map(p => ({
      name: p.name,
      slug: p.slug,
      sort_order: p.sort_order,
      children: children
        .filter(c => c.parent_id === p.id)
        .map(c => ({ name: c.name, slug: c.slug, sort_order: c.sort_order })),
    }))
  } catch (err) {
    console.error('[getWebCategories]', err)
    return []
  }
}
