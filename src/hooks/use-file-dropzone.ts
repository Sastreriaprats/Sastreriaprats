'use client'

import { useState, type DragEvent } from 'react'

/**
 * Hook reutilizable para habilitar "arrastrar y soltar" (drag & drop) de
 * archivos sobre cualquier zona de la UI.
 *
 * No sube nada por sí mismo: se limita a capturar los `File` soltados y a
 * exponer un flag `dragging` para el resaltado visual. La lógica de subida
 * (server action, upload directo a Storage, FileReader, etc.) la sigue
 * poniendo cada componente en su callback `onFiles`, por lo que encaja con
 * los inputs `type="file"` ya existentes sin reescribir su handler.
 *
 * Uso típico:
 *   const { dragging, dropzoneProps } = useFileDropzone({
 *     onFiles: (files) => handleFiles(files),   // reutiliza el handler actual
 *     disabled: uploading,
 *   })
 *   <div {...dropzoneProps} className={dragging ? 'ring-2 ...' : ''}>…</div>
 */
interface UseFileDropzoneOptions {
  /** Se invoca con los archivos soltados (siempre ≥ 1). */
  onFiles: (files: File[]) => void
  /** Si es true, ignora el drag & drop (p. ej. mientras sube). */
  disabled?: boolean
}

export function useFileDropzone({ onFiles, disabled }: UseFileDropzoneOptions) {
  const [dragging, setDragging] = useState(false)

  const onDragOver = (e: DragEvent) => {
    if (disabled) return
    // Necesario para que el navegador permita el "drop".
    e.preventDefault()
    if (!dragging) setDragging(true)
  }

  const onDragLeave = (e: DragEvent) => {
    // Al pasar el puntero sobre un hijo de la zona el navegador dispara
    // dragleave; sólo desactivamos el resaltado si salimos del contenedor.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragging(false)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length > 0) onFiles(files)
  }

  return {
    /** true mientras hay un archivo siendo arrastrado sobre la zona. */
    dragging,
    /** Props a esparcir sobre el contenedor droppable. */
    dropzoneProps: { onDragOver, onDragLeave, onDrop },
  }
}
