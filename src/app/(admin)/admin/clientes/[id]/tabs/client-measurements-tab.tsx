'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Save, Ruler, Clock, PlusCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { formatDateTime } from '@/lib/utils'
import { saveBodyMeasurements } from '@/actions/clients'

// Tipos de prenda que se cargan dinámicamente desde measurement_fields
const GARMENT_NAMES = ['Americana', 'Pantalón', 'Chaleco']

/**
 * Convierte el nombre del garment_type en el prefijo usado como clave en el JSONB.
 * 'Americana' → 'americana', 'Pantalón' → 'pantalon', 'Chaleco' → 'chaleco'
 */
function getGarmentPrefix(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina tildes
    .replace(/\s+/g, '_')
}

/**
 * Devuelve la clave real en el JSONB para un campo de una prenda.
 * Ejemplo: prefix='americana', code='talle' → 'americana_talle'
 */
function valueKey(prefix: string, code: string): string {
  return `${prefix}_${code}`
}

interface GarmentGroup {
  id: string
  name: string
  sort_order: number
  fields: MeasurementField[]
}

interface MeasurementField {
  id: string
  garment_type_id: string
  code: string
  name: string
  field_type: string
  unit: string
  sort_order: number
  field_group: string | null
  is_required: boolean
  options: any
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: MeasurementField
  value: string
  onChange: (code: string, val: string) => void
  disabled: boolean
}) {
  if (field.field_type === 'note') {
    return (
      <div className="col-span-full space-y-1">
        <Label className="text-xs text-muted-foreground">{field.name}</Label>
        <Textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(field.code, e.target.value)}
          disabled={disabled}
          className="text-sm"
          placeholder={`${field.name}…`}
        />
      </div>
    )
  }

  if (field.field_type === 'select' && Array.isArray(field.options)) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{field.name}</Label>
        <Select value={value} onValueChange={(v) => onChange(field.code, v)} disabled={disabled}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt: string) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (field.field_type === 'boolean') {
    return (
      <div className="flex items-center gap-2 pt-5">
        <Checkbox
          checked={value === 'true'}
          onCheckedChange={(c) => onChange(field.code, c ? 'true' : 'false')}
          disabled={disabled}
        />
        <Label className="text-xs text-muted-foreground cursor-pointer">{field.name}</Label>
      </div>
    )
  }

  // number | text (default)
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{field.name}</Label>
      <Input
        type={field.field_type === 'number' ? 'number' : 'text'}
        step={field.field_type === 'number' ? '0.5' : undefined}
        value={value}
        onChange={(e) => onChange(field.code, e.target.value)}
        disabled={disabled}
        className="h-8 text-sm"
        placeholder="—"
      />
    </div>
  )
}

