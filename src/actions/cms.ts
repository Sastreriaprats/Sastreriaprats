'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

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
