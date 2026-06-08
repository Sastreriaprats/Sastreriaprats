'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

/**
 * Fotos por prenda (línea de pedido de sastrería). Bucket PRIVADO: se guardan
 * PATHS en tailoring_order_lines.photos (jsonb array, máx 2) y se sirven con
 * signed URLs. Mismo patrón privado que supplier-invoices (mig 117).
 */
const BUCKET = 'order-line-photos'
const MAX_PHOTOS = 2
const MAX_SIZE_MB = 5
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const SIGNED_URL_TTL = 3600 // 1 hora

/** Normaliza el nombre del fichero a un slug seguro (defensa contra path traversal). */
function slugifyFilename(name: string): { slug: string; ext: string } {
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
    .slice(0, 60) || 'foto'
  return { slug, ext }
}

function readPhotos(row: unknown): string[] {
  const photos = (row as { photos?: unknown } | null)?.photos
  return Array.isArray(photos) ? (photos as string[]) : []
}

/**
 * Sube una foto a la línea. FormData: { lineId, file }. Devuelve el path nuevo y
 * el array actualizado. Rechaza si la línea ya tiene 2 fotos (defensa en app,
 * además del CHECK de BD). Si falla el UPDATE del array, borra el archivo recién
 * subido para no dejar huérfanos.
 */
export const addOrderLinePhoto = protectedAction<FormData, { path: string; photos: string[] }>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'update',
    auditEntity: 'tailoring_order_line',
  },
  async (ctx, formData) => {
    const lineId = (formData.get('lineId') as string | null)?.trim()
    const file = formData.get('file') as File | null
    if (!lineId) return failure('Falta la línea', 'VALIDATION')
    if (!file || !file.size) return failure('No se ha enviado ningún archivo', 'VALIDATION')
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return failure(`El archivo supera el máximo de ${MAX_SIZE_MB} MB`, 'VALIDATION')
    if (!ALLOWED_MIMES.includes(file.type)) {
      return failure(`Tipo de archivo no permitido (${file.type}). Permitidos: JPG, PNG, WEBP`, 'VALIDATION')
    }

    const { data: line, error: lineErr } = await ctx.adminClient
      .from('tailoring_order_lines').select('id, photos').eq('id', lineId).maybeSingle()
    if (lineErr) return failure(lineErr.message)
    if (!line) return failure('Línea de pedido no encontrada', 'NOT_FOUND')
    const current = readPhotos(line)
    if (current.length >= MAX_PHOTOS) return failure(`Máximo ${MAX_PHOTOS} fotos por prenda`, 'VALIDATION')

    const { slug, ext } = slugifyFilename(file.name || 'foto')
    const path = `${lineId}/${Date.now()}_${slug}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await ctx.adminClient.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: false })
    if (upErr) return failure(upErr.message || 'Error al subir la foto')

    const next = [...current, path]
    const { error: updErr } = await ctx.adminClient
      .from('tailoring_order_lines').update({ photos: next }).eq('id', lineId)
    if (updErr) {
      // Rollback de Storage: el archivo se subió pero el array no se actualizó.
      await ctx.adminClient.storage.from(BUCKET).remove([path]).then(() => {}, () => {})
      return failure(updErr.message)
    }

    return success({ path, photos: next, auditEntityId: lineId } as { path: string; photos: string[] })
  }
)

/**
 * Borra una foto de la línea. Atómico: primero se quita del array (fuente de
 * verdad para la UI) y luego del Storage. Si falla el remove de Storage, se
 * restaura el array para que el path no quede huérfano respecto a un archivo que
 * sigue existiendo. El peor caso posible es un archivo huérfano en Storage
 * (fuga menor), nunca un path roto en la UI.
 */
export const removeOrderLinePhoto = protectedAction<{ lineId: string; path: string }, { photos: string[] }>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'update',
    auditEntity: 'tailoring_order_line',
  },
  async (ctx, { lineId, path }) => {
    if (!lineId?.trim() || !path?.trim()) return failure('Parámetros no válidos', 'VALIDATION')

    const { data: line, error: lineErr } = await ctx.adminClient
      .from('tailoring_order_lines').select('id, photos').eq('id', lineId).maybeSingle()
    if (lineErr) return failure(lineErr.message)
    if (!line) return failure('Línea de pedido no encontrada', 'NOT_FOUND')
    const current = readPhotos(line)
    if (!current.includes(path)) return failure('La foto no pertenece a esta prenda', 'VALIDATION')

    const next = current.filter((p) => p !== path)
    const { error: updErr } = await ctx.adminClient
      .from('tailoring_order_lines').update({ photos: next }).eq('id', lineId)
    if (updErr) return failure(updErr.message)

    const { error: rmErr } = await ctx.adminClient.storage.from(BUCKET).remove([path])
    if (rmErr) {
      // Rollback del array: el archivo sigue existiendo, no dejamos el path fuera.
      await ctx.adminClient.from('tailoring_order_lines').update({ photos: current }).eq('id', lineId)
        .then(() => {}, () => {})
      return failure(rmErr.message || 'No se pudo borrar la foto del almacenamiento')
    }

    return success({ photos: next, auditEntityId: lineId } as { photos: string[] })
  }
)

/**
 * Devuelve signed URLs (1 h) de las fotos de la línea, para mostrarlas en lectura
 * (histórico admin/sastre). Solo lectura → permiso orders.view.
 */
export const getOrderLinePhotoUrls = protectedAction<string, { path: string; url: string }[]>(
  { permission: 'orders.view', auditModule: 'orders' },
  async (ctx, lineId) => {
    if (!lineId?.trim()) return failure('Falta la línea', 'VALIDATION')
    const { data: line, error } = await ctx.adminClient
      .from('tailoring_order_lines').select('photos').eq('id', lineId).maybeSingle()
    if (error) return failure(error.message)
    const paths = readPhotos(line)
    const out: { path: string; url: string }[] = []
    for (const p of paths) {
      const { data } = await ctx.adminClient.storage.from(BUCKET).createSignedUrl(p, SIGNED_URL_TTL)
      if (data?.signedUrl) out.push({ path: p, url: data.signedUrl })
    }
    return success(out)
  }
)
