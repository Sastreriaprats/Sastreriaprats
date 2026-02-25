'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGarmentTypes } from '@/hooks/use-cached-queries'
import { saveBodyMeasurements, getClientMeasurements } from '@/actions/clients'
import { SastreHeader } from '../../../components/sastre-header'
import { Loader2, Save, Clock, AlertCircle, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'

const GARMENT_NAMES = ['Americana', 'Pantalón', 'Chaleco']
/** Índice tab → zona silueta: 0=americana, 1=pantalon, 2=chaleco */
const TAB_TO_ZONE = ['americana', 'pantalon', 'chaleco'] as const

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
}

export function MedidasPageContent({ clientId, clientName, sastreName }: MedidasPageContentProps) {
  const supabase = createClient()
  const { data: garmentTypesData, isLoading: garmentTypesLoading } = useGarmentTypes()
  const fieldRefsMap = useRef<Record<string, HTMLElement | null>>({})

  const [garmentGroups, setGarmentGroups] = useState<GarmentGroup[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const bodyGarmentTypeId = garmentTypesData ? (garmentTypesData.find((g) => g.code === 'body')?.id ?? null) : undefined
  const tabGarments = (garmentTypesData ?? []).filter((g) => GARMENT_NAMES.includes(g.name)).sort((a, b) => a.sort_order - b.sort_order)
  const currentGroup = garmentGroups[activeTabIndex]
  const prefix = currentGroup ? getGarmentPrefix(currentGroup.name) : ''

  const normalizeValues = useCallback((raw: Record<string, unknown> | null | undefined): Record<string, string> => {
    if (!raw) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      out[k] = v == null ? '' : String(v)
    }
    return out
  }, [])

  const loadMeasurements = useCallback(
    async (bodyId: string) => {
      const result = await getClientMeasurements({ clientId, garmentTypeId: bodyId })
      if (result.success && result.data && result.data.length > 0) {
        const current = result.data.find((m: any) => m.is_current) ?? result.data[0]
        setValues(normalizeValues(current.values))
        setSelectedHistoryId(current.id)
      } else {
        setValues({})
        setSelectedHistoryId(null)
      }
    },
    [clientId, normalizeValues]
  )

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const result = await getClientMeasurements({ clientId })
      if (result.success && result.data && Array.isArray(result.data)) {
        setHistory(result.data)
      } else {
        setHistory([])
      }
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    if (!garmentTypesData || garmentTypesLoading) return
    let cancelled = false
    const groupGarments = garmentTypesData
      .filter((g) => GARMENT_NAMES.includes(g.name))
      .sort((a, b) => a.sort_order - b.sort_order)
    const bodyId = garmentTypesData.find((g) => g.code === 'body')?.id ?? null

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
        if (!cancelled && bodyId) await loadMeasurements(bodyId)
      } catch (err) {
        console.error('[MedidasPageContent] init error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [garmentTypesData, garmentTypesLoading, supabase, loadMeasurements])

  useEffect(() => {
    if (clientId) loadHistory()
  }, [clientId, loadHistory])

  const setValue = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }))
  }, [])

  const handleSave = async () => {
    if (!bodyGarmentTypeId) return
    setIsSaving(true)
    try {
      // Enviar todas las claves que define el formulario (Americana, Chaleco, Pantalón)
      // para que en admin no falten apartados como CUERPO aunque no se hayan tocado en sastre
      const fullValues: Record<string, string> = {}
      for (const g of garmentGroups) {
        const p = getGarmentPrefix(g.name)
        for (const f of g.fields) {
          const vKey = valueKey(p, f.code)
          fullValues[vKey] = values[vKey] ?? ''
        }
      }
      const result = await saveBodyMeasurements({
        client_id: clientId,
        garment_type_id: bodyGarmentTypeId,
        values: fullValues,
      })
      if (!result.success) {
        toast.error((result as { error?: string }).error ?? 'Error al guardar')
        return
      }
      toast.success('Medidas guardadas correctamente')
      await loadMeasurements(bodyGarmentTypeId)
    } finally {
      setIsSaving(false)
    }
  }

  if (garmentTypesLoading || !garmentTypesData) {
    return (
      <div
        className="min-h-screen flex flex-col"
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
        className="min-h-screen flex flex-col"
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
        <footer className="py-6 text-center shrink-0">
          <p className="text-xs text-white/20 tracking-widest">SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026</p>
        </footer>
      </div>
    )
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
    >
      <SastreHeader
        sastreName={sastreName}
        sectionTitle={`Medidas · ${clientName}`}
        backHref={`/sastre/clientes/${clientId}`}
      />
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-hidden">
        {/* Silueta: imagen SVG + zonas interactivas superpuestas */}
        <div className="lg:w-[320px] shrink-0 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] p-4 flex items-center justify-center min-h-[320px] lg:min-h-0">
          <div className="w-full relative" style={{ maxHeight: '580px', aspectRatio: '200/580' }}>
            <img
              src="/images/sastre-silhouette.png"
              alt="A little bigger"
              className="w-full h-full object-contain rounded-lg"
              style={{ opacity: 0.97 }}
            />
          </div>
        </div>

        {/* Formulario derecha: solo esta columna hace scroll */}
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto">
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
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              {currentGroup &&
                (() => {
                  const groupPrefix = getGarmentPrefix(currentGroup.name)
                  const byGroup: Record<string, MeasurementField[]> = {}
                  for (const f of currentGroup.fields) {
                    const key = f.field_group || '__default__'
                    if (!byGroup[key]) byGroup[key] = []
                    byGroup[key].push(f)
                  }
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
                                  value={values[vKey] ?? ''}
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
            </div>
          )}

          {/* Historial de medidas (todas las prendas) */}
          <div className="shrink-0 border-t border-[#c9a96e]/20 pt-4">
            <h3 className="text-sm font-medium text-[#c9a96e] flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" />
              Historial
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-2 min-h-[72px]">
              {historyLoading ? (
                <div className="flex items-center gap-2 text-white/50 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  Cargando historial…
                </div>
              ) : history.length === 0 ? (
                <p className="text-white/50 text-sm">Sin versiones anteriores.</p>
              ) : (
                history.slice(0, 5).map((m: any) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setValues(normalizeValues(m.values))
                      setSelectedHistoryId(m.id)
                    }}
                    className={`shrink-0 w-40 p-3 rounded-xl border text-left text-sm transition-all touch-manipulation hover:border-[#c9a96e]/50 ${
                      selectedHistoryId === m.id
                        ? 'border-[#c9a96e] bg-[#c9a96e]/10'
                        : 'border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629]'
                    }`}
                  >
                    <p className="text-white font-medium">v{m.version ?? '—'}</p>
                    <p className="text-white/60 text-xs mt-0.5">{formatDateTime(m.taken_at || m.created_at)}</p>
                    {m.garment_types?.name && (
                      <p className="text-white/40 text-xs mt-0.5 truncate">{m.garment_types.name}</p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Nuevas medidas + Guardar */}
          <div className="flex gap-3 shrink-0">
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
      </main>

      <footer className="py-6 text-center shrink-0">
        <p className="text-xs text-white/20 tracking-widest">
          SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
        </p>
      </footer>
    </div>
  )
}
