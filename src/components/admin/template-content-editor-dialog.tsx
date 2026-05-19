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
import { Textarea } from '@/components/ui/textarea'
import { getEmailTemplate, updateTemplateContent } from '@/actions/emails'

/**
 * Editor "sin código" de plantilla. Permite a cualquier usuario con
 * `emails.view` editar el nombre interno, el asunto y el estado activo,
 * además de cada uno de los textos declarados en `editable_fields` de la
 * plantilla (cuando los tiene). El HTML maestro sigue siendo accesible
 * solo para admins desde el menú ··· de la galería.
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

/** Etiquetas amigables para nombres de campos comunes. Si una clave no
 *  está mapeada, se muestra el slug tal cual (en minúsculas con guiones). */
const FIELD_LABELS: Record<string, string> = {
  headline: 'Título principal',
  greeting: 'Saludo',
  intro_text: 'Texto introductorio',
  outro_text: 'Texto final',
  cta_text: 'Texto del botón',
  features_intro: 'Línea antes de la lista',
  feature_1: 'Punto 1 de la lista',
  feature_2: 'Punto 2 de la lista',
  feature_3: 'Punto 3 de la lista',
  feature_4: 'Punto 4 de la lista',
  items_label: 'Etiqueta "Artículos"',
  total_label: 'Etiqueta "Total"',
  order_label: 'Etiqueta "Pedido"',
  date_label: 'Etiqueta "Fecha"',
  time_label: 'Etiqueta "Hora"',
  store_label: 'Etiqueta "Tienda"',
  // ── Opt-in newsletter (mig 153) ──
  optin_title_kicker: 'Pretítulo',
  optin_title: 'Título principal',
  optin_body: 'Cuerpo del mensaje',
  optin_cta_text: 'Texto del botón',
  optin_footer_note: 'Nota final del footer',
}

/** Pistas adicionales por campo (mostradas como texto pequeño debajo del input). */
const FIELD_HINTS: Record<string, string> = {
  optin_body: 'Puedes usar {{first_name}} para incluir el nombre del cliente. Cada línea en blanco creará un párrafo nuevo.',
}

/** Filas de textarea por campo (override de la heurística). */
const FIELD_ROWS: Record<string, number> = {
  optin_body: 8,
  optin_footer_note: 2,
}

