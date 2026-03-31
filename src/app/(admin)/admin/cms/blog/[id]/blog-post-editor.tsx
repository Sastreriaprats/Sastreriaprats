'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBlogPost, upsertBlogPost } from '@/actions/cms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

type BlogPost = {
  id?: string
  slug: string
  title_es: string
  title_en: string
  excerpt_es: string
  excerpt_en: string
  body_es: string
  body_en: string
  featured_image_url: string
  category: string
  tags: string[]
  status: string
  published_at: string
  seo_title: string
  seo_description: string
  og_image_url: string
}

const EMPTY_POST: BlogPost = {
  slug: '',
  title_es: '',
  title_en: '',
  excerpt_es: '',
  excerpt_en: '',
  body_es: '',
  body_en: '',
  featured_image_url: '',
  category: '',
  tags: [],
  status: 'draft',
  published_at: '',
  seo_title: '',
  seo_description: '',
  og_image_url: '',
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function BlogPostEditor({ id }: { id: string }) {
  const router = useRouter()
  const isNew = id === 'nuevo'
  const [post, setPost] = useState<BlogPost>(EMPTY_POST)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [tagsInput, setTagsInput] = useState('')
  const [autoSlug, setAutoSlug] = useState(true)

  useEffect(() => {
    if (isNew) return
    ;(async () => {
      const res = await getBlogPost(id)
      if (!res || !res.success) {
        toast.error(res?.error || 'Error al cargar el artículo')
        router.push('/admin/cms')
        return
      }
      const d = res.data as Record<string, unknown>
      setPost({
        id: d.id as string,
        slug: (d.slug as string) || '',
        title_es: (d.title_es as string) || '',
        title_en: (d.title_en as string) || '',
        excerpt_es: (d.excerpt_es as string) || '',
        excerpt_en: (d.excerpt_en as string) || '',
        body_es: (d.body_es as string) || '',
        body_en: (d.body_en as string) || '',
        featured_image_url: (d.featured_image_url as string) || '',
        category: (d.category as string) || '',
        tags: (d.tags as string[]) || [],
        status: (d.status as string) || 'draft',
        published_at: d.published_at ? (d.published_at as string).slice(0, 16) : '',
        seo_title: (d.seo_title as string) || '',
        seo_description: (d.seo_description as string) || '',
        og_image_url: (d.og_image_url as string) || '',
      })
      setTagsInput(((d.tags as string[]) || []).join(', '))
      setAutoSlug(false)
      setLoading(false)
    })()
  }, [id, isNew, router])

  const updateField = useCallback(
    (field: keyof BlogPost, value: string | string[]) => {
      setPost((prev) => {
        const next = { ...prev, [field]: value }
        if (field === 'title_es' && autoSlug) {
          next.slug = slugify(value as string)
        }
        return next
      })
    },
    [autoSlug]
  )

  const handleSave = async () => {
    if (!post.title_es.trim()) {
      toast.error('El título es obligatorio')
      return
    }
    if (!post.slug.trim()) {
      toast.error('El slug es obligatorio')
      return
    }

    setSaving(true)
    const payload: Record<string, unknown> = {
      slug: post.slug,
      title_es: post.title_es,
      title_en: post.title_en || null,
      excerpt_es: post.excerpt_es || null,
      excerpt_en: post.excerpt_en || null,
      body_es: post.body_es || null,
      body_en: post.body_en || null,
      featured_image_url: post.featured_image_url || null,
      category: post.category || null,
      tags: post.tags,
      status: post.status,
      published_at: post.published_at ? new Date(post.published_at).toISOString() : null,
      seo_title: post.seo_title || null,
      seo_description: post.seo_description || null,
      og_image_url: post.og_image_url || null,
    }

    if (!isNew) payload.id = id

    const res = await upsertBlogPost(payload)
    setSaving(false)

    if (!res || !res.success) {
      toast.error(res?.error || 'Error al guardar')
      return
    }

    toast.success(isNew ? 'Artículo creado' : 'Artículo guardado')

    if (isNew) {
      const newId = (res.data as { id: string }).id
      router.replace(`/admin/cms/blog/${newId}`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/cms')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? 'Nuevo artículo' : 'Editar artículo'}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contenido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Título (ES) *</Label>
                <Input
                  value={post.title_es}
                  onChange={(e) => updateField('title_es', e.target.value)}
                  placeholder="Título del artículo"
                />
              </div>
              <div className="space-y-2">
                <Label>Título (EN)</Label>
                <Input
                  value={post.title_en}
                  onChange={(e) => updateField('title_en', e.target.value)}
                  placeholder="Article title"
                />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <div className="flex gap-2">
                  <Input
                    value={post.slug}
                    onChange={(e) => {
                      setAutoSlug(false)
                      updateField('slug', e.target.value)
                    }}
                    placeholder="url-del-articulo"
                    className="font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">/blog/{post.slug || '...'}</p>
              </div>
              <div className="space-y-2">
                <Label>Extracto (ES)</Label>
                <Textarea
                  value={post.excerpt_es}
                  onChange={(e) => updateField('excerpt_es', e.target.value)}
                  placeholder="Breve descripción del artículo"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Extracto (EN)</Label>
                <Textarea
                  value={post.excerpt_en}
                  onChange={(e) => updateField('excerpt_en', e.target.value)}
                  placeholder="Brief description"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Cuerpo (ES)</Label>
                <Textarea
                  value={post.body_es}
                  onChange={(e) => updateField('body_es', e.target.value)}
                  placeholder="Contenido del artículo (Markdown)"
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Cuerpo (EN)</Label>
                <Textarea
                  value={post.body_en}
                  onChange={(e) => updateField('body_en', e.target.value)}
                  placeholder="Article content (Markdown)"
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Meta título</Label>
                <Input
                  value={post.seo_title}
                  onChange={(e) => updateField('seo_title', e.target.value)}
                  placeholder={post.title_es || 'Título para buscadores'}
                />
              </div>
              <div className="space-y-2">
                <Label>Meta descripción</Label>
                <Textarea
                  value={post.seo_description}
                  onChange={(e) => updateField('seo_description', e.target.value)}
                  placeholder="Descripción para buscadores"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Imagen OG</Label>
                <Input
                  value={post.og_image_url}
                  onChange={(e) => updateField('og_image_url', e.target.value)}
                  placeholder="URL de la imagen para compartir"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Publicación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={post.status} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="published">Publicado</SelectItem>
                    <SelectItem value="archived">Archivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha de publicación</Label>
                <Input
                  type="datetime-local"
                  value={post.published_at}
                  onChange={(e) => updateField('published_at', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Clasificación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Input
                  value={post.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  placeholder="ej. Estilo, Sastrería"
                />
              </div>
              <div className="space-y-2">
                <Label>Etiquetas</Label>
                <Input
                  value={tagsInput}
                  onChange={(e) => {
                    setTagsInput(e.target.value)
                    updateField(
                      'tags',
                      e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                    )
                  }}
                  placeholder="tag1, tag2, tag3"
                />
                <p className="text-xs text-muted-foreground">Separadas por comas</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Imagen destacada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL de imagen</Label>
                <Input
                  value={post.featured_image_url}
                  onChange={(e) => updateField('featured_image_url', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              {post.featured_image_url && (
                <img
                  src={post.featured_image_url}
                  alt="Preview"
                  className="w-full rounded-md object-cover aspect-video"
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
