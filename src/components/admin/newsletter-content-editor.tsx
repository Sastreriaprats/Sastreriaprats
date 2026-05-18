'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ImageUpload } from '@/components/admin/image-upload'
import { ProductMultiSelect } from '@/components/admin/product-multiselect'
import type { ProductSearchResult } from '@/actions/products'

/** Contenido estructurado de una campaña con plantilla newsletter_*. */
export interface CampaignContent {
  hero_image_url: string
  hero_image_alt: string
  title_kicker: string
  title: string
  subtitle: string
  description: string
  products: ProductSearchResult[]
  cta_text: string
  cta_url: string
}

/**
 * Editor de contenido del email según la plantilla seleccionada:
 *  - `newsletter_default` → formulario estructurado completo
 *  - `newsletter_optin`   → formulario reducido (hero + nota)
 *  - resto (o sin plantilla) → textarea HTML libre, comportamiento legacy
 */
export function NewsletterContentEditor({
  templateCode,
  content,
  onContentChange,
  bodyHtml,
  onBodyHtmlChange,
}: {
  templateCode: string
  content: CampaignContent
  onContentChange: (next: CampaignContent) => void
  bodyHtml: string
  onBodyHtmlChange: (next: string) => void
}) {
  const update = <K extends keyof CampaignContent>(field: K, value: CampaignContent[K]) =>
    onContentChange({ ...content, [field]: value })

  if (templateCode === 'newsletter_default') {
    return (
      <div className="space-y-4 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Plantilla <code className="font-mono">newsletter_default</code>: el contenido se compone con los campos de abajo y se renderiza al enviar.
        </p>

        <ImageUpload
          value={content.hero_image_url || null}
          onChange={(url) => update('hero_image_url', url || '')}
          folder="newsletter"
          bucket="web-content"
          label="Imagen hero *"
          helpText="Imagen principal del email. Ratio recomendado 2:1, máx 600px de ancho."
          maxSizeMB={5}
        />

        <div className="space-y-2">
          <Label>Alt de la imagen</Label>
          <Input
            value={content.hero_image_alt}
            onChange={(e) => update('hero_image_alt', e.target.value)}
            placeholder="Texto alternativo de la imagen (accesibilidad)"
          />
        </div>

        <div className="space-y-2">
          <Label>Pretítulo (kicker)</Label>
          <Input
            value={content.title_kicker}
            onChange={(e) => update('title_kicker', e.target.value)}
            placeholder="Ej: Colección Otoño-Invierno"
          />
          <p className="text-xs text-muted-foreground">Línea pequeña en negrita encima del subtítulo.</p>
        </div>

        <div className="space-y-2">
          <Label>Subtítulo</Label>
          <Input
            value={content.subtitle}
            onChange={(e) => update('subtitle', e.target.value)}
            placeholder="Ej: Enfoque: Denim"
          />
        </div>

        <div className="space-y-2">
          <Label>Título principal *</Label>
          <Input
            value={content.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="Ej: Explora nuestra colección Otoño-Invierno"
          />
        </div>

        <div className="space-y-2">
          <Label>Descripción</Label>
          <Textarea
            value={content.description}
            onChange={(e) => update('description', e.target.value)}
            rows={3}
            placeholder="Opcional. Texto introductorio."
          />
        </div>

        <ProductMultiSelect
          value={content.products}
          onChange={(products) => update('products', products)}
          max={3}
          label="Productos del grid"
          helpText="Hasta 3 productos. Cada uno enlazará a su página pública."
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Texto del botón CTA</Label>
            <Input
              value={content.cta_text}
              onChange={(e) => update('cta_text', e.target.value)}
              placeholder="Ej: Descubrir colección"
            />
          </div>
          <div className="space-y-2">
            <Label>URL del botón CTA</Label>
            <Input
              type="url"
              value={content.cta_url}
              onChange={(e) => update('cta_url', e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
        {((content.cta_text.trim() && !content.cta_url.trim()) ||
          (!content.cta_text.trim() && content.cta_url.trim())) && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Para mostrar el botón debes rellenar texto y URL.
          </p>
        )}
      </div>
    )
  }

  if (templateCode === 'newsletter_optin') {
    return (
      <div className="space-y-4 border-t pt-4">
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Esta plantilla es para invitación inicial al opt-in (RGPD). Solo personaliza el asunto (arriba) y la imagen hero. El resto del contenido está predefinido.
        </p>
        <ImageUpload
          value={content.hero_image_url || null}
          onChange={(url) => update('hero_image_url', url || '')}
          folder="newsletter"
          bucket="web-content"
          label="Imagen hero *"
          helpText="Imagen principal del email de invitación."
          maxSizeMB={5}
        />
      </div>
    )
  }

  // Plantilla desconocida o sin plantilla: comportamiento legacy.
  return (
    <div className="space-y-2">
      <Label>Contenido HTML</Label>
      <Textarea
        value={bodyHtml}
        onChange={(e) => onBodyHtmlChange(e.target.value)}
        rows={6}
        placeholder={'<h2>Tu contenido aquí</h2>\n<p>Usa {{client_name}} para personalizar</p>'}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">
        Variables disponibles: {'{{client_name}}'}, {'{{first_name}}'}, {'{{client_email}}'}
      </p>
    </div>
  )
}
