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

// Camisería y camisería industrial comparten el mismo registro de medidas:
// el sastre toma UNA vez las medidas de camisa del cliente y se usan en ambos
// tipos de pedido. Por eso aquí solo exponemos un único tab "Camisería".
const GARMENT_NAMES = ['Americana', 'Pantalón', 'Chaleco', 'Camisería', 'Abrigo', 'Levita', 'Frac']
/** Índice tab → zona silueta: 0=americana, 1=pantalon, 2=chaleco, 3=frac, 4=abrigo, 5=camiseria */
const TAB_TO_ZONE = ['americana', 'pantalon', 'chaleco', 'frac', 'abrigo', 'camiseria'] as const

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
  /** Si true, no se usa scroll interno; el padre debe tener overflow-y-auto (para que la rueda del ratón funcione). */
  embedScroll?: boolean
  /** Nombres de tabs a ocultar (ej. ['Camisería'] o ['Americana','Pantalón','Chaleco']). */
  hideTabs?: string[]
  /** Se llama cada vez que el usuario modifica un valor. */
  onValuesChange?: () => void
  /** Se llama cuando empieza/termina un guardado (true/false). */
  onSavingChange?: (saving: boolean) => void
}

export function MedidasPageContent({ clientId, clientName, sastreName, saveRef, hideTabs, onValuesChange, onSavingChange, embedScroll }: MedidasPageContentProps) {
  const supabase = createClient()
  const { data: garmentTypesData, isLoading: garmentTypesLoading } = useGarmentTypes()
  const fieldRefsMap = useRef<Record<string, HTMLElement | null>>({})
  // Snapshots (por código, sin prefijo) de lo último cargado/guardado para cada
  // registro. Permiten que handleSave detecte qué tab cambió y guarde TODOS los
  // registros tocados (body + camisería), no solo el de la pestaña activa.
  const loadedBodyRef = useRef<Record<string, string>>({})
  const loadedCamisaRef = useRef<Record<string, string>>({})

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

  // 1.b stringifyValues: convierte un registro a {clave: string} (sin tocar
  //     prefijos). Se usa para los snapshots de comparación de handleSave.
  const stringifyValues = useCallback((raw: Record<string, any> | null | undefined): Record<string, string> => {
    if (!raw || typeof raw !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) out[k] = v == null ? '' : String(v)
    return out
  }, [])

  // 2. applyHistoryToValues: solo aplica claves del tipo de prenda del registro, sin borrar el resto
  const applyHistoryToValues = useCallback((entry: any) => {
    const code = (entry.garment_types && entry.garment_types.code) ?? ''
    const normalized = normalizeValues(entry.values)

    if (code === 'body') {
      const bodyKeys = Object.fromEntries(
        Object.entries(normalized).filter(([k]) =>
          k.startsWith('americana_') || k.startsWith('pantalon_') || k.startsWith('chaleco_') ||
          k.startsWith('frac_') || k.startsWith('abrigo_') || k.startsWith('levita_')
        )
      )
      setValues((prev) => ({ ...prev, ...bodyKeys }))
    } else if (code === 'camiseria' || code === 'camiseria_industrial' || (entry.garment_types && (entry.garment_types.name === 'Camisería' || entry.garment_types.name === 'Camisería Industrial'))) {
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
        loadedBodyRef.current = stringifyValues(current.values)
        setBodyHistorial(result.data)
        setSelectedHistoryId(current.id)
      } else {
        loadedBodyRef.current = {}
        setBodyHistorial([])
        setSelectedHistoryId(null)
      }
    },
    [clientId, normalizeValues, stringifyValues]
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
        loadedCamisaRef.current = stringifyValues(current.values)
        setCamisaHistorial(result.data)
        setSelectedHistoryId(current.id)
      } else {
        setValues((prev) => {
          const next = { ...prev }
          Object.keys(next).filter((k) => k.startsWith('camiseria_')).forEach((k) => delete next[k])
          return next
        })
        loadedCamisaRef.current = {}
        setCamisaHistorial([])
        setSelectedHistoryId(null)
      }
    },
    [clientId, normalizeValues, stringifyValues]
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
        setValues((prev) => ({ ...prev, ...normalizeValues(current.values) }))
        loadedBodyRef.current = stringifyValues(current.values)
        setBodyHistorial(result.data)
        setSelectedHistoryId((id) => id ?? current.id)
      } else {
        loadedBodyRef.current = {}
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
            loadedCamisaRef.current = stringifyValues(current.values)
            setCamisaHistorial(result.data)
          } else {
            loadedCamisaRef.current = {}
            setCamisaHistorial([])
          }
        })
      : Promise.resolve()
    Promise.all([bodyPromise, camisaPromise]).finally(() => setHistoryLoading(false))
  }, [clientId, bodyGarmentTypeId, camisaGarmentTypeId, normalizeValues, stringifyValues])

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
      const activeIsCamisa = currentGroup?.name === 'Camisería'
      const camisaGroup = garmentGroups.find((g) => g.name === 'Camisería')

      // ── Registro body: todas las claves de prenda en estado (americana_,
      //    pantalon_, chaleco_, frac_, abrigo_, levita_).
      const bodyPayload: Record<string, string> = {}
      for (const [k, v] of Object.entries(values)) {
        if (
          (k.startsWith('americana_') || k.startsWith('pantalon_') || k.startsWith('chaleco_') ||
           k.startsWith('frac_') || k.startsWith('abrigo_') || k.startsWith('levita_')) &&
          v !== '' && v !== null && v !== undefined
        ) {
          bodyPayload[k] = String(v)
        }
      }
      const bodyChanged = JSON.stringify(bodyPayload) !== JSON.stringify(loadedBodyRef.current)

      // ── Registro camisería: esta pantalla solo edita las medidas físicas y
      //    la talla. El resto de claves del registro (características, puño,
      //    iniciales…, normalmente fijadas desde la ficha del pedido) se
      //    PRESERVAN para no borrarlas al guardar desde aquí.
      let camisaSavePayload: Record<string, string> | null = null
      let camisaChanged = false
      if (camisaGroup) {
        const editableCodes = camisaGroup.fields
          .filter((f) => f.field_group === 'medidas' && (f.field_type === 'number' || f.field_type === 'decimal'))
          .map((f) => f.code)
        const edited: Record<string, string> = {}
        for (const code of editableCodes) edited[code] = String(values[valueKey('camiseria', code)] ?? '')
        const tallaVal = values[valueKey('camiseria', 'talla')]
        edited.talla = tallaVal !== undefined ? String(tallaVal) : String(loadedCamisaRef.current.talla ?? '')
        camisaChanged = [...editableCodes, 'talla'].some(
          (code) => String(edited[code] ?? '') !== String(loadedCamisaRef.current[code] ?? '')
        )
        camisaSavePayload = { ...loadedCamisaRef.current, ...edited }
      }

      // Guardamos SIEMPRE el registro de la pestaña activa y, además,
      // CUALQUIER otro registro que el usuario haya modificado en esta
      // sesión. Antes solo se guardaba el tab activo, por lo que las medidas
      // de camisería se perdían si el sastre cambiaba de pestaña antes de
      // guardar (el resto de prendas comparten el registro body y por eso sí
      // se conservaban).
      const shouldSaveCamisa = camisaGroup != null && camisaSavePayload != null && (activeIsCamisa || camisaChanged)
      const shouldSaveBody = activeIsCamisa ? bodyChanged : true

      if (shouldSaveCamisa && camisaGroup && camisaSavePayload) {
        const result = await saveBodyMeasurements({
          client_id: clientId,
          garment_type_id: camisaGroup.id,
          values: camisaSavePayload,
        })
        if (!result.success) {
          toast.error((result as { error?: string }).error ?? 'Error al guardar')
          return false
        }
      }
      if (shouldSaveBody) {
        const result = await saveBodyMeasurements({
          client_id: clientId,
          garment_type_id: bodyGarmentTypeId,
          values: bodyPayload,
        })
        if (!result.success) {
          toast.error((result as { error?: string }).error ?? 'Error al guardar')
          return false
        }
      }

      if (!shouldSaveBody && !shouldSaveCamisa) return true // sin cambios

      toast.success(
        activeIsCamisa && !shouldSaveBody ? 'Medidas de camisería guardadas' : 'Medidas guardadas correctamente'
      )
      if (shouldSaveCamisa && camisaGroup) await loadCamiseriaMeasurements(camisaGroup.id)
      if (shouldSaveBody) await loadMeasurements(bodyGarmentTypeId)
      return true
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
      className={embedScroll ? 'flex flex-col' : 'flex flex-col min-h-0 flex-1'}
      style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
    >
      <SastreHeader
        sastreName={sastreName}
        sectionTitle={`Medidas · ${clientName}`}
        backHref={`/sastre/clientes/${clientId}`}
      />
      <main className={`flex-1 flex flex-col min-h-0 p-6 gap-4 ${embedScroll ? 'overflow-visible' : 'overflow-hidden'}`}>
        {/* Contenedor con scroll (o sin overflow si embedScroll: el padre hace el scroll) */}
        <div
          tabIndex={embedScroll ? undefined : 0}
          className={embedScroll ? 'flex flex-col gap-4' : 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain flex flex-col gap-4'}
          style={embedScroll ? undefined : { WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex flex-col gap-4">
          {/* Tabs prenda */}
          <div className="flex gap-2 flex-wrap">
            {tabGarments.map((g, i) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveTabIndex(i)}
                className={`px-6 h-11 rounded-xl text-sm font-medium tracking-wide transition-all touch-manipulation ${
                  i === activeTabIndex
                    ? 'bg-[#c9a96e] text-[#0a1020] shadow-lg shadow-[#c9a96e]/20'
                    : 'bg-white/[0.05] border border-white/15 text-white/60 hover:bg-white/10 hover:text-white'
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
                    {/* Talla del cliente para camisería */}
                    <div className="flex items-end gap-3 mb-4">
                      <div className="space-y-1 w-40">
                        <label className="block text-sm font-medium text-white/90">Talla</label>
                        <input
                          type="text"
                          value={String(values[valueKey('camiseria', 'talla')] ?? '')}
                          onChange={(e) => setValue(valueKey('camiseria', 'talla'), e.target.value)}
                          className="w-full h-12 px-4 rounded-xl border border-white/20 bg-white/[0.07] text-white text-lg font-medium placeholder:text-white/30 focus:outline-none focus:border-[#c9a96e] focus:ring-1 focus:ring-[#c9a96e]/30 transition-all"
                          placeholder="40, 42, M…"
                        />
                      </div>
                    </div>
                    {/* Solo medidas físicas (field_group === 'medidas', number/decimal) */}
                    <div>
                      <h3 className="text-xs font-semibold text-[#c9a96e] uppercase tracking-[0.2em] mb-4 pb-2 border-b border-[#c9a96e]/15">Medidas</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                        {(currentGroup.fields.filter(
                          (f) =>
                            f.field_group === 'medidas' &&
                            (f.field_type === 'number' || f.field_type === 'decimal')
                        ) as MeasurementField[]).map((f) => {
                          const vKey = valueKey('camiseria', f.code)
                          return (
                            <div key={f.id} className="space-y-1">
                              <label className="block text-sm font-medium text-white/90">{f.name}</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  inputMode="text"
                                  value={String(values[vKey] ?? '')}
                                  onChange={(e) => setValue(vKey, e.target.value.replace(',', '.'))}
                                  className="flex-1 h-12 px-4 rounded-xl border border-white/20 bg-white/[0.07] text-white text-lg font-medium placeholder:text-white/30 focus:outline-none focus:border-[#c9a96e] focus:ring-1 focus:ring-[#c9a96e]/30 transition-all"
                                  placeholder="—"
                                />
                                <span className="text-white/30 text-xs w-8 shrink-0">cm</span>
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
                        className="gap-2 bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 transition-all"
                        onClick={() => generateCamiseriaFichaPdf({ clientName, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])), prefix: 'camiseria' })}
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
                      const tallaKey = valueKey(groupPrefix, 'talla')
                      return (
                        <div className="flex items-end gap-3">
                          <div className="space-y-1 w-40">
                            <label className="block text-sm font-medium text-white/90">Talla</label>
                            <input
                              type="text"
                              value={String(values[tallaKey] ?? '')}
                              onChange={(e) => setValue(tallaKey, e.target.value)}
                              className="w-full h-12 px-4 rounded-xl border border-white/20 bg-white/[0.07] text-white text-lg font-medium placeholder:text-white/30 focus:outline-none focus:border-[#c9a96e] focus:ring-1 focus:ring-[#c9a96e]/30 transition-all"
                              placeholder="50, 52C, M…"
                            />
                          </div>
                        </div>
                      )
                    })()}
                    {(() => {
                      const groupPrefix = getGarmentPrefix(currentGroup.name)
                      // Mostramos los campos numéricos de medidas físicas y los
                      // del grupo "Configuración" (medidas técnicas que también
                      // se versionan por cliente). Se excluyen otros grupos
                      // legacy (características/opciones/acabados) si existieran.
                      const isConfigField = (f: MeasurementField) =>
                        (f.field_group || '').toLowerCase().includes('config')
                      const visibleFields = currentGroup.fields.filter((f) => {
                        const group = (f.field_group || '').toLowerCase()
                        const isOtherLegacyGroup =
                          !isConfigField(f) && (
                            group.includes('caracteristic') ||
                            group.includes('opcion') ||
                            group.includes('acabado')
                          )
                        if (isOtherLegacyGroup) return false
                        if (isConfigField(f)) {
                          // En Configuración aceptamos numéricos y booleanos.
                          return f.field_type === 'number' || f.field_type === 'decimal' || f.field_type === 'boolean'
                        }
                        return f.field_type === 'number' || f.field_type === 'decimal'
                      })
                      // Ordena: primero "medidas" (y grupos no-config) y al
                      // final el bloque Configuración.
                      const byGroup: Record<string, MeasurementField[]> = {}
                      for (const f of visibleFields) {
                        const key = isConfigField(f) ? 'Configuración técnica' : (f.field_group || '__default__')
                        if (!byGroup[key]) byGroup[key] = []
                        byGroup[key].push(f)
                      }
                      const groupEntries = Object.entries(byGroup).sort(([a], [b]) => {
                        if (a === 'Configuración técnica') return 1
                        if (b === 'Configuración técnica') return -1
                        return 0
                      })
                      return groupEntries.map(([groupName, groupFields]) => (
                        <div key={groupName}>
                          {groupName !== '__default__' && (
                            <h3 className="text-xs font-semibold text-[#c9a96e] uppercase tracking-[0.2em] mb-4 pb-2 border-b border-[#c9a96e]/15">{groupName}</h3>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            {groupFields.map((f) => {
                              const vKey = valueKey(groupPrefix, f.code)
                              const unit = (f.unit || 'cm').toLowerCase()
                              if (f.field_type === 'boolean') {
                                const checked = String(values[vKey] ?? '') === 'true'
                                return (
                                  <div key={f.id} className="space-y-1">
                                    <label className="flex items-center gap-3 h-12 px-4 rounded-xl border border-white/20 bg-white/[0.07] cursor-pointer touch-manipulation">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => setValue(vKey, e.target.checked ? 'true' : '')}
                                        className="h-5 w-5 accent-[#c9a96e]"
                                      />
                                      <span className="text-white/90 text-base font-medium">{f.name}</span>
                                    </label>
                                  </div>
                                )
                              }
                              return (
                                <div
                                  key={f.id}
                                  ref={(el) => {
                                    fieldRefsMap.current[f.code] = el
                                  }}
                                  className="space-y-1"
                                >
                                  <label className="block text-sm font-medium text-white/90">{f.name}</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      inputMode="text"
                                      value={String(values[vKey] ?? '')}
                                      onChange={(e) => setValue(vKey, e.target.value.replace(',', '.'))}
                                      className="flex-1 h-12 px-4 rounded-xl border border-white/20 bg-white/[0.07] text-white text-lg font-medium placeholder:text-white/30 focus:outline-none focus:border-[#c9a96e] focus:ring-1 focus:ring-[#c9a96e]/30 transition-all touch-manipulation"
                                      placeholder="—"
                                    />
                                    <span className="text-white/30 text-xs w-8 shrink-0">{unit}</span>
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
            <h3 className="text-xs font-semibold text-[#c9a96e] uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
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
                          ? 'border-[#c9a96e] bg-[#c9a96e]/15 shadow-md shadow-[#c9a96e]/10'
                          : 'border-white/10 bg-white/[0.04]'
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
              className="flex-1 h-12 rounded-xl bg-white/[0.05] border border-white/15 text-white/70 font-medium hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2 touch-manipulation"
            >
              <PlusCircle className="h-5 w-5" />
              Nuevas medidas
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-12 rounded-xl bg-[#c9a96e] text-[#0a1020] font-semibold hover:bg-[#c9a96e]/90 shadow-lg shadow-[#c9a96e]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation"
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
