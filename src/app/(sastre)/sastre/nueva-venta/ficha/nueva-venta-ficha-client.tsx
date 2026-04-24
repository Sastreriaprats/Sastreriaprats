'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createFichaOrder, searchComplementProducts, getOrder, getNextTalonNumber } from '@/actions/orders'
import { getClient, getClientMeasurements } from '@/actions/clients'
import { listActiveFabricsForFicha } from '@/actions/fabrics'
import { NuevaVentaSteps } from '../nueva-venta-steps'
import { generateFichaConfeccionPDF, generateFichaForLine } from '@/lib/pdf/ficha-confeccion'
import { toast } from 'sonner'
import { getOrderStatusLabel } from '@/lib/utils'
import { FichaPantalonConfig } from './components/ficha-pantalon-config'
import { FichaChalecoConfig } from './components/ficha-chaleco-config'
import { FichaAmericanaConfig } from './components/ficha-americana-config'
import { FichaCamisaSection, type CamisaItem } from './components/ficha-camisa-section'
import { FichaComplementosSection, type ComplementoItem, type ComplementResult } from './components/ficha-complementos-section'
import { FichaResumenSection } from './components/ficha-resumen-section'

const PRENDA_LABELS: Record<string, string> = {
  traje_2_piezas: 'Traje',
  traje_3_piezas: 'Traje con chaleco',
  americana_sola: 'Americana sola',
  americana: 'Americana',
  teba: 'Teba / Sport',
  abrigo: 'Abrigo',
  smoking: 'Smoking',
  chaque: 'Chaqué',
  frac: 'Frac',
  pantalon_solo: 'Pantalón solo',
  pantalon: 'Pantalón',
  chaleco_solo: 'Chaleco solo',
  chaleco: 'Chaleco',
  gabardina: 'Gabardina',
  camisa: 'Camisa',
  camiseria: 'Camisería',
  camiseria_industrial: 'Camisería Industrial',
}

function getPrendasFromSlug(prenda: string): Array<{ slug: string; label: string }> {
  const map: Record<string, Array<{ slug: string; label: string }>> = {
    traje_2_piezas: [{ slug: 'americana', label: 'Americana' }, { slug: 'pantalon', label: 'Pantalón' }],
    traje_3_piezas: [{ slug: 'americana', label: 'Americana' }, { slug: 'pantalon', label: 'Pantalón' }, { slug: 'chaleco', label: 'Chaleco' }],
    americana_sola: [{ slug: 'americana', label: 'Americana' }],
    pantalon_solo: [{ slug: 'pantalon', label: 'Pantalón' }],
    chaleco_solo: [{ slug: 'chaleco', label: 'Chaleco' }],
    teba: [{ slug: 'teba', label: 'Teba' }],
    smoking: [{ slug: 'americana', label: 'Americana' }, { slug: 'pantalon', label: 'Pantalón' }],
    chaque: [{ slug: 'chaque', label: 'Chaqué' }, { slug: 'pantalon', label: 'Pantalón' }, { slug: 'chaleco', label: 'Chaleco' }],
    abrigo: [{ slug: 'abrigo', label: 'Abrigo' }],
    gabardina: [{ slug: 'gabardina', label: 'Gabardina' }],
    frac: [{ slug: 'americana', label: 'Americana' }, { slug: 'pantalon', label: 'Pantalón' }, { slug: 'chaleco', label: 'Chaleco' }],
  }
  return map[prenda] ?? []
}

const PRENDAS_DISPONIBLES = [
  { slug: 'traje_2_piezas', label: 'Traje' },
  { slug: 'traje_3_piezas', label: 'Traje con chaleco' },
  { slug: 'americana_sola', label: 'Americana' },
  { slug: 'pantalon_solo', label: 'Pantalón' },
  { slug: 'chaleco_solo', label: 'Chaleco' },
  { slug: 'teba', label: 'Teba' },
  { slug: 'smoking', label: 'Smoking' },
  { slug: 'chaque', label: 'Chaqué' },
  { slug: 'abrigo', label: 'Abrigo' },
  { slug: 'gabardina', label: 'Gabardina' },
  { slug: 'frac', label: 'Frac' },
  { slug: 'camiseria_industrial', label: 'Camisería Industrial' },
]

function defaultPrendaConfig(slug: string): Record<string, unknown> {
  if (slug === 'pantalon') return {
    vueltas: 'sin_vueltas', bragueta: 'cremallera', pliegues: 'sin_pliegues', plieguesVal: '',
    p7pasadores: false, p5bolsillos: false, pRefForro: false, pRefExtTela: false,
    pSinBolTrasero: false, p1BolTrasero: false, p2BolTraseros: false,
    pBolCostura: false, pBolFrances: false, pBolVivo: false, pBolOreja: false,
    pCenidores: false, pBotonesTirantes: false, pVEnTrasero: false,
    pretinaCorrida: false, pretina2Botones: false, pretinaTamano: '4', pretinaReforzadaDelante: false,
    confFM: '', confFT: '', confPT: '', confRodalTrasero: '', confBajadaDelantero: '',
    confAlturaTrasero: '', confFormaGemelo: false, confFVSalida: '',
  }
  if (slug === 'chaleco') return {
    chalecoCorte: 'recto', chalecoBolsillo: '',
    confF: '', confD: '', confFP: '', confFV: '', confHA: '', confHB: '', confVD: '',
  }
  // americana, teba, abrigo, gabardina, frac, chaque, smoking
  return {
    botones: '1fila_2', aberturas: '2aberturas', bolsilloTipo: '', cerrilleraExterior: false,
    primerBoton: '', solapa: 'normal', anchoSolapa: '', manga: 'napolit',
    ojalesAbiertos: '', ojalesCerrados: '', medidaHombro: false, hTerminado: false, hTerminadoVal: '',
    escote: false, escoteVal: '', sinHombreras: false, picado34: false, sinHombrera: false,
    hombrerasTraseras: false, pocaHombrera: false, forro: 'completo',
    confF: '', confD: '', confFP: '', confFV: '', confHA: '', confHB: '', confVD: '',
  }
}

