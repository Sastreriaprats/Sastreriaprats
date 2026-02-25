'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGarmentTypes } from '@/hooks/use-cached-queries'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Shirt, CheckCircle2, XCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { updateMeasurementFieldAction } from '@/actions/config'

// Tipos de prenda cuyos campos se usan en el perfil del cliente
const CLIENT_GARMENT_NAMES = ['Americana', 'Pantalón', 'Chaleco']

interface GarmentType {
  id: string
  name: string
  sort_order: number
  fields?: MeasurementField[]
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
  is_active: boolean
}

export function GarmentTypesSection() {
  const supabase = useMemo(() => createClient(), [])
  const { data: garmentTypesData, isLoading: garmentTypesLoading } = useGarmentTypes()
  const groupGarments = useMemo(
    () => (garmentTypesData ?? []).filter(g => CLIENT_GARMENT_NAMES.includes(g.name)).sort((a, b) => a.sort_order - b.sort_order),
    [garmentTypesData],
  )
  const [garments, setGarments] = useState<GarmentType[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [savingField, setSavingField] = useState<string | null>(null)

  useEffect(() => {
    if (!groupGarments.length) {
      setGarments([])
      return
    }
    let cancelled = false
    setFieldsLoading(true)
    const ids = groupGarments.map(g => g.id)
    supabase
      .from('measurement_fields')
      .select('id, garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, is_active')
      .in('garment_type_id', ids)
      .order('sort_order')
      .then(({ data: allFields, error: fErr }) => {
        if (cancelled || fErr) return
        const fieldsByGarment: Record<string, MeasurementField[]> = {}
        for (const f of allFields ?? []) {
          if (!fieldsByGarment[f.garment_type_id]) fieldsByGarment[f.garment_type_id] = []
          fieldsByGarment[f.garment_type_id].push(f as MeasurementField)
        }
        setGarments(groupGarments.map(g => ({ id: g.id, name: g.name, sort_order: g.sort_order, fields: fieldsByGarment[g.id] ?? [] })))
      })
      .then(
        () => { if (!cancelled) setFieldsLoading(false) },
        () => { if (!cancelled) setFieldsLoading(false) },
      )
    return () => { cancelled = true }
  }, [groupGarments, supabase])

  const isLoading = garmentTypesLoading || fieldsLoading

  const handleToggleField = async (fieldId: string, currentActive: boolean) => {
    setSavingField(fieldId)
    // Actualización optimista
    setGarments(prev => prev.map(g => ({
      ...g,
      fields: g.fields?.map(f => f.id === fieldId ? { ...f, is_active: !currentActive } : f),
    })))
    const result = await updateMeasurementFieldAction(fieldId, { is_active: !currentActive })
    if (result.error) {
      toast.error(result.error)
      // Revertir si falla
      setGarments(prev => prev.map(g => ({
        ...g,
        fields: g.fields?.map(f => f.id === fieldId ? { ...f, is_active: currentActive } : f),
      })))
    } else {
      toast.success(`Campo ${!currentActive ? 'activado' : 'desactivado'}`)
    }
    setSavingField(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Shirt className="h-4 w-4 text-prats-navy" />
          Medidas base del cliente
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Campos de medida que aparecen en la ficha del cliente, agrupados por prenda. Activa o desactiva campos individuales según necesites.
        </p>
      </div>

      {garments.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No se encontraron tipos de prenda (<strong>Americana</strong>, <strong>Pantalón</strong>, <strong>Chaleco</strong>) en la base de datos.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Asegúrate de que existan esos registros en la tabla <code className="bg-muted px-1 rounded">garment_types</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {garments.map((g) => {
            const isEditing = editingGroup === g.id
            const totalFields = g.fields?.length ?? 0
            const activeCount = g.fields?.filter(f => f.is_active).length ?? 0

            return (
              <Card key={g.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shirt className="h-5 w-5 text-prats-navy shrink-0" />
                      <CardTitle className="text-base">{g.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {activeCount} / {totalFields} activos
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant={isEditing ? 'default' : 'outline'}
                      onClick={() => setEditingGroup(isEditing ? null : g.id)}
                      className={isEditing
                        ? 'gap-1.5 bg-prats-navy hover:bg-prats-navy-light'
                        : 'gap-1.5'}
                    >
                      {isEditing
                        ? <><X className="h-3.5 w-3.5" /> Cerrar</>
                        : <><Pencil className="h-3.5 w-3.5" /> Editar campos</>
                      }
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  {totalFields === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Sin campos definidos para esta prenda.
                    </p>
                  ) : isEditing ? (
                    <div className="divide-y">
                      {g.fields!.map((f) => (
                        <div key={f.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {f.is_active
                              ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                              : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                            }
                            <span className={`text-sm truncate ${!f.is_active ? 'text-muted-foreground line-through' : ''}`}>
                              {f.name}
                            </span>
                            <code className="text-xs text-muted-foreground bg-muted px-1 rounded hidden sm:inline">
                              {f.code}
                            </code>
                            {f.is_required && (
                              <Badge variant="outline" className="text-xs h-4 px-1 hidden sm:inline-flex">
                                Obligatorio
                              </Badge>
                            )}
                          </div>
                          <Switch
                            checked={f.is_active}
                            disabled={savingField === f.id}
                            onCheckedChange={() => handleToggleField(f.id, f.is_active)}
                            className="ml-3 shrink-0"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {g.fields!.filter(f => f.is_active).map(f => (
                        <Badge key={f.id} variant="outline" className="text-xs">{f.name}</Badge>
                      ))}
                      {g.fields!.filter(f => !f.is_active).map(f => (
                        <Badge key={f.id} variant="outline" className="text-xs opacity-40 line-through">{f.name}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
