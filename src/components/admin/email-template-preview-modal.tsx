'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { getEmailTemplate } from '@/actions/emails'

/**
 * Visualizador de una plantilla de email. Carga el HTML maestro y la
 * metadata (nombre, código, categoría, asunto, variables disponibles) y
 * renderiza un iframe con el HTML literal — sin interpolación de variables.
 * Útil para que los administradores inspeccionen una plantilla antes de
 * editarla en código.
 */
export function EmailTemplatePreviewModal({
  templateId,
  onClose,
  onEdit,
}: {
  templateId: string
  onClose: () => void
  onEdit: () => void
}) {
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const res = await getEmailTemplate(templateId)
      if (res.success) setTemplate(res.data ?? null)
      setLoading(false)
    }
    load()
  }, [templateId])

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (!template) {
    return <p className="py-12 text-center text-muted-foreground">Plantilla no encontrada</p>
  }

  const html = (template.body_html_es as string) || ''
  const vars = (template.variables as string[]) ?? []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <Label className="text-muted-foreground">Nombre</Label>
          <p className="font-medium">{template.name as string}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Código</Label>
          <p className="font-mono">{template.code as string}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Categoría</Label>
          <p>{template.category as string}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Asunto (ES)</Label>
          <p>{(template.subject_es as string) || '—'}</p>
        </div>
      </div>
      {vars.length > 0 && (
        <div>
          <Label className="text-muted-foreground">Variables</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {vars.map(v => (
              <Badge key={v} variant="secondary" className="text-xs font-mono">{`{{${v}}}`}</Badge>
            ))}
          </div>
        </div>
      )}
      <div>
        <Label className="text-muted-foreground">Vista previa (HTML renderizado)</Label>
        <div className="mt-2 rounded-lg border bg-white overflow-hidden">
          <iframe
            title="Preview"
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font-family:system-ui,sans-serif;">${html}</body></html>`}
            className="w-full min-h-[300px] border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        <Button onClick={onEdit} className="bg-prats-navy hover:bg-prats-navy/90">
          <Pencil className="h-4 w-4 mr-2" /> Editar
        </Button>
      </div>
    </div>
  )
}
