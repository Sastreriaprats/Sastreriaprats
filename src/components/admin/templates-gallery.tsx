'use client'

import {
  Eye, ImageIcon, Pencil, Plus, MoreVertical, Code2, Power, PowerOff,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Alias local: cada fila de email_templates llega como Record genérico. */
export type Template = Record<string, unknown>

/**
 * Galería visual de plantillas. Muestra cards con miniatura y permite
 * "Usar esta plantilla" (todos), "Editar contenido por defecto" y un menú
 * técnico con activar/desactivar + editar HTML maestro (solo admin).
 */
export function TemplatesGallery({
  templates,
  canEditHtml,
  showSystem,
  onToggleShowSystem,
  onUseTemplate,
  onEditDefault,
  onEditHtml,
  onToggleActive,
  onPreview,
  onZoom,
  onNewTemplate,
}: {
  templates: Template[]
  /** Permiso emails.manage_templates_html: gestiona el menú ··· y "Nueva plantilla". */
  canEditHtml: boolean
  showSystem: boolean
  onToggleShowSystem: (v: boolean) => void
  onUseTemplate: (t: Template) => void
  onEditDefault: (t: Template) => void
  onEditHtml: (t: Template) => void
  onToggleActive: (t: Template) => void
  onPreview: (id: string) => void
  onZoom: (t: Template) => void
  onNewTemplate: () => void
}) {
  const marketing = templates.filter((t) => (t.category as string) === 'marketing')
  const system = templates.filter((t) => (t.category as string) !== 'marketing')

  return (
    <div className="space-y-6">
      {/* Header con toggle (admin) y botón Nueva plantilla (admin) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Plantillas de email</h2>
          <p className="text-xs text-muted-foreground">
            Elige una plantilla para crear una campaña con ella.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle disponible para cualquier user con emails.view: permite
              ver las plantillas transaccionales (bienvenida, confirmación de
              pedido, etc.) y editar nombre/asunto/estado sin tocar HTML. */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showSystem} onCheckedChange={onToggleShowSystem} />
            Mostrar plantillas del sistema
          </label>
          {canEditHtml && (
            <Button onClick={onNewTemplate} className="gap-2 bg-prats-navy hover:bg-prats-navy/90">
              <Plus className="h-4 w-4" /> Nueva plantilla
            </Button>
          )}
        </div>
      </div>

      {/* Marketing */}
      {marketing.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 p-12 text-center text-sm text-muted-foreground">
          No hay plantillas de marketing configuradas. Contacta con el administrador.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {marketing.map((t) => (
            <TemplateCard
              key={t.id as string}
              template={t}
              canEditHtml={canEditHtml}
              onUseTemplate={onUseTemplate}
              onEditDefault={onEditDefault}
              onEditHtml={onEditHtml}
              onToggleActive={onToggleActive}
              onPreview={onPreview}
              onZoom={onZoom}
            />
          ))}
        </div>
      )}

      {/* Sistema (transaccionales — visible para todos cuando el toggle está activo) */}
      {showSystem && system.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground">Sistema (no usar para campañas)</h3>
            <p className="text-xs text-muted-foreground">
              Plantillas transaccionales que envía la app automáticamente. No están pensadas para campañas masivas.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {system.map((t) => (
              <TemplateCard
                key={t.id as string}
                template={t}
                canEditHtml={canEditHtml}
                isSystem
                onUseTemplate={onUseTemplate}
                onEditDefault={onEditDefault}
                onEditHtml={onEditHtml}
                onToggleActive={onToggleActive}
                onPreview={onPreview}
                onZoom={onZoom}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Tarjeta individual de plantilla en la galería. */
function TemplateCard({
  template,
  canEditHtml,
  isSystem = false,
  onUseTemplate,
  onEditDefault,
  onEditHtml,
  onToggleActive,
  onPreview,
  onZoom,
}: {
  template: Template
  canEditHtml: boolean
  isSystem?: boolean
  onUseTemplate: (t: Template) => void
  onEditDefault: (t: Template) => void
  onEditHtml: (t: Template) => void
  onToggleActive: (t: Template) => void
  onPreview: (id: string) => void
  onZoom: (t: Template) => void
}) {
  const isActive = Boolean(template.is_active)
  const thumb = template.thumbnail_url as string | null | undefined

  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
      {/* Miniatura */}
      <div className="relative aspect-[600/800] bg-muted/30 border-b group">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={template.name as string}
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 mb-2" />
            <p className="text-xs">Miniatura no disponible</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => onZoom(template)}
          className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          title="Ver ejemplo grande"
        >
          <Eye className="h-3.5 w-3.5 text-prats-navy" />
        </button>
      </div>

      {/* Cuerpo */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight truncate" title={template.name as string}>
            {template.name as string}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isActive
            ? <Badge className="bg-green-100 text-green-700 text-[10px]">Activa</Badge>
            : <Badge variant="secondary" className="text-[10px]">Inactiva</Badge>}
          <Badge variant="outline" className="text-[10px]">
            {isSystem ? 'Sistema' : 'Marketing'}
          </Badge>
        </div>

        {/* Acciones */}
        <div className="mt-auto pt-2 flex items-center gap-2">
          {!isSystem && (
            <Button
              size="sm"
              className="flex-1 bg-prats-navy hover:bg-prats-navy/90 text-xs"
              disabled={!isActive}
              onClick={() => onUseTemplate(template)}
            >
              Usar esta plantilla
            </Button>
          )}
          {/* Lápiz visible para cualquier user con emails.view. Edita nombre,
              asunto y estado vía updateTemplateContent — sin tocar HTML. */}
          <Button
            size="sm"
            variant="outline"
            className={isSystem ? 'flex-1 text-xs gap-1' : 'text-xs'}
            onClick={() => onEditDefault(template)}
            title="Editar nombre, asunto y estado"
          >
            <Pencil className="h-3 w-3" />
            {isSystem && <span>Editar</span>}
          </Button>
          {canEditHtml && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs px-2">
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => onPreview(template.id as string)}>
                  <Eye className="h-4 w-4 mr-2" /> Ver HTML renderizado
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleActive(template)}>
                  {isActive
                    ? <><PowerOff className="h-4 w-4 mr-2" /> Desactivar plantilla</>
                    : <><Power className="h-4 w-4 mr-2" /> Activar plantilla</>}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEditHtml(template)} className="text-amber-700 focus:text-amber-800">
                  <Code2 className="h-4 w-4 mr-2" /> Editar HTML maestro
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}
