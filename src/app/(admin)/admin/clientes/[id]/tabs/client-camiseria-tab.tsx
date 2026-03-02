'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGarmentTypes } from '@/hooks/use-cached-queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Save, Ruler, Clock, PlusCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { formatDateTime } from '@/lib/utils'
import { getClientMeasurements, saveBodyMeasurements } from '@/actions/clients'

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
  options: unknown
}

const PUNO_CODES = ['puno_sencillo', 'puno_gemelo', 'puno_mixto', 'puno_mosquetero', 'puno_otro']

function CamiseriaFieldInput({
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
  if (field.field_type === 'boolean') {
    const isRadio = PUNO_CODES.includes(field.code)
    if (isRadio) {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="camiseria_puno"
            checked={value === 'true'}
            onChange={() => onChange(field.code, 'true')}
            disabled={disabled}
            className="rounded border-input"
          />
          <span className="text-sm text-muted-foreground">{field.name}</span>
        </label>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          checked={value === 'true'}
          onCheckedChange={(c) => onChange(field.code, c ? 'true' : '')}
          disabled={disabled}
        />
        <Label className="text-xs text-muted-foreground cursor-pointer">{field.name}</Label>
      </div>
    )
  }

  if (field.field_type === 'text' && (field.code === 'tejido' || field.code === 'iniciales' || field.code === 'mod_cuello')) {
    if (field.code === 'tejido') {
      return (
        <div className="col-span-full space-y-1">
          <Label className="text-xs text-muted-foreground">{field.name}</Label>
          <Textarea
            rows={2}
            value={value}
            onChange={(e) => onChange(field.code, e.target.value)}
            disabled={disabled}
            className="text-sm resize-none"
            placeholder="—"
          />
        </div>
      )
    }
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{field.name}</Label>
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(field.code, e.target.value)}
          disabled={disabled}
          className="h-8 text-sm"
          placeholder="—"
        />
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{field.name}</Label>
      <div className="flex items-center gap-2">
        <Input
          type={field.field_type === 'number' ? 'number' : 'text'}
          step={field.field_type === 'number' ? '0.5' : undefined}
          value={value}
          onChange={(e) => onChange(field.code, e.target.value)}
          disabled={disabled}
          className="h-8 text-sm"
          placeholder="—"
        />
        {field.unit && field.unit !== 'none' && (
          <span className="text-xs text-muted-foreground w-8 shrink-0">{field.unit}</span>
        )}
      </div>
    </div>
  )
}

