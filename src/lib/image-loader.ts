// Loader de imágenes para next/image.
// Motivo: el optimizador por defecto de Vercel tiene cuota mensual y devolvía
// 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED, dejando productos sin foto.
// En su lugar usamos Image Transformations de Supabase para todo lo que viva
// en nuestro propio bucket; el resto (CDNs externas) se sirve tal cual.

const SUPABASE_HOST = 'fvjdqazfgjspxmwlvkpg.supabase.co'

type LoaderArgs = { src: string; width: number; quality?: number }

export default function imageLoader({ src, width, quality }: LoaderArgs): string {
  // Solo transforma URLs absolutas de nuestro Supabase Storage público.
  if (src.startsWith(`https://${SUPABASE_HOST}/storage/v1/object/public/`)) {
    const path = src.replace(
      `https://${SUPABASE_HOST}/storage/v1/object/public/`,
      `https://${SUPABASE_HOST}/storage/v1/render/image/public/`,
    )
    const params = new URLSearchParams({
      width: String(width),
      quality: String(quality ?? 75),
      resize: 'contain',
    })
    return `${path}?${params.toString()}`
  }
  return src
}
