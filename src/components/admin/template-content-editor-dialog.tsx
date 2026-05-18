'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { upsertEmailTemplate } from '@/actions/emails'

/**
 * Editor "sin código" de plantilla. Permite a los administradores editar el
 * nombre interno, el asunto por defecto y el estado activo/inactivo de una
 * plantilla, SIN tocar el HTML maestro. El editor HTML técnico sigue siendo
 * accesible desde el menú ··· de cada card en la galería.
 */
export interface TemplateForEditor {
  id: string
  code: string
  name: string
  subject_es: string
  is_active: boolean
}

interface Props {
  template: TemplateForEditor | null
  onClose: () => void
  onSaved: () => void
}

export function TemplateContentEditorDialog({ template, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [active, setActive] = useState(true)
  const [errors, setErrors] = useState<{ name?: string; subject?: string }>({})
  const [saving, setSaving] = useState(false)

  const open = !!template

  // Resetear el formulario cada vez que cambie la plantilla seleccionada.
  useEffect(() => {
    if (!template) return
    setName(template.name)
    setSubject(template.subject_es)
    setActive(template.is_active)
    setErrors({})
  }, [template])

  const handleSave = async () => {
    if (!template) return
    const trimmedName = name.trim()
    const trimmedSubject = subject.trim()

    const nextErrors: typeof errors = {}
    if (trimmedName.length < 3) nextErrors.name = 'El nombre debe tener al menos 3 caracteres'
    if (trimmedSubject.length < 5) nextErrors.subject = 'El asunto debe tener al menos 5 caracteres'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    try {
      // Update parcial: upsertEmailTemplate hace `update({ ...data })` con
      // los campos que reciba, sin tocar body_html_es ni otros que no pasemos.
      const res = await upsertEmailTemplate({
        id: template.id,
        name: trimmedName,
        subject_es: trimmedSubject,
        is_active: active,
      })
      if (res.success) {
        toast.success('Contenido guardado')
        onSaved()
        onClose()
      } else {
        toast.error(res.error || 'Error al guardar')
      }
    } finally {
      setSaving(false)
    }
  }

  const isOptin = template?.code === 'newsletter_optin'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o && !saving) onClose() }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Editar contenido por defecto — {template?.name || ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Nombre interno (visible en la galería)</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              maxLength={120}
              placeholder="Ej: Newsletter Sastrería Prats"
            />
            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-subject">Asunto por defecto del email</Label>
            <Input
              id="tpl-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={saving}
              maxLength={200}
              placeholder="Ej: Descubre nuestra nueva colección"
            />
            {errors.subject && <p className="text-xs text-red-600">{errors.subject}</p>}
            <p className="text-xs text-muted-foreground">
              Este será el asunto inicial cuando se cree una campaña con esta plantilla.
              Se puede modificar al crear cada campaña.
            </p>
            {isOptin && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Recuerda que esta plantilla es la invitación inicial al opt-in. El asunto se
                ve en la bandeja de entrada antes de que el cliente confirme la suscripción.
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 pt-1">
            <Switch
              id="tpl-active"
              checked={active}
              onCheckedChange={setActive}
              disabled={saving}
            />
            <div className="space-y-1">
              <Label htmlFor="tpl-active" className="cursor-pointer">Plantilla activa</Label>
              <p className="text-xs text-muted-foreground">
                Si está inactiva, no se podrá usar para crear campañas nuevas, pero las
                campañas ya enviadas no se ven afectadas.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-prats-navy hover:bg-prats-navy/90 gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
