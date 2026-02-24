'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { listCmsPages, listBlogPosts } from '@/actions/cms'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  BookOpen,
  Plus,
  Loader2,
  Pencil,
  ExternalLink,
  Globe,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-red-100 text-red-700',
}

type CmsPage = {
  id: string
  slug: string
  title_es: string
  title_en?: string
  status: string
  page_type: string
  updated_at: string
}

type BlogPost = {
  id: string
  slug: string
  title_es: string
  title_en?: string
  status: string
  category?: string
  featured_image_url?: string
  published_at?: string
  profiles?: { full_name?: string } | { full_name?: string }[] | null
}

export function CmsContent() {
  const router = useRouter()
  const [pages, setPages] = useState<CmsPage[]>([])
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loadingPages, setLoadingPages] = useState(true)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [pagesError, setPagesError] = useState<string | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoadingPages(true)
      setPagesError(null)
      const result = await listCmsPages(undefined)
      if (result.success) {
        setPages((result.data as CmsPage[]) || [])
      } else {
        setPagesError(result.error)
      }
      setLoadingPages(false)
    }
    load()
  }, [])

  useEffect(() => {
    async function load() {
      setLoadingPosts(true)
      setPostsError(null)
      const result = await listBlogPosts(undefined)
      if (result.success) {
        setPosts((result.data as BlogPost[]) || [])
      } else {
        setPostsError(result.error)
      }
      setLoadingPosts(false)
    }
    load()
  }, [])

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com'

  const getAuthorName = (post: BlogPost): string => {
    const p = post.profiles
    if (!p) return '-'
    const profile = Array.isArray(p) ? p[0] : p
    return profile?.full_name ?? '-'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Web y CMS</h1>
        <p className="text-muted-foreground">
          Gestión de contenido de la web pública
        </p>
      </div>

      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages" className="gap-2">
            <FileText className="h-4 w-4" />
            Páginas
          </TabsTrigger>
          <TabsTrigger value="blog" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Blog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="mt-4">
          <Card>
            {loadingPages ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : pagesError ? (
              <div className="p-6 text-sm text-destructive">{pagesError}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Página</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Actualizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page) => (
                    <TableRow key={page.id}>
                      <TableCell>
                        <span>
                          {page.title_es}
                          {page.title_en && (
                            <span className="text-muted-foreground">
                              {' '}
                              / {page.title_en}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {page.slug}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{page.page_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            STATUS_COLORS[page.status] ||
                            'bg-gray-100 text-gray-700'
                          }
                        >
                          {STATUS_LABELS[page.status] || page.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(page.updated_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="blog" className="mt-4">
          <Card>
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-semibold">Artículos</h2>
              <Button
                onClick={() => router.push('/admin/cms/blog/nuevo')}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Nuevo artículo
              </Button>
            </div>
            {loadingPosts ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : postsError ? (
              <div className="p-6 text-sm text-destructive">{postsError}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Miniatura</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Publicado</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell>
                        {post.featured_image_url ? (
                          <img
                            src={post.featured_image_url}
                            alt=""
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span>
                          {post.title_es}
                          {post.title_en && (
                            <span className="text-muted-foreground">
                              {' '}
                              / {post.title_en}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{post.category ?? '-'}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            STATUS_COLORS[post.status] ||
                            'bg-gray-100 text-gray-700'
                          }
                        >
                          {STATUS_LABELS[post.status] || post.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatDate(post.published_at)}
                      </TableCell>
                      <TableCell>{getAuthorName(post)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              router.push(`/admin/cms/blog/${post.id}`)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {post.status === 'published' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              asChild
                            >
                              <a
                                href={`${baseUrl}/blog/${post.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
