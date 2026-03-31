import { BlogPostEditor } from './blog-post-editor'

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <BlogPostEditor id={id} />
}