function labelFor(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Heurística: los campos cortos (etiquetas, texto botón) usan input simple,
 *  los largos (intro_text, outro_text, etc.) usan textarea. */
function isLongField(key: string, value: string): boolean {
  if (key in FIELD_ROWS) return true
  if (/_text$/.test(key) || key === 'message' || /_body$/.test(key) || /_note$/.test(key)) return true
  return value.length > 60
}

export function TemplateContentEditorDialog({ template, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [active, setActive] = useState(true)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [fieldKeys, setFieldKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; subject?: string; fields?: Record<string, string> }>({})
  const [saving, setSaving] = useState(false)

  const open = !!template

  // Cargar la plantilla completa al abrir el dialog (para obtener editable_fields).
  useEffect(() => {
    if (!template) return
    setName(template.name)
    setSubject(template.subject_es)
    setActive(template.is_active)
    setErrors({})
    setLoading(true)
    getEmailTemplate(template.id).then((res) => {
      if (res.success && res.data) {
        const raw = (res.data as Record<string, unknown>).editable_fields
        const ef = raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, string>)
          : {}
        const cleaned: Record<string, string> = {}
        for (const [k, v] of Object.entries(ef)) {
          cleaned[k] = typeof v === 'string' ? v : ''
        }
        setFields(cleaned)
        setFieldKeys(Object.keys(cleaned))
      } else {
        setFields({})
        setFieldKeys([])
      }
    }).finally(() => setLoading(false))
  }, [template])

  const updateField = (key: string, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!template) return
    const trimmedName = name.trim()
    const trimmedSubject = subject.trim()

    const nextErrors: typeof errors = {}
    if (trimmedName.length < 3) nextErrors.name = 'El nombre debe tener al menos 3 caracteres'
    if (trimmedSubject.length < 5) nextErrors.subject = 'El asunto debe tener al menos 5 caracteres'

    // Validaciones específicas del opt-in: campos obligatorios con mínimo de longitud.
    if (template.code === 'newsletter_optin') {
      const fieldErrors: Record<string, string> = {}
      const optinTitle = (fields.optin_title ?? '').trim()
      const optinBody = (fields.optin_body ?? '').trim()
      const optinCta = (fields.optin_cta_text ?? '').trim()
      if (optinTitle.length < 3) fieldErrors.optin_title = 'El título debe tener al menos 3 caracteres'
      if (optinBody.length < 20) fieldErrors.optin_body = 'El cuerpo debe tener al menos 20 caracteres'
      if (optinCta.length < 3) fieldErrors.optin_cta_text = 'El texto del botón debe tener al menos 3 caracteres'
      if (Object.keys(fieldErrors).length > 0) nextErrors.fields = fieldErrors
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    try {
      const res = await updateTemplateContent({
        id: template.id,
        name: trimmedName,
        subject_es: trimmedSubject,
        is_active: active,
        editable_fields: fieldKeys.length > 0 ? fields : undefined,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar contenido — {template?.name || ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Metadatos ── */}
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Nombre interno (visible en la galería)</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              maxLength={120}
              placeholder="Ej: Confirmación de pedido"
            />
            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-subject">Asunto del email</Label>
            <Input
              id="tpl-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={saving}
              maxLength={200}
              placeholder="Ej: Pedido confirmado — {{order_number}}"
            />
            {errors.subject && <p className="text-xs text-red-600">{errors.subject}</p>}
            <p className="text-xs text-muted-foreground">
              Puedes usar variables tipo <code className="font-mono">{'{{order_number}}'}</code> que el sistema sustituye al enviar.
            </p>
            {isOptin && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Esta plantilla es la invitación inicial al opt-in. El asunto se ve en la bandeja de entrada antes de que el cliente confirme la suscripción.
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

          {/* ── Textos editables del cuerpo ── */}
          {loading ? (
            <div className="py-4 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : fieldKeys.length > 0 ? (
            <div className="space-y-4 pt-2 border-t">
              <div>
                <h3 className="text-sm font-semibold text-prats-navy">
                  {isOptin ? 'Contenido del email (opt-in RGPD)' : 'Textos del email'}
                </h3>
                {!isOptin && (
                  <p className="text-xs text-muted-foreground">
                    Edita cada texto que aparece en el cuerpo. Puedes usar variables como{' '}
                    <code className="font-mono">{'{{client_name}}'}</code> o{' '}
                    <code className="font-mono">{'{{order_number}}'}</code> y se sustituyen automáticamente.
                  </p>
                )}
              </div>
              {isOptin && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  ⚠ Este texto se envía a clientes que aún no han dado su consentimiento (RGPD).
                  Asegúrate de que sigue siendo claro y explícito sobre por qué se pide el consentimiento.
                  Cambios drásticos pueden afectar al cumplimiento legal.
                </p>
              )}
              {fieldKeys.map((key) => {
                const value = fields[key] ?? ''
                const rows = FIELD_ROWS[key] ?? 2
                const hint = FIELD_HINTS[key]
                const fieldError = errors.fields?.[key]
                return (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`field-${key}`} className="text-xs">{labelFor(key)}</Label>
                    {isLongField(key, value) ? (
                      <Textarea
                        id={`field-${key}`}
                        value={value}
                        onChange={(e) => updateField(key, e.target.value)}
                        disabled={saving}
                        rows={rows}
                        className="text-sm"
                      />
                    ) : (
                      <Input
                        id={`field-${key}`}
                        value={value}
                        onChange={(e) => updateField(key, e.target.value)}
                        disabled={saving}
                        className="text-sm"
                      />
                    )}
                    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                    {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
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
