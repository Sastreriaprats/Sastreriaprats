/**
 * Normaliza una foto elegida/hecha en el cliente ANTES de subirla al servidor.
 *
 * Motivación: la cámara del iPad (Safari iOS) entrega las fotos como HEIC/HEIF
 * —o a veces con `file.type` vacío— y con resolución de 12 MP (>5 MB). El servidor
 * solo acepta JPG/PNG/WEBP ≤5 MB, así que esas fotos se rechazaban en silencio
 * ("hago la foto, doy a continuar y no aparece"). Además, un HEIC almacenado no
 * se vería en el admin (Chrome/Windows no renderiza HEIC).
 *
 * Esta función redibuja la imagen en un canvas y la reexporta como JPEG:
 *  - Convierte HEIC/HEIF a JPEG allí donde se origina (iOS Safari sí decodifica HEIC).
 *  - Da un `type` fiable (`image/jpeg`) aunque el original venga vacío.
 *  - Reduce el tamaño (downscale + compresión) para no chocar con el límite de 5 MB.
 *
 * Es best-effort: si algo falla (navegador que no decodifica el formato, canvas
 * sin `toBlob`, etc.) devuelve el fichero ORIGINAL sin tocar, para no romper el
 * caso ya funcional de subir un JPG/PNG/WEBP normal.
 */

const MAX_DIMENSION = 2400 // px (lado mayor); suficiente para detalle de prenda
const JPEG_QUALITY = 0.85

function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  // Vía preferente: createImageBitmap respeta la orientación EXIF de las fotos del móvil.
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).then((bmp) => ({
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      close: () => bmp.close(),
    }))
  }
  // Fallback vía <img> + object URL (Safari moderno aplica la orientación EXIF por defecto).
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    })
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo decodificar la imagen')) }
    img.src = url
  })
}

export async function preparePhotoForUpload(file: File): Promise<File> {
  // Guard de entorno (por si se llamara fuera del navegador) y de tipo.
  if (typeof document === 'undefined' || typeof file?.arrayBuffer !== 'function') return file

  try {
    const bmp = await loadBitmap(file)
    try {
      if (!bmp.width || !bmp.height) return file

      const scale = Math.min(1, MAX_DIMENSION / Math.max(bmp.width, bmp.height))
      const w = Math.max(1, Math.round(bmp.width * scale))
      const h = Math.max(1, Math.round(bmp.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      // Fondo blanco por si el original tuviera transparencia (JPEG no la soporta).
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      bmp.draw(ctx, w, h)

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY)
      )
      if (!blob || !blob.size) return file

      const base = (file.name || 'foto').replace(/\.[^./\\]+$/, '') || 'foto'
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
    } finally {
      bmp.close()
    }
  } catch {
    // Best-effort: si no se pudo convertir, subimos el original tal cual.
    return file
  }
}