export function ClientCamiseriaTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const { can } = usePermissions()
  const canEdit = can('clients.edit')
  const { data: garmentTypesData, isLoading: garmentTypesLoading } = useGarmentTypes()

  const camiseriaTypeId = garmentTypesData?.find((g) => g.code === 'camiseria')?.id ?? null
  const [fields, setFields] = useState<MeasurementField[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)

  const normalizeValues = useCallback((raw: Record<string, unknown> | null | undefined): Record<string, string> => {
    if (!raw) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      out[k] = v == null ? '' : String(v)
    }
    return out
  }, [])

  const loadMeasurements = useCallback(
    async (garmentTypeId: string) => {
      const result = await getClientMeasurements({ clientId, garmentTypeId })
      if (result.success && result.data && result.data.length > 0) {
        setHistory(result.data)
        const current = result.data.find((m: any) => m.is_current) ?? result.data[0]
        setValues(normalizeValues(current.values))
        setCurrentId(current.id)
      } else {
        setHistory([])
        setValues({})
        setCurrentId(null)
      }
    },
    [clientId, normalizeValues]
  )

  const selectVersion = useCallback(
    (entry: any) => {
      setValues(normalizeValues(entry.values))
      setCurrentId(entry.id)
    },
    [normalizeValues]
  )

  useEffect(() => {
    if (!garmentTypesData || garmentTypesLoading || !camiseriaTypeId) return
    let cancelled = false
    async function init() {
      setIsLoading(true)
      try {
        const { data: fieldsData } = await supabase
          .from('measurement_fields')
          .select('id, garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, options')
          .eq('garment_type_id', camiseriaTypeId)
          .eq('is_active', true)
          .order('sort_order')
        if (!cancelled && fieldsData) {
          setFields(fieldsData as MeasurementField[])
        }
        if (!cancelled) await loadMeasurements(camiseriaTypeId)
      } catch (err) {
        console.error('[ClientCamiseriaTab] init error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [garmentTypesData, garmentTypesLoading, camiseriaTypeId, supabase, loadMeasurements])

  useEffect(() => {
    if (!garmentTypesLoading && garmentTypesData && !camiseriaTypeId) setIsLoading(false)
  }, [garmentTypesLoading, garmentTypesData, camiseriaTypeId])

  const set = (code: string, val: string) => {
    setValues((prev) => ({ ...prev, [code]: val }))
  }

  const handlePunoChange = (code: string) => {
    setValues((prev) => {
      const next = { ...prev }
      PUNO_CODES.forEach((c) => {
        next[c] = c === code ? 'true' : ''
      })
      return next
    })
  }

  const handleSave = async () => {
    if (!camiseriaTypeId) return
    setIsSaving(true)
    try {
      const result = await saveBodyMeasurements({
        client_id: clientId,
        values,
        garment_type_id: camiseriaTypeId,
      })
      if (!result.success) {
        toast.error((result as { error?: string }).error ?? 'Error al guardar')
        return
      }
      toast.success('Medidas de camisería guardadas correctamente')
      await loadMeasurements(camiseriaTypeId)
    } finally {
      setIsSaving(false)
    }
  }

  const showLoading = garmentTypesLoading || isLoading

  if (showLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-prats-navy" />
      </div>
    )
  }

  if (!camiseriaTypeId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-200">
            No está configurado el tipo de prenda Camisería
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Asegúrate de tener el tipo <strong>Camisería</strong> con código{' '}
            <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">camiseria</code> en{' '}
            <strong>Configuración → Prendas y Medidas</strong> (migración 050).
          </p>
        </div>
      </div>
    )
  }

  const byGroup: Record<string, MeasurementField[]> = {}
  for (const f of fields) {
    const key = f.field_group || '__default__'
    if (!byGroup[key]) byGroup[key] = []
    byGroup[key].push(f)
  }
  const groupOrder = ['medidas', 'caracteristicas', 'puno', 'tejido']
  const groupsToShow = groupOrder.filter((g) => byGroup[g]?.length)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Ruler className="h-5 w-5" /> Camisería
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
              onClick={() => {
                setValues({})
                setCurrentId(null)
              }}
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
        <div className="lg:col-span-2 space-y-4">
          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No hay campos de medida configurados para Camisería.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Configúralos en <strong>Configuración → Prendas y Medidas</strong> (migración 050).
              </p>
            </div>
          ) : (
            groupsToShow.map((groupName) => {
              const groupFields = byGroup[groupName] ?? []
              const isPuno = groupName === 'puno'
              return (
                <Card key={groupName}>
                  <CardContent className="pt-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-prats-navy">
                      {groupName === 'medidas'
                        ? 'Medidas'
                        : groupName === 'caracteristicas'
                          ? 'Características'
                          : groupName === 'puno'
                            ? 'Puño'
                            : 'Tejido'}
                    </p>
                    <div
                      className={
                        isPuno
                          ? 'flex flex-wrap gap-4'
                          : 'grid grid-cols-2 md:grid-cols-3 gap-3'
                      }
                    >
                      {groupFields.map((f) => (
                        <CamiseriaFieldInput
                          key={f.id}
                          field={f}
                          value={values[f.code] ?? ''}
                          onChange={(code, val) => {
                            if (PUNO_CODES.includes(code)) handlePunoChange(code)
                            else set(code, val)
                          }}
                          disabled={!canEdit}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" /> Historial
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin medidas de camisería previas.</p>
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