const SLUG_TO_SPECIALTY: Record<string, string> = {
  americana: 'Americana',
  pantalon: 'Pantalón',
  chaleco: 'Chaleco',
  teba: 'Teba',
  chaque: 'Chaqué',
  abrigo: 'Abrigo',
  gabardina: 'Gabardina',
  camiseria_industrial: 'Camisería Industrial',
}

const SITUACION_TRABAJO = [
  'in_workshop',
  'pending_first_fitting',
  'adjustments',
  'finished',
  'delivered',
  'cancelled',
]

// Tipos y constantes movidos a ./components/ficha-camisa-section.tsx

function defaultCamisa(): CamisaItem {
  return {
    id: crypto.randomUUID(),
    cuello: '', canesu: '', manga: '', frenPecho: '', contPecho: '',
    cintura: '', cadera: '', largo: '', pIzq: '', pDch: '', hombro: '', biceps: '',
    jareton: false, bolsillo: false, hombroCaido: false, derecho: false, izquierdo: false,
    hombrosAltos: false, hombrosBajos: false, erguido: false, cargado: false,
    espaldaLisa: false, espPliegues: false, espTablonCentr: false, espPinzas: false,
    iniciales: false, inicialesTexto: '', modCuello: '', puno: 'sencillo', tejido: '', precio: 0, cantidad: 1, obs: '',
    cortador: '', oficial: '', coste: undefined,
  }
}

function getMeasuresFromRecord(
  v: Record<string, unknown> | null | undefined
): Pick<CamisaItem, 'cuello' | 'canesu' | 'manga' | 'frenPecho' | 'contPecho' | 'cintura' | 'cadera' | 'largo' | 'pIzq' | 'pDch' | 'hombro' | 'biceps'> {
  const empty = { cuello: '', canesu: '', manga: '', frenPecho: '', contPecho: '', cintura: '', cadera: '', largo: '', pIzq: '', pDch: '', hombro: '', biceps: '' }
  if (!v || typeof v !== 'object') return empty
  const MEDIDAS_MAP: Array<[string, keyof CamisaItem]> = [
    ['cuello', 'cuello'], ['canesu', 'canesu'], ['manga', 'manga'],
    ['fren_pecho', 'frenPecho'], ['cont_pecho', 'contPecho'],
    ['cintura', 'cintura'], ['cadera', 'cadera'], ['largo_cuerpo', 'largo'],
    ['p_izq', 'pIzq'], ['p_dch', 'pDch'], ['hombro', 'hombro'], ['biceps', 'biceps'],
  ]
  const out = { ...empty }
  for (const [recordKey, outKey] of MEDIDAS_MAP) {
    const val = v['camiseria_' + recordKey] ?? v[recordKey]
    if (val !== null && val !== undefined && val !== '' && !Number.isNaN(Number(val))) {
      ;(out as Record<string, string>)[outKey] = String(val)
    }
  }
  return out
}

// Tipos ComplementoItem y ComplementResult movidos a ./components/ficha-complementos-section.tsx

function add15WorkingDays(from: Date): string {
  let count = 0
  const d = new Date(from)
  while (count < 15) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return d.toISOString().split('T')[0]
}

// TejidoInput movido a ./components/ficha-camisa-section.tsx

interface CartItem { id: string; slug: string; label: string; precio: number; coste?: number }

function getCartItemDisplayLabel(item: CartItem, allItems: CartItem[]): string {
  const sameType = allItems.filter(c => c.slug === item.slug)
  if (sameType.length <= 1) return item.label
  const index = sameType.indexOf(item) + 1
  return `${item.label} ${index}`
}

