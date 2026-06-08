'use client'

/**
 * Miniaturas de las fotos de una prenda (línea de pedido). Solo lectura.
 * Recibe las signed URLs ya resueltas (getOrderLinePhotosBatch / getOrderLinePhotoUrls)
 * — no consulta nada. Click en una miniatura → abre la foto a tamaño completo en
 * pestaña nueva (lo más simple, sin librería de lightbox).
 *
 * Neutro de tema (sirve en el detalle admin claro y en el sastre oscuro): solo
 * pinta thumbnails con borde; devuelve null si no hay fotos (sin hueco raro).
 */
type LinePhoto = { path: string; url: string }

export function LinePhotosViewer({ urls, className }: { urls?: LinePhoto[]; className?: string }) {
  if (!urls || urls.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {urls.map((p) => (
        <a
          key={p.path}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-md border border-black/10 overflow-hidden hover:ring-2 hover:ring-prats-navy/40 transition"
          title="Ver a tamaño completo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt="Foto de la prenda" className="h-16 w-16 object-cover bg-white" />
        </a>
      ))}
    </div>
  )
}
