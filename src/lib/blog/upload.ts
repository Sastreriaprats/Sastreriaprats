/**
 * Helper cliente para subir imágenes del blog al bucket `web-content` de
 * Supabase Storage. Envuelve la server action genérica `uploadImage` con
 * los defaults del blog (bucket, MIMEs permitidos, tamaño máximo).
 *
 * Folder structure:
 *   blog/{postKey}/...   → si tenemos identificador del post (id o slug)
 *   blog/_inline/...     → imágenes insertadas en el editor antes de tener id
 *
 * Devuelve la URL pública absoluta, lanza Error si falla la subida.
 */
import { uploadImage } from '@/actions/uploads'

const BLOG_MAX_MB = 8
const BLOG_ALLOWED_MIMES = 'image/jpeg,image/png,image/webp'

export async function uploadBlogImage(
  file: File,
  options?: { postKey?: string | null; subfolder?: string },
): Promise<string> {
  const key = options?.postKey?.trim() || '_inline'
  const sub = options?.subfolder?.trim()
  const folder = sub ? `blog/${key}/${sub}` : `blog/${key}`

  const fd = new FormData()
  fd.append('file', file)
  fd.append('bucket', 'web-content')
  fd.append('folder', folder)
  fd.append('maxSizeMB', String(BLOG_MAX_MB))
  fd.append('allowedMimeTypes', BLOG_ALLOWED_MIMES)

  const res = await uploadImage(fd)
  if (!res.success) {
    throw new Error(res.error || 'Error al subir la imagen')
  }
  return res.data.url
}
