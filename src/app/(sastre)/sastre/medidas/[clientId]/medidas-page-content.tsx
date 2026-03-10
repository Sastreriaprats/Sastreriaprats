'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGarmentTypes } from '@/hooks/use-cached-queries'
import { saveBodyMeasurements, getClientMeasurements } from '@/actions/clients'
import { SastreHeader } from '../../../components/sastre-header'
import { Loader2, Save, Clock, AlertCircle, PlusCircle, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { generateCamiseriaFichaPdf } from '@/lib/camiseria-ficha-pdf'

const GARMENT_NAMES = ['Americana', 'Pantalón', 'Chaleco', 'Camisería']
/** Índice tab → zona silueta: 0=americana, 1=pantalon, 2=chaleco, 3=camiseria (sin zona en silueta) */
const TAB_TO_ZONE = ['americana', 'pantalon', 'chaleco', 'camiseria'] as const

function getGarmentPrefix(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

function valueKey(prefix: string, code: string): string {
  return `${prefix}_${code}`
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
  options: unknown
}

interface GarmentGroup {
  id: string
  name: string
  sort_order: number
  fields: MeasurementField[]
}

interface MedidasPageContentProps {
  clientId: string
  clientName: string
  sastreName: string
  /** Si se proporciona, el padre puede llamar a save() y navegar después (ej. flujo nueva venta). */
  saveRef?: React.MutableRefObject<{ save: () => Promise<boolean> } | null>
  /** Nombres de tabs a ocultar (ej. ['Camisería'] o ['Americana','Pantalón','Chaleco']). */
  hideTabs?: string[]
  /** Se llama cada vez que el usuario modifica un valor. */
  onValuesChange?: () => void
  /** Se llama cuando empieza/termina un guardado (true/false). */
  onSavingChange?: (saving: boolean) => void
}

export function MedidasPageContent({ clientId, clientName, sastreName, saveRef, hideTabs, onValuesChange, onSavingChange }: MedidasPageContentProps) {
  const supabase = createClient()
  const { data: garmentTypesData, isLoading: garmentTypesLoading } = useGarmentTypes()
  const fieldRefsMap = useRef<Record<string, HTMLElement | null>>({})

  const [garmentGroups, setGarmentGroups] = useState<GarmentGroup[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [values, setValues] = useState<Record<string, string | number>>({})
  const [bodyHistorial, setBodyHistorial] = useState<any[]>([])
  const [camisaHistorial, setCamisaHistorial] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const bodyGarmentTypeId = garmentTypesData ? (garmentTypesData.find((g) => g.code === 'body')?.id ?? null) : undefined
  const camisaGarmentTypeId = garmentTypesData ? (garmentTypesData.find((g) => g.name === 'Camisería')?.id ?? null) : undefined
  const tabGarments = (garmentTypesData ?? [])
    .filter((g) => GARMENT_NAMES.includes(g.name))
    .filter((g) => !(hideTabs ?? []).includes(g.name))
    .sort((a, b) => a.sort_order - b.sort_order)
  const currentGroup = garmentGroups[activeTabIndex]
  const prefix = currentGroup ? getGarmentPrefix(currentGroup.name) : ''

  // 1. normalizeValues definido PRIMERO (evita "Cannot access before initialization")
  const normalizeValues = useCallback((raw: Record<string, any> | null | undefined): Record<string, string | number> => {
    if (!raw || typeof raw !== 'object') return {}
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => {
        if (v === null || v === undefined || v === '') return [k, '']
        const num = Number(v)
        return [k, Number.isNaN(num) ? v : num]
      })
    ) as Record<string, string | number>
  }, [])

  // 2. applyHistoryToValues: solo aplica claves del tipo de prenda del registro, sin borrar el resto
  const applyHistoryToValues = useCallback((entry: any) => {
    const code = (entry.garment_types && entry.garment_types.code) ?? ''
    const normalized = normalizeValues(entry.values)

    if (code === 'body') {
      const bodyKeys = Object.fromEntries(
        Object.entries(normalized).filter(([k]) =>
          k.startsWith('americana_') || k.startsWith('pantalon_') || k.startsWith('chaleco_')
        )
      )
      setValues((prev) => ({ ...prev, ...bodyKeys }))
    } else if (code === 'camiseria' || (entry.garment_types && entry.garment_types.name === 'Camisería')) {
      const camisaKeys: Record<string, string | number> = {}
      for (const [k, v] of Object.entries(normalized)) {
        const key = k.startsWith('camiseria_') ? k : valueKey('camiseria', k)
        camisaKeys[key] = v
      }
      setValues((prev) => ({ ...prev, ...camisaKeys }))
    } else {
      setValues((prev) => ({ ...prev, ...normalized }))
    }
  }, [normalizeValues])

  const loadMeasurements = useCallback(
    async (bodyId: string) => {
      const result = await getClientMeasurements({ clientId, garmentTypeId: bodyId })
      if (result.success && result.data && result.data.length > 0) {
        const current = result.data.find((m: any) => m.is_current) ?? result.data[0]
        setValues((prev) => ({ ...prev, ...normalizeValues(current.values) }))
        setBodyHistorial(result.data)
        setSelectedHistoryId(current.id)
      } else {
        setBodyHistorial([])
        setSelectedHistoryId(null)
      }
    },
    [clientId, normalizeValues]
  )

  const loadCamiseriaMeasurements = useCallback(
    async (camiseriaGarmentTypeId: string) => {
      const result = await getClientMeasurements({ clientId, garmentTypeId: camiseriaGarmentTypeId })
      if (result.success && result.data && result.data.length > 0) {
        const current = result.data.find((m: any) => m.is_current) ?? result.data[0]
        const raw = normalizeValues(current.values)
        const prefixed: Record<string, string | number> = {}
        for (const [k, v] of Object.entries(raw)) prefixed[valueKey('camiseria', k)] = v
        setValues((prev) => ({ ...prev, ...prefixed }))
        setCamisaHistorial(result.data)
        setSelectedHistoryId(current.id)
      } else {
        setValues((prev) => {
          const next = { ...prev }
          Object.keys(next).filter((k) => k.startsWith('camiseria_')).forEach((k) => delete next[k])
          return next
        })
        setCamisaHistorial([])
        setSelectedHistoryId(null)
      }
    },
    [clientId, normalizeValues]
  )

  // Carga inicial: garment groups (campos) desde Supabase (solo los no ocultos por hideTabs)
  useEffect(() => {
    if (!garmentTypesData || garmentTypesLoading) return
    let cancelled = false
    const groupGarments = garmentTypesData
      .filter((g) => GARMENT_NAMES.includes(g.name))
      .filter((g) => !(hideTabs ?? []).includes(g.name))
      .sort((a, b) => a.sort_order - b.sort_order)

    async function init() {
      setIsLoading(true)
      try {
        if (groupGarments.length > 0) {
          const ids = groupGarments.map((g) => g.id)
          const { data: fieldsData } = await supabase
            .from('measurement_fields')
            .select('id, garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, options')
            .in('garment_type_id', ids)
            .eq('is_active', true)
            .order('sort_order')
          if (!cancelled && fieldsData) {
            const fieldsByGarment: Record<string, MeasurementField[]> = {}
            for (const f of fieldsData as MeasurementField[]) {
              if (!fieldsByGarment[f.garment_type_id]) fieldsByGarment[f.garment_type_id] = []
              fieldsByGarment[f.garment_type_id].push(f)
            }
            setGarmentGroups(
              groupGarments.map((g) => ({
                id: g.id,
                name: g.name,
                sort_order: g.sort_order,
                fields: fieldsByGarment[g.id] ?? [],
              }))
            )
          }
        }
      } catch (err) {
        console.error('[MedidasPageContent] init error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [garmentTypesData, garmentTypesLoading, supabase, hideTabs])

  // Si activeTabIndex queda fuera de rango tras filtrar tabs, resetear a 0
  useEffect(() => {
    if (garmentGroups.length > 0 && activeTabIndex >= garmentGroups.length) {
      setActiveTabIndex(0)
    }
  }, [garmentGroups.length, activeTabIndex])

  // Carga inicial de medidas (body + camisería)
  useEffect(() => {
    if (!clientId || !bodyGarmentTypeId) return
    setHistoryLoading(true)
    const bodyPromise = getClientMeasurements({ clientId, garmentTypeId: bodyGarmentTypeId }).then((result: any) => {
      if (result?.success && result?.data?.length > 0) {
        const current = result.data.find((m: any) => m.is_current) ?? result.data[0]
        console.log('[DEBUG] current.values:', JSON.stringify(current.values))
        console.log('[DEBUG] normalized:', JSON.stringify(normalizeValues(current.values)))
        setValues((prev) => ({ ...prev, ...normalizeValues(current.values) }))
        setTimeout(() => {
          console.log('[DEBUG] values en estado tras setValues:', JSON.stringify(values))
        }, 500)
        setBodyHistorial(result.data)
        setSelectedHistoryId((id) => id ?? current.id)
      } else {
        setBodyHistorial([])
      }
    })
    const camisaPromise = camisaGarmentTypeId
      ? getClientMeasurements({ clientId, garmentTypeId: camisaGarmentTypeId }).then((result: any) => {
          if (result?.success && result?.data?.length > 0) {
            const current = result.data.find((m: any) => m.is_current) ?? result.data[0]
            const raw = normalizeValues(current.values)
            const prefixed: Record<string, string | number> = {}
            for (const [k, v] of Object.entries(raw)) prefixed[valueKey('camiseria', k)] = v
            setValues((prev) => ({ ...prev, ...prefixed }))
            setCamisaHistorial(result.data)
          } else {
            setCamisaHistorial([])
          }
        })
      : Promise.resolve()
    Promise.all([bodyPromise, camisaPromise]).finally(() => setHistoryLoading(false))
  }, [clientId, bodyGarmentTypeId, camisaGarmentTypeId, normalizeValues])

  useEffect(() => {
    if (currentGroup?.name === 'Camisería') loadCamiseriaMeasurements(currentGroup.id)
  }, [currentGroup?.id, currentGroup?.name, loadCamiseriaMeasurements])

  const setValue = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }))
    onValuesChange?.()
  }, [onValuesChange])

  const handleSave = async (): Promise<boolean> => {
    if (!bodyGarmentTypeId) return false
    setIsSaving(true)
    onSavingChange?.(true)
    try {
      if (currentGroup?.name === 'Camisería') {
        const camiseriaValues: Record<string, string> = {}
        for (const f of currentGroup.fields) {
          camiseriaValues[f.code] = String(values[valueKey('camiseria', f.code)] ?? '')
        }
        const result = await saveBodyMeasurements({
          client_id: clientId,
          garment_type_id: currentGroup.id,
          values: camiseriaValues,
        })
        if (!result.success) {
          toast.error((result as { error?: string }).error ?? 'Error al guardar')
          return false
        }
        toast.success('Medidas de camisería guardadas')
        await loadCamiseriaMeasurements(currentGroup.id)
        return true
      } else {
        // Guardar todas las claves body del estado (americana_, pantalon_, chaleco_)
        const fullValues: Record<string, string> = {}
        for (const [k, v] of Object.entries(values)) {
          if (
            k.startsWith('americana_') ||
            k.startsWith('pantalon_') ||
            k.startsWith('chaleco_')
          ) {
            if (v !== '' && v !== null && v !== undefined) {
              fullValues[k] = String(v)
            }
          }
        }
        const result = await saveBodyMeasurements({
          client_id: clientId,
          garment_type_id: bodyGarmentTypeId,
          values: fullValues,
        })
        if (!result.success) {
          toast.error((result as { error?: string }).error ?? 'Error al guardar')
          return false
        }
        toast.success('Medidas guardadas correctamente')
        await loadMeasurements(bodyGarmentTypeId)
        return true
      }
    } finally {
      setIsSaving(false)
      onSavingChange?.(false)
    }
  }

  if (saveRef) saveRef.current = { save: handleSave }

  if (garmentTypesLoading || !garmentTypesData) {
    return (
      <div
        className="flex flex-col flex-1"
        style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
      >
        <SastreHeader sastreName={sastreName} sectionTitle="Medidas" backHref={`/sastre/clientes/${clientId}`} />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] p-8 flex items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-[#c9a96e] shrink-0" />
            <span className="text-white/80">Cargando...</span>
          </div>
        </main>
      </div>
    )
  }

  if (bodyGarmentTypeId === null) {
    return (
      <div
        className="flex flex-col flex-1"
        style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
      >
        <SastreHeader sastreName={sastreName} sectionTitle="Medidas" backHref={`/sastre/clientes/${clientId}`} />
        <main className="flex-1 p-6">
          <div className="max-w-xl mx-auto rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] p-6 flex items-start gap-4">
            <AlertCircle className="h-8 w-8 text-[#c9a96e] shrink-0 mt-0.5" />
            <div>
              <p className="font-serif text-lg text-white">Falta el tipo de medidas</p>
              <p className="text-white/70 text-sm mt-1">
                Configura el tipo de prenda con código <strong>body</strong> en Configuración para poder guardar medidas.
              </p>
            </div>
          </div>
        </main>
        <footer className="py-4 text-center shrink-0">
          <p className="text-xs text-white/20 tracking-widest">SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026</p>
        </footer>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col min-h-0 flex-1"
      style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
    >
      <SastreHeader
        sastreName={sastreName}
        sectionTitle={`Medidas · ${clientName}`}
        backHref={`/sastre/clientes/${clientId}`}
      />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 gap-4">
        {/* ÚNICO contenedor con scroll (iPad: dedo, sin barra visible) */}
        <div
          tabIndex={0}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-hide-touch"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          <div className="flex flex-col gap-4">
          {/* Tabs prenda */}
          <div className="flex gap-2 flex-wrap">
            {tabGarments.map((g, i) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveTabIndex(i)}
                className={`px-5 h-12 rounded-xl font-serif text-lg transition-all touch-manipulation ${
                  i === activeTabIndex
                    ? 'bg-transparent text-white font-medium border-2 border-white/70'
                    : 'bg-transparent border border-[#c9a96e]/40 text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex-1 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] flex items-center justify-center min-h-[200px]">
              <Loader2 className="h-8 w-8 animate-spin text-[#c9a96e]" />
            </div>
          ) : (
            <div className="flex-1 space-y-6 pr-1 min-h-0">
              {currentGroup &&
                (currentGroup.name === 'Camisería' ? (
                  <>
                    {/* Solo medidas físicas (field_group === 'medidas', number/decimal) */}
                    <div>
                      <h3 className="text-sm font-medium text-[#c9a96e] uppercase tracking-wide mb-3">Medidas</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {(currentGroup.fields.filter(
                          (f) =>
                            f.field_group === 'medidas' &&
                            (f.field_type === 'number' || f.field_type === 'decimal')
                        ) as MeasurementField[]).map((f) => {
                          const vKey = valueKey('camiseria', f.code)
                          return (
                            <div key={f.id} className="space-y-1">
                              <label className="block text-sm text-white/80">{f.name}</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={String(values[vKey] ?? '')}
                                  onChange={(e) => setValue(vKey, e.target.value)}
                                  className="flex-1 h-12 px-4 rounded-xl border border-[#c9a96e]/20 bg-[#1a2744] text-white placeholder:text-white/40 focus:outline-none focus:border-[#c9a96e]/60"
                                  placeholder="—"
                                />
                                <span className="text-white/50 text-sm w-8 shrink-0">cm</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {/* Imprimir ficha */}
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/10"
                        onClick={() => generateCamiseriaFichaPdf({ clientName, values: values, prefix: 'camiseria' })}
                      >
                        <Printer className="h-4 w-4" />
                        Imprimir ficha
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {(() => {
                      const groupPrefix = getGarmentPrefix(currentGroup.name)
                      // Solo campos de medidas físicas (no configuración ni características)
                      const measurementFields = currentGroup.fields.filter((f) => {
                        const group = (f.field_group || '').toLowerCase()
                        const isConfigGroup =
                          group.includes('config') ||
                          group.includes('caracteristic') ||
                          group.includes('opcion') ||
                          group.includes('acabado')
                        return (
                          (f.field_type === 'number' || f.field_type === 'decimal') && !isConfigGroup
                        )
                      })
                      const byGroup: Record<string, MeasurementField[]> = {}
                      for (const f of measurementFields) {
                        const key = f.field_group || '__default__'
                        if (!byGroup[key]) byGroup[key] = []
                        byGroup[key].push(f)
                      }
                      console.log('[DEBUG] measurementFields para', currentGroup?.name, ':', measurementFields?.map((f) => ({ code: f.code, vKey: valueKey(groupPrefix, f.code) })))
                      console.log('[DEBUG] values actuales:', JSON.stringify(values))
                      return Object.entries(byGroup).map(([groupName, groupFields]) => (
                        <div key={groupName}>
                          {groupName !== '__default__' && (
                            <h3 className="text-sm font-medium text-[#c9a96e] uppercase tracking-wide mb-3">{groupName}</h3>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {groupFields.map((f) => {
                              const vKey = valueKey(groupPrefix, f.code)
                              const unit = (f.unit || 'cm').toLowerCase()
                              return (
                                <div
                                  key={f.id}
                                  ref={(el) => {
                                    fieldRefsMap.current[f.code] = el
                                  }}
                                  className="space-y-1"
                                >
                                  <label className="block text-sm text-white/80">{f.name}</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type={f.field_type === 'number' ? 'number' : 'text'}
                                      step={f.field_type === 'number' ? '0.5' : undefined}
                                      value={String(values[vKey] ?? '')}
                                      onChange={(e) => setValue(vKey, e.target.value)}
                                      className="flex-1 h-12 px-4 rounded-xl border border-[#c9a96e]/20 bg-[#1a2744] text-white placeholder:text-white/40 focus:outline-none focus:border-[#c9a96e]/60 transition-colors touch-manipulation"
                                      placeholder="—"
                                    />
                                    <span className="text-white/50 text-sm w-8 shrink-0">{unit}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    })()}
                  </>
                ))}
            </div>
          )}

          {/* Historial de medidas */}
          <div className="shrink-0 border-t border-[#c9a96e]/20 pt-4 mt-4">
            <h3 className="text-sm font-medium text-[#c9a96e] flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" />
              Historial
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-2 min-h-[76px] scrollbar-hide-touch" style={{ WebkitOverflowScrolling: 'touch' as const }}>
              {historyLoading ? (
                <div className="flex items-center gap-2 text-white/50 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  Cargando historial…
                </div>
              ) : (() => {
                const displayedHistory = currentGroup?.name === 'Camisería' ? camisaHistorial : bodyHistorial
                if (displayedHistory.length === 0) {
                  return <p className="text-white/50 text-sm">Sin versiones anteriores.</p>
                }
                return displayedHistory.slice(0, 10).map((m: any) => {
                  const version = m.version != null ? String(m.version) : '—'
                  const dateStr = formatDateTime(m.taken_at || m.created_at)
                  const garmentName = (m.garment_types && typeof m.garment_types === 'object' && m.garment_types.name) ? String(m.garment_types.name) : '—'
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        applyHistoryToValues(m)
                        setSelectedHistoryId(m.id)
                      }}
                      className={`shrink-0 w-36 p-3 rounded-xl border text-left text-sm transition-all touch-manipulation hover:border-[#c9a96e]/50 ${
                        selectedHistoryId === m.id
                          ? 'border-[#c9a96e] bg-[#c9a96e]/10'
                          : 'border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629]'
                      }`}
                    >
                      <p className="text-white font-medium">v{version}</p>
                      <p className="text-white/60 text-xs mt-0.5 truncate">{dateStr}</p>
                      <p className="text-white/40 text-xs mt-0.5 truncate" title={garmentName}>{garmentName}</p>
                    </button>
                  )
                })
              })()}
            </div>
          </div>

          {/* Acciones: Nuevas medidas y Guardar */}
          <div className="flex gap-3 shrink-0 pt-2">
            <button
              type="button"
              onClick={() => {
                setValues({})
                setSelectedHistoryId(null)
                toast.success('Formulario listo para medidas nuevas. Rellena los campos y guarda.')
              }}
              className="flex-1 h-12 rounded-xl bg-transparent border-2 border-[#c9a96e]/60 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/10 transition-colors flex items-center justify-center gap-2 touch-manipulation"
            >
              <PlusCircle className="h-5 w-5" />
              Nuevas medidas
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-12 rounded-xl bg-transparent border-2 border-white/60 text-white font-medium hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation"
            >
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Guardar medidas
            </button>
          </div>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center shrink-0">
        <p className="text-xs text-white/20 tracking-widest">
          SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
        </p>
      </footer>
    </div>
  )
}
