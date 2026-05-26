'use client'

/**
 * Input híbrido para URL de imagen: el usuario puede pegar una URL externa
 * o subir un archivo local que se guarda en Supabase Storage y devuelve la
 * URL pública. Sirve para featured_image_url y og_image_url del blog.
 *
 * Muestra preview en cuanto hay valor. Subida en background con feedback.
 */

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  value: string
  onChange: (url: string) => void
  /** Función que sube el archivo y devuelve la URL pública. */
  onUpload: (file: File) => Promise<string>
  placeholder?: string
  /** Aspect ratio del preview (Tailwind class). Default: 'aspect-video' */
  previewAspect?: string
}

export function ImageUrlInput({
  value, onChange, onUpload, placeholder = 'https://...',
  previewAspect = 'aspect-video',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handlePickFile = () => fileInputRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await onUpload(file)
      onChange(url)
      toast.success('Imagen subida')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir la imagen'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={uploading}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handlePickFile}
          disabled={uploading}
          title="Subir desde el ordenador"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        {value && !uploading && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange('')}
            title="Quitar imagen"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {value && (
        <div className={`relative ${previewAspect} w-full overflow-hidden rounded-md border bg-muted/30`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  )
}

export default ImageUrlInput
