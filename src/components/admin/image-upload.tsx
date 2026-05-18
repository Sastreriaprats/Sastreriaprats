'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload, X, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { uploadImage } from '@/actions/uploads'

const DEFAULT_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']

interface ImageUploadProps {
  value: string | null
  onChange: (url: string | null) => void
  folder?: string
  bucket?: string
  maxSizeMB?: number
  /** Atributo `accept` del input file. Default: 'image/*'. */
  accept?: string
  /** Lista de MIME aceptados; se valida en cliente Y en servidor. */
  allowedMimeTypes?: string[]
  label?: string
  /** Texto secundario debajo del label, opcional. */
  helpText?: string
  /** Class extra del contenedor (para integrarlo en grids/dialogs). */
  className?: string
}

export function ImageUpload({
  value,
  onChange,
  folder = 'uploads',
  bucket = 'web-content',
  maxSizeMB = 5,
  accept = 'image/*',
  allowedMimeTypes = DEFAULT_ALLOWED_MIMES,
  label = 'Imagen',
  helpText,
  className,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    const file = files[0]

    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`La imagen supera el máximo de ${maxSizeMB} MB`)
      return
    }
    if (!allowedMimeTypes.includes(file.type)) {
      toast.error(`Tipo no permitido (${file.type}). Usa JPG, PNG o WebP.`)
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('bucket', bucket)
      fd.append('folder', folder)
      fd.append('maxSizeMB', String(maxSizeMB))
      fd.append('allowedMimeTypes', allowedMimeTypes.join(','))

      const res = await uploadImage(fd)
      if (!res.success) {
        toast.error(res.error || 'Error al subir la imagen')
        return
      }
      if (!res.data?.url) {
        toast.error('La subida no devolvió URL')
        return
      }
      onChange(res.data.url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de red'
      toast.error(`No se pudo subir la imagen: ${msg}`)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onPick = () => inputRef.current?.click()

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (uploading) return
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className={className}>
      {label && <Label className="mb-2 block">{label}</Label>}
      {helpText && <p className="text-xs text-muted-foreground mb-2">{helpText}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading}
      />

      {value ? (
        <div className="relative rounded-md border bg-muted/30 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label || 'Imagen'} className="w-full max-h-64 object-contain bg-white" />
          <div className="flex gap-2 p-2 border-t bg-background">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPick}
              disabled={uploading}
              className="gap-1"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {uploading ? 'Subiendo…' : 'Cambiar'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={uploading}
              className="gap-1 text-red-600 hover:text-red-700"
            >
              <X className="h-3 w-3" /> Eliminar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={uploading}
          className={[
            'w-full rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-2 py-10 px-4 text-sm transition-colors',
            dragging ? 'border-prats-navy bg-prats-navy/5' : 'border-muted-foreground/30 bg-muted/10',
            uploading ? 'opacity-60 cursor-progress' : 'hover:border-prats-navy/60 hover:bg-prats-navy/5 cursor-pointer',
          ].join(' ')}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Subiendo…</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Arrastra una imagen o haz clic para seleccionar
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Máx {maxSizeMB} MB · JPG, PNG o WebP
              </p>
            </>
          )}
        </button>
      )}
    </div>
  )
}
