'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

const DEFAULT_BUCKET = 'web-content'
const DEFAULT_FOLDER = 'uploads'
const DEFAULT_MAX_SIZE_MB = 5
const DEFAULT_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Normaliza el nombre original del fichero a un slug seguro para usar como
 * parte del path en Storage. Elimina path traversal, espacios, caracteres
 * especiales y trunca a 60 chars. Conserva extensión.
 */
function slugifyFilename(name: string): { slug: string; ext: string } {
  // Quitar cualquier ruta del nombre (defensa contra path traversal del cliente)
  const justName = name.replace(/^.*[\\/]/, '')
  const dotIdx = justName.lastIndexOf('.')
  const rawExt = dotIdx > 0 ? justName.slice(dotIdx + 1) : ''
  const rawBase = dotIdx > 0 ? justName.slice(0, dotIdx) : justName

  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const slug = rawBase
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'file'

  return { slug, ext }
}

/**
 * Sube una imagen al bucket de Supabase Storage indicado. Valida MIME, tamaño
 * y normaliza el path. Genérico para cualquier formulario del admin.
 *
 * No requiere un permiso concreto; basta con que el usuario esté autenticado
 * en el admin. La capa de autorización ya la hace `protectedAction`.
 */
export const uploadImage = protectedAction<
  FormData,
  { url: string; path: string }
>(
  { auditModule: 'uploads' },
  async (ctx, formData) => {
    const file = formData.get('file') as File | null
    if (!file || !file.size) return failure('No se ha enviado ningún archivo')

    const bucket = (formData.get('bucket') as string | null)?.trim() || DEFAULT_BUCKET
    const folder = ((formData.get('folder') as string | null) || DEFAULT_FOLDER)
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.\.+/g, '')

    const maxSizeMB = Number(formData.get('maxSizeMB')) || DEFAULT_MAX_SIZE_MB
    const allowedRaw = (formData.get('allowedMimeTypes') as string | null)?.trim()
    const allowed = allowedRaw
      ? allowedRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_ALLOWED_MIMES

    if (file.size > maxSizeMB * 1024 * 1024) {
      return failure(`El archivo supera el máximo de ${maxSizeMB} MB`)
    }
    if (!allowed.includes(file.type)) {
      return failure(`Tipo de archivo no permitido (${file.type}). Permitidos: ${allowed.join(', ')}`)
    }

    const { slug, ext } = slugifyFilename(file.name || 'image')
    const path = `${folder}/${Date.now()}_${slug}.${ext}`

    const buf = Buffer.from(await file.arrayBuffer())
    const doUpload = () =>
      ctx.adminClient.storage.from(bucket).upload(path, buf, {
        contentType: file.type,
        upsert: false,
      })

    let { error } = await doUpload()
    // Auto-crear bucket si no existe (mismo patrón que cms.ts:uploadWebContentImage).
    if (error?.message?.toLowerCase().includes('bucket') && error?.message?.toLowerCase().includes('not found')) {
      const { error: bucketError } = await ctx.adminClient.storage.createBucket(bucket, { public: true })
      if (!bucketError || bucketError.message?.toLowerCase().includes('already exists')) {
        const retry = await doUpload()
        error = retry.error
      }
    }
    if (error) {
      console.error('[uploadImage]', error)
      return failure(error.message || 'Error al subir el archivo')
    }

    const { data } = ctx.adminClient.storage.from(bucket).getPublicUrl(path)
    return success({ url: data.publicUrl, path })
  }
)
