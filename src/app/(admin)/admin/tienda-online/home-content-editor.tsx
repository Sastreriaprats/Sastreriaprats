'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ExternalLink, Upload, Save } from 'lucide-react'
import {
  getHomeSectionsForAdmin,
  updateHomeSection,
  uploadWebContentImage,
  type HomeSectionForAdmin,
} from '@/actions/cms'
import { toast } from 'sonner'

const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero',
  editorial_strip: 'Banda editorial',
  categories: 'Categorías (3 columnas)',
  editorial_double: 'Editorial doble',
  stores: 'Tiendas',
  cta: 'CTA final',
}

function ImageField({
  label,
  value,
  onChange,
  onUpload,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onUpload: (file: File) => Promise<string | null>
  disabled?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const url = await onUpload(file)
    setUploading(false)
    if (url) onChange(url)
    e.target.value = ''
  }
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="URL de la imagen"
          disabled={disabled}
          className="flex-1"
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export function HomeContentEditor() {
  const [sections, setSections] = useState<HomeSectionForAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await getHomeSectionsForAdmin()
    if (res.success && res.data) setSections(res.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleUpload = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.set('file', file)
    const res = await uploadWebContentImage(formData)
    if (res.success && res.data?.url) {
      toast.success('Imagen subida')
      return res.data.url
    }
    toast.error('error' in res ? res.error : 'Error al subir')
    return null
  }

  const saveSection = async (sec: HomeSectionForAdmin, payload: Omit<Parameters<typeof updateHomeSection>[0], 'sectionId'>) => {
    setSavingId(sec.id)
    const res = await updateHomeSection({ sectionId: sec.id, ...payload })
    setSavingId(null)
    if (res.success) {
      toast.success('Cambios guardados')
      load()
    } else {
      toast.error('error' in res ? res.error : 'Error al guardar')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!sections.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No hay secciones de la home. Ejecuta la migración 047 para crear el contenido inicial.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Edita los textos e imágenes de la página de inicio. Los cambios se reflejan al instante en la web.
        </p>
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-prats-navy hover:underline"
        >
          Ver web <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      {sections
        .filter((sec) => sec.section_type !== 'featured')
        .map((sec) => (
        <Card key={sec.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{SECTION_LABELS[sec.section_type] ?? sec.section_type}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sec.section_type === 'hero' && (
              <HeroForm
                section={sec}
                onSave={(payload) => saveSection(sec, payload)}
                onUpload={handleUpload}
                saving={savingId === sec.id}
              />
            )}
            {sec.section_type === 'editorial_strip' && (
              <EditorialStripForm
                section={sec}
                onSave={(payload) => saveSection(sec, payload)}
                saving={savingId === sec.id}
              />
            )}
            {sec.section_type === 'categories' && (
              <CategoriesForm
                section={sec}
                onSave={(payload) => saveSection(sec, payload)}
                onUpload={handleUpload}
                saving={savingId === sec.id}
              />
            )}
            {sec.section_type === 'editorial_double' && (
              <EditorialDoubleForm
                section={sec}
                onSave={(payload) => saveSection(sec, payload)}
                onUpload={handleUpload}
                saving={savingId === sec.id}
              />
            )}
            {sec.section_type === 'stores' && (
              <StoresForm
                section={sec}
                onSave={(payload) => saveSection(sec, payload)}
                onUpload={handleUpload}
                saving={savingId === sec.id}
              />
            )}
            {sec.section_type === 'cta' && (
              <CtaForm section={sec} onSave={(payload) => saveSection(sec, payload)} saving={savingId === sec.id} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function HeroForm({
  section,
  onSave,
  onUpload,
  saving,
}: {
  section: HomeSectionForAdmin
  onSave: (p: { title_es?: string; subtitle_es?: string; content_es?: string; settings?: Record<string, string> }) => void
  onUpload: (file: File) => Promise<string | null>
  saving: boolean
}) {
  const [title_es, setTitleEs] = useState(section.title_es ?? '')
  const [subtitle_es, setSubtitleEs] = useState(section.subtitle_es ?? '')
  const s = section.settings || {}
  const [image_url, setImageUrl] = useState(s.image_url ?? '')
  const [button1_label, setButton1Label] = useState(s.button1_label ?? '')
  const [button1_url, setButton1Url] = useState(s.button1_url ?? '')
  const [button2_label, setButton2Label] = useState(s.button2_label ?? '')
  const [button2_url, setButton2Url] = useState(s.button2_url ?? '')

  const handleSave = () => {
    onSave({
      title_es,
      subtitle_es,
      settings: {
        ...s,
        image_url,
        button1_label,
        button1_url,
        button2_label,
        button2_url,
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Título</Label>
          <Input value={title_es} onChange={(e) => setTitleEs(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Subtítulo</Label>
          <Input value={subtitle_es} onChange={(e) => setSubtitleEs(e.target.value)} />
        </div>
      </div>
      <ImageField value={image_url} onChange={setImageUrl} onUpload={onUpload} label="Imagen de fondo" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Botón 1 texto</Label>
          <Input value={button1_label} onChange={(e) => setButton1Label(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Botón 1 URL</Label>
          <Input value={button1_url} onChange={(e) => setButton1Url(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Botón 2 texto</Label>
          <Input value={button2_label} onChange={(e) => setButton2Label(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Botón 2 URL</Label>
          <Input value={button2_url} onChange={(e) => setButton2Url(e.target.value)} />
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>
    </div>
  )
}

function EditorialStripForm({
  section,
  onSave,
  saving,
}: {
  section: HomeSectionForAdmin
  onSave: (p: { content_es?: string }) => void
  saving: boolean
}) {
  const [content_es, setContentEs] = useState(section.content_es ?? '')

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Texto (mayúsculas, separado por ·)</Label>
        <Input
          value={content_es}
          onChange={(e) => setContentEs(e.target.value)}
          placeholder="NUEVA COLECCIÓN · OTOÑO INVIERNO 2025"
        />
      </div>
      <Button onClick={() => onSave({ content_es })} disabled={saving} size="sm" className="gap-1">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>
    </div>
  )
}

function CategoriesForm({
  section,
  onSave,
  onUpload,
  saving,
}: {
  section: HomeSectionForAdmin
  onSave: (p: { blocks?: { id: string; title_es?: string; image_url?: string; link_url?: string }[] }) => void
  onUpload: (file: File) => Promise<string | null>
  saving: boolean
}) {
  const [blocks, setBlocks] = useState(section.blocks ?? [])

  const updateBlock = (index: number, field: 'title_es' | 'image_url' | 'link_url', value: string) => {
    const next = blocks.map((b, i) => (i === index ? { ...b, [field]: value } : b))
    setBlocks(next)
  }

  const handleSave = () => {
    onSave({
      blocks: blocks.map((b) => ({
        id: b.id,
        title_es: b.title_es ?? undefined,
        image_url: b.image_url ?? undefined,
        link_url: b.link_url ?? undefined,
      })),
    })
  }

  return (
    <div className="space-y-4">
      {blocks.map((b, i) => (
        <div key={b.id} className="space-y-3 rounded-md border p-4">
          <Label>Card {i + 1}</Label>
          <Input
            placeholder="Título"
            value={b.title_es ?? ''}
            onChange={(e) => updateBlock(i, 'title_es', e.target.value)}
          />
          <ImageField
            label="Imagen"
            value={b.image_url ?? ''}
            onChange={(url) => updateBlock(i, 'image_url', url)}
            onUpload={onUpload}
          />
          <Input
            placeholder="URL (ej. /sastreria)"
            value={b.link_url ?? ''}
            onChange={(e) => updateBlock(i, 'link_url', e.target.value)}
          />
        </div>
      ))}
      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>
    </div>
  )
}

function EditorialDoubleForm({
  section,
  onSave,
  onUpload,
  saving,
}: {
  section: HomeSectionForAdmin
  onSave: (p: { title_es?: string; content_es?: string; settings?: Record<string, string> }) => void
  onUpload: (file: File) => Promise<string | null>
  saving: boolean
}) {
  const [title_es, setTitleEs] = useState(section.title_es ?? '')
  const [content_es, setContentEs] = useState(section.content_es ?? '')
  const s = section.settings || {}
  const [image_url, setImageUrl] = useState(s.image_url ?? '')
  const [button_label, setButtonLabel] = useState(s.button_label ?? '')
  const [button_url, setButtonUrl] = useState(s.button_url ?? '')

  const handleSave = () => {
    onSave({
      title_es,
      content_es,
      settings: { ...s, image_url, button_label, button_url },
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Título</Label>
        <Input value={title_es} onChange={(e) => setTitleEs(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Párrafo</Label>
        <Textarea value={content_es} onChange={(e) => setContentEs(e.target.value)} rows={3} />
      </div>
      <ImageField value={image_url} onChange={setImageUrl} onUpload={onUpload} label="Imagen (columna izquierda)" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Botón texto</Label>
          <Input value={button_label} onChange={(e) => setButtonLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Botón URL</Label>
          <Input value={button_url} onChange={(e) => setButtonUrl(e.target.value)} />
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>
    </div>
  )
}

function StoresForm({
  section,
  onSave,
  onUpload,
  saving,
}: {
  section: HomeSectionForAdmin
  onSave: (p: { title_es?: string; blocks?: { id: string; title_es?: string; content_es?: string; image_url?: string; link_url?: string }[] }) => void
  onUpload: (file: File) => Promise<string | null>
  saving: boolean
}) {
  const [title_es, setTitleEs] = useState(section.title_es ?? '')
  const [blocks, setBlocks] = useState(section.blocks ?? [])

  const updateBlock = (index: number, field: 'title_es' | 'content_es' | 'image_url' | 'link_url', value: string) => {
    const next = blocks.map((b, i) => (i === index ? { ...b, [field]: value } : b))
    setBlocks(next)
  }

  const handleSave = () => {
    onSave({
      title_es,
      blocks: blocks.map((b) => ({
        id: b.id,
        title_es: b.title_es ?? undefined,
        content_es: b.content_es ?? undefined,
        image_url: b.image_url ?? undefined,
        link_url: b.link_url ?? undefined,
      })),
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Título de la sección</Label>
        <Input value={title_es} onChange={(e) => setTitleEs(e.target.value)} />
      </div>
      {blocks.map((b, i) => (
        <div key={b.id} className="space-y-3 rounded-md border p-4">
          <Label>Tienda {i + 1}</Label>
          <Input
            placeholder="Nombre"
            value={b.title_es ?? ''}
            onChange={(e) => updateBlock(i, 'title_es', e.target.value)}
          />
          <Input
            placeholder="Dirección"
            value={b.content_es ?? ''}
            onChange={(e) => updateBlock(i, 'content_es', e.target.value)}
          />
          <ImageField
            label="Imagen"
            value={b.image_url ?? ''}
            onChange={(url) => updateBlock(i, 'image_url', url)}
            onUpload={onUpload}
          />
          <Input
            placeholder="URL mapa (Google Maps)"
            value={b.link_url ?? ''}
            onChange={(e) => updateBlock(i, 'link_url', e.target.value)}
          />
        </div>
      ))}
      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>
    </div>
  )
}

function CtaForm({
  section,
  onSave,
  saving,
}: {
  section: HomeSectionForAdmin
  onSave: (p: { title_es?: string; settings?: Record<string, string> }) => void
  saving: boolean
}) {
  const [title_es, setTitleEs] = useState(section.title_es ?? '')
  const s = section.settings || {}
  const [button_label, setButtonLabel] = useState(s.button_label ?? '')
  const [button_url, setButtonUrl] = useState(s.button_url ?? '')

  const handleSave = () => {
    onSave({
      title_es,
      settings: { ...s, button_label, button_url },
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Texto principal</Label>
        <Input value={title_es} onChange={(e) => setTitleEs(e.target.value)} placeholder="El traje perfecto comienza aquí." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Botón texto</Label>
          <Input value={button_label} onChange={(e) => setButtonLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Botón URL</Label>
          <Input value={button_url} onChange={(e) => setButtonUrl(e.target.value)} />
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>
    </div>
  )
}