export function NuevaVentaFichaClient({
  clientId,
  tipo: tipoProp,
  orderType: orderTypeProp,
  prenda = '',
  sastreName = 'Sastre',
  defaultStoreId,
  onCreated,
  onBack,
  backLabel,
}: {
  clientId: string
  tipo?: string
  orderType?: string
  prenda?: string
  sastreName?: string
  defaultStoreId: string
  /** Callback ejecutado tras crear el pedido con éxito. Si se pasa, el componente NO redirige automáticamente. */
  onCreated?: (orderId: string) => void
  /** Callback del botón "Volver". Si se pasa, reemplaza la navegación por defecto a medidas. */
  onBack?: () => void
  /** Etiqueta del botón volver. */
  backLabel?: string
}) {
  const orderType = tipoProp || orderTypeProp || ''
  const router = useRouter()
  const isCamiseria = orderType === 'camiseria' || orderType === 'camiseria_industrial'

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [prendaConfigs, setPrendaConfigs] = useState<Record<string, Record<string, unknown>>>({})
  const [showPrendaSelector, setShowPrendaSelector] = useState(false)
  const [oficiales, setOficiales] = useState<Record<string, string>>({})
  const seededRef = useRef(false)

  // ── Global form ───────────────────────────────────────────────────────────
  const [notas, setNotas] = useState('')
  const [camisas, setCamisas] = useState<CamisaItem[]>([])
  const [complementos, setComplementos] = useState<ComplementoItem[]>([])
  const [entregaACuenta, setEntregaACuenta] = useState(0)
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'transferencia' | 'bizum'>('efectivo')
  const [showComplementSearch, setShowComplementSearch] = useState(false)
  const [complementSearchQuery, setComplementSearchQuery] = useState('')
  const [complementResults, setComplementResults] = useState<ComplementResult[]>([])
  const [complementSearchLoading, setComplementSearchLoading] = useState(false)
  const [addingComplementQty, setAddingComplementQty] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sastres, setSastres] = useState<{ id: string; full_name: string }[]>([])
  const [officials, setOfficials] = useState<{ id: string; name: string; specialty: string | null }[]>([])
  const [fabricsStock, setFabricsStock] = useState<{ id: string; fabric_code: string | null; name: string }[]>([])
  const [client, setClient] = useState<Record<string, unknown> | null>(null)
  const [clientLoading, setClientLoading] = useState(false)
  const [camiseriaMeasurements, setCamiseriaMeasurements] = useState<Record<string, unknown> | null>(null)
  const [camiseriaMeasurementsLoading, setCamiseriaMeasurementsLoading] = useState(true)

  // Common ficha fields (no per-prenda characteristics)
  const [ficha, setFicha] = useState({
    numeroTalon: '',
    cortador: '',
    situacionTrabajo: 'in_workshop',
    fechaProximaVisita: add15WorkingDays(new Date()),
    observaciones: '',
    domicilio: '',
    localidad: '',
    provincia: '',
    cp: '',
    telefono1: '',
    horario1: '',
    telefono2: '',
    horario2: '',
    fechaCobro: new Date().toISOString().split('T')[0],
    tejidoStockId: '',
    tejidoStockNombre: '',
    tejidoCatalogo: '',
    tejidoMetros: '',
  })

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const getSubSections = (slug: string, label: string) => {
    const subs = getPrendasFromSlug(slug)
    return subs.length > 0 ? subs : [{ slug, label }]
  }

  const addToCart = useCallback((prendaDef: { slug: string; label: string }) => {
    const id = crypto.randomUUID()
    const sections = getPrendasFromSlug(prendaDef.slug)
    const subSections = sections.length > 0 ? sections : [{ slug: prendaDef.slug, label: prendaDef.label }]
    setCartItems(prev => [...prev, { id, slug: prendaDef.slug, label: prendaDef.label, precio: 0 }])
    const initConfigs: Record<string, Record<string, unknown>> = {}
    for (const sp of subSections) initConfigs[`${id}_${sp.slug}`] = defaultPrendaConfig(sp.slug)
    setPrendaConfigs(prev => ({ ...prev, ...initConfigs }))
    setShowPrendaSelector(false)
  }, [])

  const removeFromCart = (id: string) => {
    const item = cartItems.find(c => c.id === id)
    if (!item) return
    setCartItems(prev => prev.filter(c => c.id !== id))
    const sections = getSubSections(item.slug, item.label)
    setPrendaConfigs(prev => {
      const next = { ...prev }
      for (const sp of sections) delete next[`${id}_${sp.slug}`]
      return next
    })
    setOficiales(prev => {
      const next = { ...prev }
      for (const sp of sections) delete next[`${id}_${sp.slug}`]
      return next
    })
  }

  const setPCField = (itemId: string, subSlug: string, field: string, value: unknown) => {
    const key = `${itemId}_${subSlug}`
    setPrendaConfigs(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: value } }))
  }

  // Seed cart from URL param on mount
  useEffect(() => {
    if (seededRef.current || !prenda || isCamiseria) return
    const prendaDef = PRENDAS_DISPONIBLES.find(p => p.slug === prenda)
    if (!prendaDef) return
    seededRef.current = true
    const id = crypto.randomUUID()
    const sections = getPrendasFromSlug(prendaDef.slug)
    const subSections = sections.length > 0 ? sections : [{ slug: prendaDef.slug, label: prendaDef.label }]
    setCartItems([{ id, slug: prendaDef.slug, label: prendaDef.label, precio: 0 }])
    const initConfigs: Record<string, Record<string, unknown>> = {}
    for (const sp of subSections) initConfigs[`${id}_${sp.slug}`] = defaultPrendaConfig(sp.slug)
    setPrendaConfigs(initConfigs)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    setClientLoading(true)
    getClient(clientId).then((res) => {
      if (cancelled) return
      if (res?.success && res.data) {
        const c = res.data as Record<string, unknown>
        setClient(c)
        setFicha((prev) => ({
          ...prev,
          domicilio: String(c.address ?? '').trim(),
          localidad: String(c.city ?? '').trim(),
          provincia: String(c.province ?? '').trim(),
          cp: String(c.postal_code ?? '').trim(),
          telefono1: String(c.phone ?? '').trim(),
          telefono2: String(c.phone_secondary ?? '').trim(),
          cortador: prev.cortador || '',
        }))
      }
    }).finally(() => { if (!cancelled) setClientLoading(false) })
    return () => { cancelled = true }
  }, [clientId, sastreName])

  useEffect(() => {
    let cancelled = false
    async function loadSastres() {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data: roles } = await supabase.from('user_roles').select('user_id, roles!inner(name)').in('roles.name', ['sastre_plus'])
        if (cancelled || !roles || roles.length === 0) return
        const userIds = [...new Set(roles.map((ur: Record<string, unknown>) => ur.user_id as string))]
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds).eq('is_active', true).order('full_name')
        if (!cancelled && profiles) setSastres(profiles as { id: string; full_name: string }[])
      } catch (err) {
        console.error('[FichaClient] loadSastres error:', err)
        toast.error('Error al cargar la lista de sastres')
      }
    }
    loadSastres()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadOfficials() {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data } = await supabase.from('officials').select('id, name, specialty').eq('is_active', true).order('name')
        if (!cancelled && data) setOfficials(data as { id: string; name: string; specialty: string | null }[])
      } catch (err) {
        console.error('[FichaClient] loadOfficials error:', err)
        toast.error('Error al cargar la lista de oficiales')
      }
    }
    loadOfficials()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    listActiveFabricsForFicha().then((res) => {
      if (cancelled) return
      if (res && 'data' in res && Array.isArray(res.data)) setFabricsStock(res.data)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!clientId) { setCamiseriaMeasurementsLoading(false); return }
    let cancelled = false
    setCamiseriaMeasurementsLoading(true)
    getClientMeasurements({ clientId }).then((res) => {
      if (cancelled || !res?.success || !Array.isArray(res.data)) { setCamiseriaMeasurements(null); return }
      const merged: Record<string, unknown> = {}
      for (const record of res.data as Array<{ values?: Record<string, unknown> }>) {
        for (const [key, val] of Object.entries(record.values || {})) {
          if (val !== null && val !== undefined && val !== '') merged[key] = val
        }
      }
      setCamiseriaMeasurements(merged)
    }).finally(() => { if (!cancelled) setCamiseriaMeasurementsLoading(false) })
    return () => { cancelled = true }
  }, [clientId])

  useEffect(() => {
    if (!isCamiseria || camiseriaMeasurementsLoading) return
    setCamisas((prev) => {
      if (prev.length !== 0) return prev
      return [{ ...defaultCamisa(), ...getMeasuresFromRecord(camiseriaMeasurements ?? undefined) }]
    })
  }, [isCamiseria, camiseriaMeasurementsLoading, camiseriaMeasurements])

  const setFichaField = useCallback((field: keyof typeof ficha, value: string | boolean) => {
    setFicha((prev) => ({ ...prev, [field]: value }))
  }, [])

  useEffect(() => {
    getNextTalonNumber().then((n) => setFichaField('numeroTalon', String(n).padStart(4, '0')))
  }, [setFichaField])

  // ── Camisa ops ────────────────────────────────────────────────────────────
  const addCamisa = () => {
    const m = getMeasuresFromRecord(camiseriaMeasurements ?? undefined)
    setCamisas((prev) => [...prev, { id: crypto.randomUUID(), ...m, jareton: false, bolsillo: false, hombroCaido: false, derecho: false, izquierdo: false, hombrosAltos: false, hombrosBajos: false, erguido: false, cargado: false, espaldaLisa: false, espPliegues: false, espTablonCentr: false, espPinzas: false, iniciales: false, inicialesTexto: '', modCuello: '', puno: 'sencillo', tejido: '', precio: 0, cantidad: 1, obs: '', cortador: '', oficial: '' }])
  }
  const removeCamisa = (id: string) => setCamisas((prev) => prev.filter((c) => c.id !== id))
  const updateCamisa = (id: string, field: keyof CamisaItem, value: string | number | boolean | undefined) => {
    setCamisas((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }

  // ── Complement ops ────────────────────────────────────────────────────────
  const addComplementFromSearch = (item: ComplementResult, cantidad: number) => {
    setComplementos((prev) => [...prev, {
      id: crypto.randomUUID(),
      product_variant_id: item.id,
      nombre: item.name,
      cantidad: Math.max(1, cantidad),
      precio: item.price_with_tax,
      cost_price: Number(item.cost_price) || 0,
    }])
    setAddingComplementQty((prev) => ({ ...prev, [item.id]: 0 }))
    setShowComplementSearch(false); setComplementSearchQuery(''); setComplementResults([])
  }
  const addComplementAsFreeText = () => {
    const nombre = complementSearchQuery.trim()
    if (!nombre) return
    setComplementos((prev) => [...prev, { id: crypto.randomUUID(), product_variant_id: '', nombre, cantidad: 1, precio: 0 }])
    setShowComplementSearch(false); setComplementSearchQuery(''); setComplementResults([])
  }
  const removeComplement = (id: string) => setComplementos((prev) => prev.filter((c) => c.id !== id))
  const updateComplementPrecio = (id: string, precio: number) => setComplementos((prev) => prev.map((c) => (c.id === id ? { ...c, precio } : c)))

  const runComplementSearch = useCallback(async () => {
    const q = complementSearchQuery.trim()
    if (q.length < 2) { setComplementResults([]); return }
    setComplementSearchLoading(true)
    try {
      const res = await searchComplementProducts({ query: q, storeId: defaultStoreId })
      if (res?.success && Array.isArray(res.data)) setComplementResults(res.data)
      else setComplementResults([])
    } catch { setComplementResults([]) } finally { setComplementSearchLoading(false) }
  }, [complementSearchQuery, defaultStoreId])

  useEffect(() => {
    const t = setTimeout(runComplementSearch, 300)
    return () => clearTimeout(t)
  }, [runComplementSearch])

  // ── Totals ────────────────────────────────────────────────────────────────
  const precioConfeccion = cartItems.reduce((s, c) => s + (Number(c.precio) || 0), 0)
  const totalCamisas = camisas.reduce((s, c) => s + (Number(c.precio) || 0) * (c.cantidad ?? 1), 0)
  const totalComplementos = complementos.reduce((s, c) => s + (Number(c.precio) || 0) * (c.cantidad || 1), 0)
  const total = precioConfeccion + totalCamisas + totalComplementos
  const pendiente = Math.max(0, total - (Number(entregaACuenta) || 0))

  // ── Build functions ───────────────────────────────────────────────────────
  const buildPrendasSastreria = () => {
    if (cartItems.length === 0) return []
    const result: Array<{ slug: string; label: string; precio: number; oficial: string; configuration: Record<string, unknown>; coste?: number }> = []
    for (const item of cartItems) {
      const sections = getSubSections(item.slug, item.label)
      const itemDisplayLabel = getCartItemDisplayLabel(item, cartItems)
      sections.forEach((sp, idx) => {
        const key = `${item.id}_${sp.slug}`
        const config = prendaConfigs[key] ?? {}
        const lineLabel = sp.label === item.label ? itemDisplayLabel : `${sp.label} — ${itemDisplayLabel}`
        result.push({
          slug: sp.slug,
          label: lineLabel,
          precio: idx === 0 ? item.precio : 0,
          // El coste estimado solo se aplica a la primera sub-prenda (la que recoge el importe)
          coste: idx === 0 ? (Number(item.coste) || 0) : 0,
          oficial: oficiales[key] ?? '',
          configuration: { ...config, prendaLabel: lineLabel, prendaSlug: sp.slug },
        })
      })
    }
    return result
  }

  const buildFichaCommon = () => ({
    numeroTalon: ficha.numeroTalon,
    cortador: ficha.cortador,
    situacionTrabajo: ficha.situacionTrabajo,
    fechaProximaVisita: ficha.fechaProximaVisita,
    fechaCobro: ficha.fechaCobro,
    tejidoStockId: ficha.tejidoStockId,
    tejidoStockNombre: ficha.tejidoStockNombre,
    tejidoCatalogo: ficha.tejidoCatalogo,
    tejidoMetros: ficha.tejidoMetros,
    domicilio: ficha.domicilio,
    localidad: ficha.localidad,
    provincia: ficha.provincia,
    cp: ficha.cp,
    telefono1: ficha.telefono1,
    horario1: ficha.horario1,
    telefono2: ficha.telefono2,
    horario2: ficha.horario2,
    observaciones: ficha.observaciones,
  })

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleCreateOrder = async () => {
    if (!clientId || !defaultStoreId) { toast.error('Faltan cliente o tienda.'); return }
    if (total <= 0) { toast.error('El total debe ser mayor que 0.'); return }
    const entrega = Number(entregaACuenta) || 0
    if (entrega > 0 && !metodoPago) { toast.error('Indica el método de pago para la entrega a cuenta.'); return }
    setSubmitting(true)
    try {
      const prendasSastreria = buildPrendasSastreria()
      const usePrendasArquitectura = prendasSastreria.length > 0
      const res = await createFichaOrder({
        clientId,
        orderType: orderType as 'artesanal' | 'industrial' | 'camiseria' | 'camiseria_industrial',
        storeId: defaultStoreId,
        precioPrenda: usePrendasArquitectura ? undefined : 0,
        notas: notas.trim(),
        prendasSastreria: usePrendasArquitectura ? prendasSastreria : undefined,
        fichaCommon: usePrendasArquitectura ? buildFichaCommon() : undefined,
        camisas: camisas.flatMap((c) =>
          Array.from({ length: Math.max(1, c.cantidad) }, () => ({
            cuello: c.cuello, canesu: c.canesu, manga: c.manga, frenPecho: c.frenPecho,
            contPecho: c.contPecho, cintura: c.cintura, cadera: c.cadera, largo: c.largo,
            pIzq: c.pIzq, pDch: c.pDch, hombro: c.hombro, biceps: c.biceps,
            jareton: c.jareton, bolsillo: c.bolsillo, hombroCaido: c.hombroCaido,
            derecho: c.derecho, izquierdo: c.izquierdo, hombrosAltos: c.hombrosAltos,
            hombrosBajos: c.hombrosBajos, erguido: c.erguido, cargado: c.cargado,
            espaldaLisa: c.espaldaLisa, espPliegues: c.espPliegues,
            espTablonCentr: c.espTablonCentr, espPinzas: c.espPinzas,
            iniciales: c.iniciales, inicialesTexto: c.inicialesTexto, modCuello: c.modCuello, puno: c.puno,
            tejido: c.tejido, precio: Number(c.precio) || 0, obs: c.obs,
            cortador: c.cortador || undefined, oficial: c.oficial || undefined,
            coste: Number(c.coste) || 0,
          }))
        ),
        complementos: complementos.map((c) => ({
          product_variant_id: c.product_variant_id, nombre: c.nombre,
          cantidad: c.cantidad, precio: Number(c.precio) || 0,
          cost_price: Number(c.cost_price) || 0,
        })),
        entregaACuenta: entrega,
        metodoPago: entrega > 0 ? metodoPago : undefined,
        prenda: usePrendasArquitectura ? undefined : (prenda || undefined),
        cortador: usePrendasArquitectura ? undefined : (ficha.cortador.trim() || undefined),
        oficial: undefined,
        fechaCompromiso: usePrendasArquitectura ? undefined : (ficha.fechaProximaVisita || undefined),
        situacionTrabajo: usePrendasArquitectura ? undefined : (ficha.situacionTrabajo || undefined),
        fechaCobro: usePrendasArquitectura ? undefined : (ficha.fechaCobro || undefined),
        fichaData: usePrendasArquitectura ? undefined : { ...buildFichaCommon(), prendaLabel: PRENDA_LABELS[prenda] || prenda },
      })
      if (res?.success && res.data) {
        toast.success(`Pedido ${res.data.orderNumber} creado.`)
        try {
          const orderRes = await getOrder(res.data.orderId)
          if (orderRes?.success && orderRes.data) {
            const sasLines = (orderRes.data.tailoring_order_lines ?? []).filter(
              (l: any) => !l.configuration?.tipo && !l.configuration?.product_name
            )
            if (usePrendasArquitectura && sasLines.length > 0) {
              for (const line of sasLines) await generateFichaForLine(orderRes.data, line)
            } else {
              await generateFichaConfeccionPDF(orderRes.data)
            }
          }
        } catch (e) {
          console.error('[Ficha] PDF:', e)
          toast.error('El pedido se creó, pero no se pudo generar la ficha en PDF')
        }
        if (onCreated) {
          onCreated(res.data.orderId)
        } else {
          router.push(`/sastre/nueva-venta/confirmacion?orderId=${encodeURIComponent(res.data.orderId)}`)
        }
        return
      }
      toast.error(res && !res.success && 'error' in res ? String((res as { error: string }).error) : 'Error al crear el pedido.')
    } catch (e) {
      console.error(e)
      toast.error('Error al crear el pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!clientId || !orderType) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Faltan datos. Vuelve a seleccionar cliente y producto.</p>
        <Button className="min-h-[48px] bg-[#1a2744] text-gray-300 border border-[#2a3a5c] hover:bg-[#243255]" variant="outline" onClick={() => router.push('/sastre/nueva-venta/cliente')}>Ir al inicio</Button>
      </div>
    )
  }

  const clientName = client
    ? String((client as { full_name?: string }).full_name || `${(client as { first_name?: string }).first_name || ''} ${(client as { last_name?: string }).last_name || ''}`).trim() || '—'
    : '—'

  const hasCartItems = cartItems.length > 0
  const showFichaSection = hasCartItems || isCamiseria

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
        <NuevaVentaSteps currentStep={4} tipo={orderType} clientId={clientId} />
        <h1 className="text-2xl font-serif text-white">Nueva venta — Ficha de confección</h1>

        <Button type="button" variant="outline" className="min-h-[48px] gap-2 !border-[#c9a96e]/50 !bg-[#1a2744] text-[#c9a96e] hover:!bg-[#1e2d4a] hover:!border-[#c9a96e]/70"
          onClick={() => {
            if (onBack) onBack()
            else router.push(`/sastre/nueva-venta/medidas?tipo=${encodeURIComponent(orderType)}&clientId=${encodeURIComponent(clientId)}`)
          }}>
          <ArrowLeft className="h-5 w-5" />
          {backLabel ?? 'Volver'}
        </Button>

        {/* ── CARRITO DE PRENDAS ── */}
        {!isCamiseria && (
          <section className="rounded-xl border-2 border-[#c9a96e]/30 bg-[#1a2744]/90 p-5 space-y-3">
            <h2 className="font-serif text-lg text-[#c9a96e]">Prendas</h2>

            {cartItems.map(item => (
              <div key={item.id} className="flex items-start gap-3 py-2 border-b border-white/[0.06] last:border-0">
                <span className="text-white flex-1 min-w-0 font-medium pt-2">{getCartItemDisplayLabel(item, cartItems)}</span>
                <div className="flex flex-col gap-1">
                  <Input
                    type="number" min={0} step={0.01} placeholder="PVP"
                    className="w-28 h-9 bg-white/[0.07] border-white/20 text-white text-sm"
                    value={item.precio || ''}
                    onChange={e => setCartItems(prev => prev.map(c => c.id === item.id ? { ...c, precio: parseFloat(e.target.value) || 0 } : c))}
                  />
                  <Input
                    type="number" min={0} step={0.01} placeholder="Opcional"
                    title="Coste estimado (material + mano de obra)"
                    className="w-28 h-7 bg-transparent border-white/10 text-white/70 text-xs"
                    value={item.coste ?? ''}
                    onChange={e => {
                      const raw = e.target.value
                      const value = raw === '' ? undefined : (parseFloat(raw) || 0)
                      setCartItems(prev => prev.map(c => c.id === item.id ? { ...c, coste: value } : c))
                    }}
                  />
                  <span className="text-[10px] text-white/40 text-right -mt-0.5">Coste est. (€)</span>
                </div>
                <span className="text-white/40 text-sm shrink-0 pt-2">€</span>
                <button type="button" onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-300 shrink-0 text-lg leading-none pt-2">✕</button>
              </div>
            ))}

            {hasCartItems && (
              <p className="text-sm text-white/60 pt-1">
                Total confección: <span className="text-white font-medium">{precioConfeccion.toFixed(2)} €</span>
              </p>
            )}

            {showPrendaSelector ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                {PRENDAS_DISPONIBLES.map(p => (
                  <button key={p.slug} type="button" onClick={() => addToCart(p)}
                    className="p-4 rounded-xl bg-white/[0.05] border border-white/10 text-white hover:bg-white/10 hover:border-[#c9a96e]/40 transition-all text-left">
                    <p className="font-medium text-sm">{p.label}</p>
                  </button>
                ))}
                <button type="button" onClick={() => setShowPrendaSelector(false)}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-white/40 hover:text-white/60 transition-all text-left text-sm">
                  Cancelar
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowPrendaSelector(true)}
                className="flex items-center gap-2 text-[#c9a96e] hover:text-[#b8935a] text-sm font-medium transition-colors pt-1">
                <Plus className="h-4 w-4" /> Añadir prenda
              </button>
            )}
          </section>
        )}

        {/* ── FICHA DE CONFECCIÓN (datos comunes) ── */}
        {showFichaSection && (
          <section className="rounded-xl border-2 border-[#c9a96e]/30 bg-[#1a2744]/90 p-6 space-y-5">
            <h2 className="font-serif text-xl text-[#c9a96e] border-b border-[#c9a96e]/30 pb-2">Ficha de Confección</h2>
            {clientLoading ? (
              <p className="text-white/60">Cargando datos del cliente...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-white/60 text-xs">Nº talón</Label>
                    <Input readOnly className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.numeroTalon} onChange={(e) => setFichaField('numeroTalon', e.target.value)} placeholder="—" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-white/60 text-xs">Cliente</Label>
                    <p className="mt-1 min-h-[44px] flex items-center text-white font-medium">{clientName}</p>
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Cortador</Label>
                    <Select value={ficha.cortador || '__none__'} onValueChange={(v) => setFichaField('cortador', v === '__none__' ? '' : v)}>
                      <SelectTrigger className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white">
                        <SelectValue placeholder="Selecciona cortador" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                        <SelectItem value="__none__" className="text-white focus:bg-white/10 focus:text-white">—</SelectItem>
                        {officials.filter(o => o.specialty?.split(',').some(s => s.trim().toLowerCase() === 'cortador')).map((o) => <SelectItem key={o.id} value={o.name} className="text-white focus:bg-white/10 focus:text-white">{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-white/60 text-xs">Fecha emisión</Label>
                    <p className="mt-1 min-h-[44px] flex items-center text-white">{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Situación trabajo</Label>
                    <Select value={ficha.situacionTrabajo} onValueChange={(v) => setFichaField('situacionTrabajo', v)}>
                      <SelectTrigger className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0d1629] border border-white/20 text-white">{SITUACION_TRABAJO.map((s) => <SelectItem key={s} value={s} className="text-white focus:bg-white/10 focus:text-white">{getOrderStatusLabel(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Fecha próxima visita</Label>
                    <Input type="date" className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.fechaProximaVisita} onChange={(e) => setFichaField('fechaProximaVisita', e.target.value)} />
                  </div>
                </div>

                {/* Tejido — solo cuando hay prendas de sastrería */}
                {!isCamiseria && hasCartItems && (
                  <div className="space-y-3 border-t border-[#c9a96e]/20 pt-4">
                    <h3 className="text-[#c9a96e] text-sm uppercase tracking-wide font-medium">Tejido</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-white/60 text-xs">Tejido en stock</Label>
                        <Select value={ficha.tejidoStockId || '__none__'} onValueChange={(v) => {
                          const fabric = v === '__none__' ? null : fabricsStock.find((f) => f.id === v)
                          setFicha((prev) => ({ ...prev, tejidoStockId: v === '__none__' ? '' : v, tejidoStockNombre: fabric ? `${fabric.fabric_code ?? ''} — ${fabric.name}`.trim() : '' }))
                        }}>
                          <SelectTrigger className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white"><SelectValue placeholder="Selecciona tejido en stock" /></SelectTrigger>
                          <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                            <SelectItem value="__none__" className="text-white focus:bg-white/10 focus:text-white">—</SelectItem>
                            {fabricsStock.map((f) => <SelectItem key={f.id} value={f.id} className="text-white focus:bg-white/10 focus:text-white">{f.fabric_code ? `${f.fabric_code} — ${f.name}` : f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-white/60 text-xs">Tejido de catálogo</Label>
                        <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.tejidoCatalogo} onChange={(e) => setFichaField('tejidoCatalogo', e.target.value)} placeholder="Referencia de catálogo" />
                      </div>
                      <div>
                        <Label className="text-white/60 text-xs">Metros a utilizar</Label>
                        <Input type="number" step="0.1" min="0" className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.tejidoMetros} onChange={(e) => setFichaField('tejidoMetros', e.target.value)} placeholder="Ej: 3.5" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Características por sub-prenda de cada item del carrito */}
                {!isCamiseria && cartItems.flatMap(item => {
                  const sections = getSubSections(item.slug, item.label)
                  return sections.map(sp => {
                    const key = `${item.id}_${sp.slug}`
                    const cfg = prendaConfigs[key] ?? {}
                    const setField = (field: string, value: unknown) => setPCField(item.id, sp.slug, field, value)
                    const itemDisplayLabel = getCartItemDisplayLabel(item, cartItems)
                    const sectionTitle = sp.label === item.label ? itemDisplayLabel : `${sp.label} — ${itemDisplayLabel}`
                    const specialtyForSlug = SLUG_TO_SPECIALTY[sp.slug]
                    const filteredOfficials = specialtyForSlug
                      ? officials.filter(o => o.specialty?.split(',').some(s => s.trim().toLowerCase() === specialtyForSlug.toLowerCase()))
                      : officials

                    return (
                      <div key={key} className="space-y-4 border-t border-[#c9a96e]/20 pt-4">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-[#c9a96e] text-sm uppercase tracking-wide font-medium">{sectionTitle}</h3>
                          <div className="flex items-center gap-2 shrink-0">
                            <Label className="text-white/60 text-xs whitespace-nowrap">Oficial</Label>
                            <Select value={oficiales[key] || '__none__'} onValueChange={(v) => setOficiales(prev => ({ ...prev, [key]: v === '__none__' ? '' : v }))}>
                              <SelectTrigger className="min-h-[36px] h-9 bg-[#0d1629] border-[#c9a96e]/20 text-white text-xs w-40"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                                <SelectItem value="__none__" className="text-white focus:bg-white/10 focus:text-white">—</SelectItem>
                                {filteredOfficials.map(o => <SelectItem key={o.id} value={o.name} className="text-white focus:bg-white/10 focus:text-white">{o.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {sp.slug === 'pantalon' && <FichaPantalonConfig keyId={key} cfg={cfg} setField={setField} />}

                        {sp.slug === 'chaleco' && <FichaChalecoConfig keyId={key} cfg={cfg} setField={setField} />}

                        {!['pantalon', 'chaleco'].includes(sp.slug) && <FichaAmericanaConfig keyId={key} cfg={cfg} setField={setField} />}

                        {/* Características por prenda */}
                        <div className="mt-4">
                          <Label className="text-white/60 text-xs">Características</Label>
                          <textarea
                            value={String(cfg.caracteristicasPrenda || '')}
                            onChange={e => setField('caracteristicasPrenda', e.target.value)}
                            placeholder="Notas, detalles especiales, indicaciones para el oficial..."
                            rows={3}
                            className="mt-1 w-full px-4 py-3 rounded-xl border border-white/20 bg-white/[0.07] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#c9a96e] focus:ring-1 focus:ring-[#c9a96e]/30 transition-all resize-none"
                          />
                        </div>
                      </div>
                    )
                  })
                })}

                {/* Datos de contacto */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-[#c9a96e]/20 pt-4">
                  <div className="col-span-2">
                    <Label className="text-white/60 text-xs">Domicilio</Label>
                    <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.domicilio} onChange={(e) => setFichaField('domicilio', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Localidad</Label>
                    <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.localidad} onChange={(e) => setFichaField('localidad', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Provincia</Label>
                    <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.provincia} onChange={(e) => setFichaField('provincia', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">C.P.</Label>
                    <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.cp} onChange={(e) => setFichaField('cp', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Teléfono 1</Label>
                    <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.telefono1} onChange={(e) => setFichaField('telefono1', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Horario 1</Label>
                    <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.horario1} onChange={(e) => setFichaField('horario1', e.target.value)} placeholder="—" />
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Teléfono 2</Label>
                    <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.telefono2} onChange={(e) => setFichaField('telefono2', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-white/60 text-xs">Horario 2</Label>
                    <Input className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.horario2} onChange={(e) => setFichaField('horario2', e.target.value)} placeholder="—" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-[#c9a96e]/20">
                  <div>
                    <Label className="text-white/60 text-xs">Fecha de cobro</Label>
                    <Input type="date" className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={ficha.fechaCobro} onChange={(e) => setFichaField('fechaCobro', e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── NOTAS / ACABADOS ── */}
        {!isCamiseria && hasCartItems && (
          <section className="rounded-xl border border-[#c9a96e]/20 bg-[#1a2744]/80 p-5 space-y-3">
            <h2 className="font-serif text-lg text-[#c9a96e]">Notas / acabados</h2>
            <Textarea className="min-h-[80px] bg-[#0d1629] border-[#c9a96e]/20 text-white" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
          </section>
        )}

        <FichaCamisaSection
          isCamiseria={isCamiseria}
          camisas={camisas}
          camiseriaMeasurements={camiseriaMeasurements}
          camiseriaMeasurementsLoading={camiseriaMeasurementsLoading}
          officials={officials}
          addCamisa={addCamisa}
          removeCamisa={removeCamisa}
          updateCamisa={updateCamisa}
        />

        <FichaComplementosSection
          complementos={complementos}
          removeComplement={removeComplement}
          updateComplementPrecio={updateComplementPrecio}
          showComplementSearch={showComplementSearch}
          setShowComplementSearch={setShowComplementSearch}
          complementSearchQuery={complementSearchQuery}
          setComplementSearchQuery={setComplementSearchQuery}
          complementResults={complementResults}
          complementSearchLoading={complementSearchLoading}
          addingComplementQty={addingComplementQty}
          setAddingComplementQty={setAddingComplementQty}
          addComplementFromSearch={addComplementFromSearch}
          addComplementAsFreeText={addComplementAsFreeText}
        />

        <FichaResumenSection
          precioConfeccion={precioConfeccion}
          totalCamisas={totalCamisas}
          totalComplementos={totalComplementos}
          total={total}
          pendiente={pendiente}
          entregaACuenta={entregaACuenta}
          setEntregaACuenta={setEntregaACuenta}
          metodoPago={metodoPago}
          setMetodoPago={setMetodoPago}
          submitting={submitting}
          onSubmit={handleCreateOrder}
        />
      </div>
    </div>
  )
}