export function ClientMeasurementsTab({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { can } = usePermissions()
  const canEdit = can('clients.edit')

  const [bodyGarmentTypeId, setBodyGarmentTypeId] = useState<string | null | undefined>(undefined)
  const [garmentGroups, setGarmentGroups] = useState<GarmentGroup[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)

  /** Normaliza el JSONB de la BD a Record<string, string> para los inputs controlados */
  const normalizeValues = useCallback((raw: Record<string, unknown> | null | undefined): Record<string, string> => {
    if (!raw) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      out[k] = v == null ? '' : String(v)
    }
    return out
  }, [])

  /** Carga o recarga el historial de medidas del cliente para el garment type body */
  const loadMeasurements = useCallback(async (bodyId: string) => {
    const { data } = await supabase
      .from('client_measurements')
      .select('*')
      .eq('client_id', clientId)
      .eq('garment_type_id', bodyId)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      setHistory(data)
      const current = data.find((m: any) => m.is_current) ?? data[0]
      setValues(normalizeValues(current.values))
      setCurrentId(current.id)
    } else {
      setHistory([])
      setValues({})
      setCurrentId(null)
    }
  }, [supabase, clientId, normalizeValues])

  /** Selecciona una versión del historial y carga sus valores en el formulario */
  const selectVersion = useCallback((entry: any) => {
    setValues(normalizeValues(entry.values))
    setCurrentId(entry.id)
  }, [normalizeValues])

  useEffect(() => {
    let cancelled = false
    async function init() {
      setIsLoading(true)
      try {
        // Carga en paralelo: tipo "body" (para guardar) + grupos Americana/Pantalón/Chaleco
        const [bodyRes, garmentsRes] = await Promise.all([
          supabase
            .from('garment_types')
            .select('id')
            .eq('code', 'body')
            .eq('is_active', true)
            .maybeSingle(),
          supabase
            .from('garment_types')
            .select('id, name, sort_order')
            .in('name', GARMENT_NAMES)
            .eq('is_active', true)
            .order('sort_order'),
        ])
        if (cancelled) return

        const bodyId = bodyRes.data?.id ?? null
        setBodyGarmentTypeId(bodyId)

        const garments = garmentsRes.data ?? []
        if (garments.length > 0) {
          const ids = garments.map((g: any) => g.id)
          const { data: fields } = await supabase
            .from('measurement_fields')
            .select('id, garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, options')
            .in('garment_type_id', ids)
            .eq('is_active', true)
            .order('sort_order')

          if (!cancelled) {
            const fieldsByGarment: Record<string, MeasurementField[]> = {}
            for (const f of fields ?? []) {
              if (!fieldsByGarment[f.garment_type_id]) fieldsByGarment[f.garment_type_id] = []
              fieldsByGarment[f.garment_type_id].push(f as MeasurementField)
            }
            setGarmentGroups(garments.map((g: any) => ({
              ...g,
              fields: fieldsByGarment[g.id] ?? [],
            })))
          }
        }

        if (!cancelled && bodyId) {
          await loadMeasurements(bodyId)
        }
      } catch (err) {
        console.error('[ClientMeasurementsTab] init error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [clientId, supabase, loadMeasurements])

  const set = (code: string, val: string) => {
    setValues(prev => ({ ...prev, [code]: val }))
  }

  const handleSave = async () => {
    if (!bodyGarmentTypeId) return
    setIsSaving(true)
    try {
      const result = await saveBodyMeasurements({
        client_id: clientId,
        values,
        garment_type_id: bodyGarmentTypeId,
      })
      if (!result.success) {
        toast.error((result as any).error ?? 'Error al guardar')
        return
      }
      toast.success('Medidas guardadas correctamente')
      await loadMeasurements(bodyGarmentTypeId)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Estados de carga / error ──────────────────────────────────────────────

  if (bodyGarmentTypeId === undefined || isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-prats-navy" />
      </div>
    )
  }

  if (bodyGarmentTypeId === null) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Falta el tipo de medidas para el perfil de cliente
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Crea el tipo <strong>Medidas base del cliente</strong> con código{' '}
            <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">body</code> en{' '}
            <strong>Configuración → Prendas y Medidas</strong> para que las medidas se puedan guardar correctamente.
          </p>
        </div>
      </div>
    )
  }

  // ── Renderizado principal ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Ruler className="h-5 w-5" /> Medidas del cliente
          </h3>
          {history.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Última toma: {formatDateTime(history[0].created_at)}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => { setValues({}); setCurrentId(null) }}
            >
              <PlusCircle className="h-4 w-4" /> Nuevas medidas
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-prats-navy hover:bg-prats-navy/90"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Formulario de medidas (columna izquierda, 2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {garmentGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No se encontraron campos de medida configurados para{' '}
                <strong>Americana</strong>, <strong>Pantalón</strong> o <strong>Chaleco</strong>.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Configúralos en <strong>Configuración → Prendas y Medidas</strong>.
              </p>
            </div>
          ) : (
            garmentGroups.map((g) => {
              // Prefijo que usan las claves en el JSONB: 'americana', 'pantalon', 'chaleco'
              const prefix = getGarmentPrefix(g.name)

              const byGroup: Record<string, MeasurementField[]> = {}
              for (const f of g.fields) {
                const key = f.field_group || '__default__'
                if (!byGroup[key]) byGroup[key] = []
                byGroup[key].push(f)
              }
              const groups = Object.entries(byGroup)

              return (
                <Card key={g.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-prats-navy">
                      {g.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {groups.map(([groupName, fields]) => (
                      <div key={groupName}>
                        {groupName !== '__default__' && (
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            {groupName}
                          </p>
                        )}
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                          {fields.map((f) => {
                            const vKey = valueKey(prefix, f.code)
                            return (
                              <FieldInput
                                key={f.id}
                                field={f}
                                value={values[vKey] ?? ''}
                                onChange={(_, val) => set(vKey, val)}
                                disabled={!canEdit}
                              />
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* Historial — siempre visible independientemente de los garmentGroups */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" /> Historial
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin medidas previas.</p>
          ) : (
            <div className="space-y-2">
              {history.map((m: any) => (
                <Card
                  key={m.id}
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${m.id === currentId ? 'ring-2 ring-prats-navy' : ''}`}
                  onClick={() => selectVersion(m)}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Versión {m.version}</span>
                      {m.is_current && <Badge className="text-xs bg-prats-navy">Actual</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(m.taken_at || m.created_at)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
