'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { createFichaOrder, searchComplementProducts, getOrder, getNextTalonNumber } from '@/actions/orders'
import { getClient, getClientMeasurements } from '@/actions/clients'
import { listActiveFabricsForFicha } from '@/actions/fabrics'
import { NuevaVentaSteps } from '../nueva-venta-steps'
import { generateFichaConfeccionPDF, generateFichaForLine } from '@/lib/pdf/ficha-confeccion'
import { toast } from 'sonner'
import { getOrderStatusLabel } from '@/lib/utils'

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

const SITUACION_TRABAJO = [
  'in_workshop',
  'pending_first_fitting',
  'adjustments',
  'finished',
  'delivered',
  'cancelled',
]

const PUNO_CAMISA_OPTIONS: Array<{ value: 'sencillo' | 'gemelo' | 'mixto' | 'mosquetero' | 'otro'; label: string }> = [
  { value: 'sencillo', label: 'Sencillo' },
  { value: 'gemelo', label: 'Gemelo' },
  { value: 'mixto', label: 'Mixto' },
  { value: 'mosquetero', label: 'Mosquetero' },
  { value: 'otro', label: 'Otro' },
]

const MEDIDAS_FIELDS: Array<{ label: string; field: 'cuello' | 'canesu' | 'manga' | 'frenPecho' | 'contPecho' | 'cintura' | 'cadera' | 'largo' | 'pIzq' | 'pDch' | 'hombro' | 'biceps' }> = [
  { label: 'Cuello', field: 'cuello' },
  { label: 'Canesú', field: 'canesu' },
  { label: 'Manga', field: 'manga' },
  { label: 'Fren.Pecho', field: 'frenPecho' },
  { label: 'Cont.Pecho', field: 'contPecho' },
  { label: 'Cintura', field: 'cintura' },
  { label: 'Cadera', field: 'cadera' },
  { label: 'Lar.Cuerpo', field: 'largo' },
  { label: 'P.Izq', field: 'pIzq' },
  { label: 'P.Dch', field: 'pDch' },
  { label: 'Hombro', field: 'hombro' },
  { label: 'Bíceps', field: 'biceps' },
]

type CamisaItem = {
  id: string
  cuello: string; canesu: string; manga: string; frenPecho: string; contPecho: string
  cintura: string; cadera: string; largo: string; pIzq: string; pDch: string
  hombro: string; biceps: string
  jareton: boolean; bolsillo: boolean; hombroCaido: boolean; derecho: boolean; izquierdo: boolean
  hombrosAltos: boolean; hombrosBajos: boolean; erguido: boolean; cargado: boolean
  espaldaLisa: boolean; espPliegues: boolean; espTablonCentr: boolean; espPinzas: boolean
  iniciales: boolean; inicialesTexto: string; modCuello: string
  puno: 'sencillo' | 'gemelo' | 'mixto' | 'mosquetero' | 'otro'
  tejido: string; precio: number; cantidad: number; obs: string
}

function defaultCamisa(): CamisaItem {
  return {
    id: crypto.randomUUID(),
    cuello: '', canesu: '', manga: '', frenPecho: '', contPecho: '',
    cintura: '', cadera: '', largo: '', pIzq: '', pDch: '', hombro: '', biceps: '',
    jareton: false, bolsillo: false, hombroCaido: false, derecho: false, izquierdo: false,
    hombrosAltos: false, hombrosBajos: false, erguido: false, cargado: false,
    espaldaLisa: false, espPliegues: false, espTablonCentr: false, espPinzas: false,
    iniciales: false, inicialesTexto: '', modCuello: '', puno: 'sencillo', tejido: '', precio: 0, cantidad: 1, obs: '',
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

type ComplementoItem = { id: string; product_variant_id: string; nombre: string; cantidad: number; precio: number }
type ComplementResult = { id: string; name: string; sku: string; price_with_tax: number; tax_rate: number; stock: number }

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

function TejidoInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [tejidos, setTejidos] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase.from('products').select('name').eq('product_type', 'tailoring_fabric').limit(50)
      if (data && Array.isArray(data)) setTejidos(data.map((d: { name?: string }) => String(d?.name ?? '').trim()).filter(Boolean))
    }
    load()
  }, [])

  const filtered = tejidos.filter((t) => t.toLowerCase().includes(value.toLowerCase()))

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input className="flex-1 h-10 bg-[#0d1629] border-[#c9a96e]/20 text-white" value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} placeholder={placeholder ?? 'Escribe o elige tejido'} />
        <button type="button" onClick={() => setShowDropdown(!showDropdown)} className="h-10 w-10 rounded-md border border-[#c9a96e]/20 bg-[#0d1629] text-[#c9a96e] flex items-center justify-center hover:bg-[#c9a96e]/10">▾</button>
      </div>
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1a2744] border border-[#c9a96e]/30 rounded-xl max-h-40 overflow-y-auto shadow-xl">
          {filtered.map((t) => (
            <button key={t} type="button" onMouseDown={() => { onChange(t); setShowDropdown(false) }} className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-[#c9a96e]/10 hover:text-white border-b border-[#c9a96e]/10 last:border-0">{t}</button>
          ))}
        </div>
      )}
    </div>
  )
}

interface CartItem { id: string; slug: string; label: string; precio: number }

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
}: {
  clientId: string
  tipo?: string
  orderType?: string
  prenda?: string
  sastreName?: string
  defaultStoreId: string
}) {
  const orderType = tipoProp || orderTypeProp || ''
  const router = useRouter()
  const isCamiseria = orderType === 'camiseria'

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
  const [officials, setOfficials] = useState<{ id: string; name: string }[]>([])
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
          cortador: prev.cortador || sastreName,
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
      } catch (err) { console.error('[FichaClient] loadSastres error:', err) }
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
        const { data } = await supabase.from('officials').select('id, name').eq('is_active', true).order('name')
        if (!cancelled && data) setOfficials(data as { id: string; name: string }[])
      } catch (err) { console.error('[FichaClient] loadOfficials error:', err) }
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
    if (orderType !== 'camiseria' || camiseriaMeasurementsLoading) return
    setCamisas((prev) => {
      if (prev.length !== 0) return prev
      return [{ ...defaultCamisa(), ...getMeasuresFromRecord(camiseriaMeasurements ?? undefined) }]
    })
  }, [orderType, camiseriaMeasurementsLoading, camiseriaMeasurements])

  const setFichaField = useCallback((field: keyof typeof ficha, value: string | boolean) => {
    setFicha((prev) => ({ ...prev, [field]: value }))
  }, [])

  useEffect(() => {
    getNextTalonNumber().then((n) => setFichaField('numeroTalon', String(n).padStart(4, '0')))
  }, [setFichaField])

  // ── Camisa ops ────────────────────────────────────────────────────────────
  const addCamisa = () => {
    const m = getMeasuresFromRecord(camiseriaMeasurements ?? undefined)
    setCamisas((prev) => [...prev, { id: crypto.randomUUID(), ...m, jareton: false, bolsillo: false, hombroCaido: false, derecho: false, izquierdo: false, hombrosAltos: false, hombrosBajos: false, erguido: false, cargado: false, espaldaLisa: false, espPliegues: false, espTablonCentr: false, espPinzas: false, iniciales: false, inicialesTexto: '', modCuello: '', puno: 'sencillo', tejido: '', precio: 0, cantidad: 1, obs: '' }])
  }
  const removeCamisa = (id: string) => setCamisas((prev) => prev.filter((c) => c.id !== id))
  const updateCamisa = (id: string, field: keyof CamisaItem, value: string | number | boolean) => {
    setCamisas((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }

  // ── Complement ops ────────────────────────────────────────────────────────
  const addComplementFromSearch = (item: ComplementResult, cantidad: number) => {
    setComplementos((prev) => [...prev, { id: crypto.randomUUID(), product_variant_id: item.id, nombre: item.name, cantidad: Math.max(1, cantidad), precio: item.price_with_tax }])
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
    const result: Array<{ slug: string; label: string; precio: number; oficial: string; configuration: Record<string, unknown> }> = []
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
        orderType: orderType as 'artesanal' | 'industrial' | 'camiseria',
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
          }))
        ),
        complementos: complementos.map((c) => ({
          product_variant_id: c.product_variant_id, nombre: c.nombre,
          cantidad: c.cantidad, precio: Number(c.precio) || 0,
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
        } catch (e) { console.error('[Ficha] PDF:', e) }
        router.push(`/sastre/nueva-venta/confirmacion?orderId=${encodeURIComponent(res.data.orderId)}`)
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
          onClick={() => router.push(`/sastre/nueva-venta/medidas?tipo=${encodeURIComponent(orderType)}&clientId=${encodeURIComponent(clientId)}`)}>
          <ArrowLeft className="h-5 w-5" />
          Volver
        </Button>

        {/* ── CARRITO DE PRENDAS ── */}
        {!isCamiseria && (
          <section className="rounded-xl border-2 border-[#c9a96e]/30 bg-[#1a2744]/90 p-5 space-y-3">
            <h2 className="font-serif text-lg text-[#c9a96e]">Prendas</h2>

            {cartItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-2 border-b border-white/[0.06] last:border-0">
                <span className="text-white flex-1 min-w-0 font-medium">{getCartItemDisplayLabel(item, cartItems)}</span>
                <Input
                  type="number" min={0} step={0.01} placeholder="0"
                  className="w-28 h-9 bg-white/[0.07] border-white/20 text-white text-sm"
                  value={item.precio || ''}
                  onChange={e => setCartItems(prev => prev.map(c => c.id === item.id ? { ...c, precio: parseFloat(e.target.value) || 0 } : c))}
                />
                <span className="text-white/40 text-sm shrink-0">€</span>
                <button type="button" onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-300 shrink-0 text-lg leading-none">✕</button>
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
                    <Select value={ficha.cortador} onValueChange={(v) => setFichaField('cortador', v)}>
                      <SelectTrigger className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white">
                        <SelectValue placeholder="Selecciona cortador" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                        {sastres.map((s) => <SelectItem key={s.id} value={s.full_name} className="text-white focus:bg-white/10 focus:text-white">{s.full_name}</SelectItem>)}
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
                                {officials.map(o => <SelectItem key={o.id} value={o.name} className="text-white focus:bg-white/10 focus:text-white">{o.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* PANTALÓN */}
                        {sp.slug === 'pantalon' && (
                          <>
                            <div>
                              <Label className="text-white/60 text-xs">Vueltas</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="radio" name={`vueltas-${key}`} checked={cfg.vueltas === 'sin_vueltas'} onChange={() => setField('vueltas', 'sin_vueltas')} className="text-[#c9a96e]" />
                                  <span className="text-white/80 text-sm">Sin vueltas</span>
                                </label>
                                <span className="text-white/40 text-sm self-center">Con vuelta:</span>
                                {['3.5', '4', '4.5', '5'].map((v) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`vueltas-${key}`} checked={cfg.vueltas === v} onChange={() => setField('vueltas', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{v} cm</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Bragueta</Label>
                              <div className="flex gap-3 mt-2">
                                {[{ v: 'cremallera', label: 'Br. cremallera' }, { v: 'botones', label: 'Br. botones' }].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`bragueta-${key}`} checked={cfg.bragueta === v} onChange={() => setField('bragueta', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Pliegues</Label>
                              <div className="flex items-center gap-3 mt-2">
                                {[{ v: 'sin_pliegues', label: 'Sin pliegues' }, { v: '1_pliegue', label: '1 pliegue' }, { v: '2_pliegues', label: '2 pliegues' }].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`pliegues-${key}`} checked={cfg.pliegues === v} onChange={() => setField('pliegues', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                                <Input className="h-7 w-16 bg-[#0d1629] border-[#c9a96e]/20 text-white text-sm px-2" value={String(cfg.plieguesVal ?? '')} onChange={(e) => setField('plieguesVal', e.target.value)} placeholder="cm" />
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Bolsillos y detalles</Label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                                {[
                                  { k: 'p7pasadores', label: '7 pasadores' }, { k: 'p5bolsillos', label: '5 bolsillos' },
                                  { k: 'pRefForro', label: 'Ref. forro' }, { k: 'pRefExtTela', label: 'Ref. ext. tela' },
                                  { k: 'pSinBolTrasero', label: 'Sin bol. trasero' }, { k: 'p1BolTrasero', label: '1 bol. trasero' },
                                  { k: 'p2BolTraseros', label: '2 bol. traseros' }, { k: 'pBolCostura', label: 'Bol. costura' },
                                  { k: 'pBolFrances', label: 'Bol. francés' }, { k: 'pBolVivo', label: 'Bol. vivo' }, { k: 'pBolOreja', label: 'Bol. oreja' },
                                  { k: 'pCenidores', label: 'Ceñidores costados' }, { k: 'pBotonesTirantes', label: 'Botones tirantes' },
                                  { k: 'pVEnTrasero', label: 'V en trasero' },
                                ].map(({ k, label }) => (
                                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!cfg[k]} onChange={(e) => setField(k, e.target.checked)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Pretina</Label>
                              <div className="space-y-2 mt-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={!!cfg.pretinaCorrida} onChange={(e) => setField('pretinaCorrida', e.target.checked)} className="text-[#c9a96e]" />
                                  <span className="text-white/80 text-sm">Pretina corrida a 13 y un pasador a 7 en pico</span>
                                </label>
                                <div className="flex items-center gap-3">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!cfg.pretina2Botones} onChange={(e) => setField('pretina2Botones', e.target.checked)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">Pretina de dos botones en punta</span>
                                  </label>
                                  {!!cfg.pretina2Botones && (
                                    <div className="flex gap-2">
                                      {['4', '4.5', '5'].map((v) => (
                                        <label key={v} className="flex items-center gap-1 cursor-pointer">
                                          <input type="radio" name={`pretinaTamano-${key}`} checked={cfg.pretinaTamano === v} onChange={() => setField('pretinaTamano', v)} className="text-[#c9a96e]" />
                                          <span className="text-white/80 text-sm">{v} cm</span>
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={!!cfg.pretinaReforzadaDelante} onChange={(e) => setField('pretinaReforzadaDelante', e.target.checked)} className="text-[#c9a96e]" />
                                  <span className="text-white/80 text-sm">Pretina reforzada por delante</span>
                                </label>
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Configuración</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[
                                  { k: 'confFM', label: 'FM' }, { k: 'confFT', label: 'FT' },
                                  { k: 'confPT', label: 'PT' }, { k: 'confRodalTrasero', label: 'Rodal trasero' },
                                  { k: 'confBajadaDelantero', label: 'Bajada delantero' },
                                  { k: 'confAlturaTrasero', label: 'Altura trasero' },
                                  { k: 'confFVSalida', label: 'FV con salida' },
                                ].map(({ k, label }) => (
                                  <div key={k} className="flex items-center gap-1.5">
                                    <span className="text-white/80 text-sm font-medium">{label}</span>
                                    <Input className="h-7 w-16 bg-[#0d1629] border-[#c9a96e]/20 text-white text-sm px-2" value={String(cfg[k] ?? '')} onChange={(e) => setField(k, e.target.value)} placeholder="—" />
                                  </div>
                                ))}
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={!!cfg.confFormaGemelo} onChange={(e) => setField('confFormaGemelo', e.target.checked)} className="text-[#c9a96e]" />
                                  <span className="text-white/80 text-sm">Forma gemelo</span>
                                </label>
                              </div>
                            </div>
                          </>
                        )}

                        {/* CHALECO */}
                        {sp.slug === 'chaleco' && (
                          <>
                            <div>
                              <Label className="text-white/60 text-xs">Corte</Label>
                              <div className="flex gap-3 mt-2">
                                {[{ v: 'recto', label: 'Recto' }, { v: 'cruzado', label: 'Cruzado' }].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`chalecoCorte-${key}`} checked={cfg.chalecoCorte === v} onChange={() => setField('chalecoCorte', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Bolsillo</Label>
                              <div className="flex gap-3 mt-2">
                                {[{ v: 'cartera', label: 'Bols. cartera' }, { v: 'vivo', label: 'Bolsillo vivo' }].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`chalecoBolsillo-${key}`} checked={cfg.chalecoBolsillo === v} onChange={() => setField('chalecoBolsillo', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Configuración</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[
                                  { k: 'confF', label: 'F' }, { k: 'confD', label: 'D' },
                                  { k: 'confFP', label: 'FP' }, { k: 'confFV', label: 'FV' },
                                  { k: 'confHA', label: 'HA' }, { k: 'confHB', label: 'HB' },
                                  { k: 'confVD', label: 'VD' },
                                ].map(({ k, label }) => (
                                  <div key={k} className="flex items-center gap-1.5">
                                    <span className="text-white/80 text-sm font-medium">{label}</span>
                                    <Input className="h-7 w-16 bg-[#0d1629] border-[#c9a96e]/20 text-white text-sm px-2" value={String(cfg[k] ?? '')} onChange={(e) => setField(k, e.target.value)} placeholder="—" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {/* AMERICANA / resto */}
                        {!['pantalon', 'chaleco'].includes(sp.slug) && (
                          <>
                            <div>
                              <Label className="text-white/60 text-xs">Botones</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[
                                  { v: '1fila_1', label: '1 Fila 1 botón' }, { v: '1fila_2', label: '1 Fila 2 botones' },
                                  { v: '1fila_3para2', label: '1 Fila 3 para 2' }, { v: '2filas_6', label: '2 Filas 6 btns 2 adorno' },
                                ].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`botones-${key}`} checked={cfg.botones === v} onChange={() => setField('botones', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Aberturas</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[{ v: '2aberturas', label: '2 Aberturas' }, { v: '1abertura', label: '1 Abertura' }, { v: 'sin_abertura', label: 'Sin abertura' }].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`aberturas-${key}`} checked={cfg.aberturas === v} onChange={() => setField('aberturas', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Bolsillos</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[
                                  { v: 'recto', label: 'Bolsillo recto' }, { v: 'inclinado', label: 'Bol. inclinado' },
                                  { v: 'parche', label: 'Bolsillo parche' }, { v: 'bercheta', label: 'Bol. pecho bercheta' },
                                  { v: 'bercheta_parche', label: 'Bol. pecho parche bercheta' },
                                ].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`bolsilloTipo-${key}`} checked={cfg.bolsilloTipo === v} onChange={() => setField('bolsilloTipo', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={!!cfg.cerrilleraExterior} onChange={(e) => setField('cerrilleraExterior', e.target.checked)} className="text-[#c9a96e]" />
                                  <span className="text-white/80 text-sm">Cerillera exterior</span>
                                </label>
                              </div>
                              <div className="grid grid-cols-2 gap-3 mt-2">
                                <div>
                                  <Label className="text-white/60 text-xs">Primer botón</Label>
                                  <Input className="mt-1 h-10 bg-[#0d1629] border-[#c9a96e]/20 text-white" value={String(cfg.primerBoton ?? '')} onChange={(e) => setField('primerBoton', e.target.value)} placeholder="cm" />
                                </div>
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Solapa</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[{ v: 'normal', label: 'Solapa normal' }, { v: 'pico', label: 'Solapa pico' }, { v: 'chal', label: 'Solapa chal' }].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`solapa-${key}`} checked={cfg.solapa === v} onChange={() => setField('solapa', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                                <div className="flex items-center gap-2">
                                  <Label className="text-white/60 text-xs">Ancho solapa</Label>
                                  <Input className="w-20 h-8 bg-[#0d1629] border-[#c9a96e]/20 text-white text-sm" value={String(cfg.anchoSolapa ?? '')} onChange={(e) => setField('anchoSolapa', e.target.value)} placeholder="cm" />
                                </div>
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Manga</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[
                                  { v: 'napolit', label: 'Manga napolitana' }, { v: 'reborde', label: 'Manga reborde' },
                                  { v: 'sin_reborde', label: 'Manga sin reborde' }, { v: 'con_reborde', label: 'Manga con reborde' },
                                ].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`manga-${key}`} checked={cfg.manga === v} onChange={() => setField('manga', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="grid grid-cols-2 gap-3 mt-2">
                                <div>
                                  <Label className="text-white/60 text-xs">Ojales abiertos</Label>
                                  <Input className="mt-1 h-10 bg-[#0d1629] border-[#c9a96e]/20 text-white" value={String(cfg.ojalesAbiertos ?? '')} onChange={(e) => setField('ojalesAbiertos', e.target.value)} placeholder="nº" />
                                </div>
                                <div>
                                  <Label className="text-white/60 text-xs">Ojales cerrados</Label>
                                  <Input className="mt-1 h-10 bg-[#0d1629] border-[#c9a96e]/20 text-white" value={String(cfg.ojalesCerrados ?? '')} onChange={(e) => setField('ojalesCerrados', e.target.value)} placeholder="nº" />
                                </div>
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Hombros</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[
                                  { k: 'medidaHombro', label: 'Medida hombro' }, { k: 'sinHombreras', label: 'Sin hombreras' },
                                  { k: 'picado34', label: 'Picado 3/4 todo' }, { k: 'sinHombrera', label: 'Sin hombrera' },
                                  { k: 'hombrerasTraseras', label: 'Hombreras traseras' }, { k: 'pocaHombrera', label: 'Poca hombrera' },
                                ].map(({ k, label }) => (
                                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!cfg[k]} onChange={(e) => setField(k, e.target.checked)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={!!cfg.hTerminado} onChange={(e) => setField('hTerminado', e.target.checked)} className="text-[#c9a96e]" />
                                  <span className="text-white/80 text-sm">H. terminado</span>
                                  <Input className="h-7 w-16 bg-[#0d1629] border-[#c9a96e]/20 text-white text-sm px-2" value={String(cfg.hTerminadoVal ?? '')} onChange={(e) => setField('hTerminadoVal', e.target.value)} placeholder="cm" />
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={!!cfg.escote} onChange={(e) => setField('escote', e.target.checked)} className="text-[#c9a96e]" />
                                  <span className="text-white/80 text-sm">Escote</span>
                                  <Input className="h-7 w-16 bg-[#0d1629] border-[#c9a96e]/20 text-white text-sm px-2" value={String(cfg.escoteVal ?? '')} onChange={(e) => setField('escoteVal', e.target.value)} placeholder="cm" />
                                </label>
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Forro</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[{ v: 'sin_forro', label: 'Sin forro' }, { v: 'medio', label: 'Medio forro' }, { v: 'completo', label: 'Forro completo' }].map(({ v, label }) => (
                                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`forro-${key}`} checked={cfg.forro === v} onChange={() => setField('forro', v)} className="text-[#c9a96e]" />
                                    <span className="text-white/80 text-sm">{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/60 text-xs">Configuración</Label>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {[
                                  { k: 'confF', label: 'F' }, { k: 'confD', label: 'D' },
                                  { k: 'confFP', label: 'FP' }, { k: 'confFV', label: 'FV' },
                                  { k: 'confHA', label: 'HA' }, { k: 'confHB', label: 'HB' },
                                  { k: 'confVD', label: 'VD' },
                                ].map(({ k, label }) => (
                                  <div key={k} className="flex items-center gap-1.5">
                                    <span className="text-white/80 text-sm font-medium">{label}</span>
                                    <Input className="h-7 w-16 bg-[#0d1629] border-[#c9a96e]/20 text-white text-sm px-2" value={String(cfg[k] ?? '')} onChange={(e) => setField(k, e.target.value)} placeholder="—" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

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

        {/* ── CAMISAS / CAMISERÍA ── */}
        {(isCamiseria || camiseriaMeasurements) && (
          <section className="rounded-xl border border-[#c9a96e]/20 bg-[#1a2744]/80 p-5 space-y-4">
            <h2 className="font-serif text-lg text-[#c9a96e]">{isCamiseria ? 'Camisería' : 'Camisas a medida'}</h2>
            {camiseriaMeasurementsLoading ? (
              <p className="text-white/60 text-sm">Cargando medidas de camisería...</p>
            ) : !camiseriaMeasurements && !isCamiseria ? (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                <p className="text-amber-200 text-sm">Este cliente no tiene medidas de camisería. Para hacer una camisa a medida, crea primero un pedido de camisería desde el flujo de Camisería.</p>
              </div>
            ) : (
              <>
                <Button type="button" className="min-h-[48px] gap-2 bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 transition-all" onClick={addCamisa}>
                  <Plus className="h-5 w-5" /> Añadir camisa
                </Button>
                {camisas.map((camisa, index) => (
                  <div key={camisa.id} className="rounded-lg border border-[#c9a96e]/15 bg-[#0d1629] p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[#c9a96e] font-medium">CAMISA #{index + 1}</h3>
                      <Button type="button" variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => removeCamisa(camisa.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      <Label className="text-white/60 text-xs mb-2 block">Medidas</Label>
                      <div className="grid grid-cols-6 gap-3 rounded-lg bg-[#0a1020] p-3">
                        {MEDIDAS_FIELDS.map(({ label, field }) => (
                          <div key={field}>
                            <Label className="text-xs text-gray-400 block mb-1">{label}</Label>
                            <Input type="number" inputMode="decimal" className="w-full py-2 text-center bg-[#1a2744] border-[#c9a96e]/20 text-white text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={camisa[field] ?? ''} onChange={(e) => updateCamisa(camisa.id, field, e.target.value)} placeholder="—" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-white/60 text-xs mb-2 block">Opciones</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="flex flex-col gap-2">
                          {[{ k: 'jareton', label: 'Jaretón' }, { k: 'bolsillo', label: 'Bolsillo' }].map(({ k, label }) => (
                            <label key={k} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox checked={!!(camisa as Record<string, unknown>)[k]} onCheckedChange={(v) => updateCamisa(camisa.id, k as keyof CamisaItem, !!v)} className="border-[#c9a96e]/40" />
                              <span className="text-white/80 text-sm">{label}</span>
                            </label>
                          ))}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={camisa.hombroCaido} onCheckedChange={(v) => updateCamisa(camisa.id, 'hombroCaido', !!v)} className="border-[#c9a96e]/40" />
                            <span className="text-white/80 text-sm">Hombro caído</span>
                          </label>
                          {camisa.hombroCaido && (
                            <div className="ml-6 flex flex-col gap-2">
                              {[{ k: 'derecho', label: 'Derecho' }, { k: 'izquierdo', label: 'Izquierdo' }].map(({ k, label }) => (
                                <label key={k} className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox checked={!!(camisa as Record<string, unknown>)[k]} onCheckedChange={(v) => updateCamisa(camisa.id, k as keyof CamisaItem, !!v)} className="border-[#c9a96e]/40" />
                                  <span className="text-white/70 text-sm">{label}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {[{ k: 'hombrosAltos', label: 'Hombros altos' }, { k: 'hombrosBajos', label: 'Hombros bajos' }, { k: 'erguido', label: 'Erguido' }, { k: 'cargado', label: 'Cargado' }].map(({ k, label }) => (
                            <label key={k} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox checked={!!(camisa as Record<string, unknown>)[k]} onCheckedChange={(v) => updateCamisa(camisa.id, k as keyof CamisaItem, !!v)} className="border-[#c9a96e]/40" />
                              <span className="text-white/80 text-sm">{label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex flex-col gap-2">
                          {[{ k: 'espaldaLisa', label: 'Espalda lisa' }, { k: 'espPliegues', label: 'Esp. pliegues' }, { k: 'espTablonCentr', label: 'Esp. tablón centr.' }, { k: 'espPinzas', label: 'Esp. pinzas' }].map(({ k, label }) => (
                            <label key={k} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox checked={!!(camisa as Record<string, unknown>)[k]} onCheckedChange={(v) => updateCamisa(camisa.id, k as keyof CamisaItem, !!v)} className="border-[#c9a96e]/40" />
                              <span className="text-white/80 text-sm">{label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={camisa.iniciales} onCheckedChange={(v) => updateCamisa(camisa.id, 'iniciales', !!v)} className="border-[#c9a96e]/40" />
                            <span className="text-white/80 text-sm">Iniciales</span>
                          </label>
                          {camisa.iniciales && (
                            <Input className="h-9 bg-[#1a2744] border-[#c9a96e]/20 text-white text-sm" value={camisa.inicialesTexto} onChange={(e) => updateCamisa(camisa.id, 'inicialesTexto', e.target.value)} placeholder="Ej: J.G.M." />
                          )}
                          <div>
                            <Label className="text-white/70 text-xs">Mod. cuello</Label>
                            <Input className="mt-1 h-9 bg-[#1a2744] border-[#c9a96e]/20 text-white text-sm" value={camisa.modCuello} onChange={(e) => updateCamisa(camisa.id, 'modCuello', e.target.value)} placeholder="Texto" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-white/70 text-xs mb-2 block">Puño</Label>
                      <div className="flex flex-wrap gap-3">
                        {PUNO_CAMISA_OPTIONS.map(({ value, label }) => (
                          <label key={value} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name={`puno-${camisa.id}`} checked={camisa.puno === value} onChange={() => updateCamisa(camisa.id, 'puno', value)} className="text-[#c9a96e]" />
                            <span className="text-white/80 text-sm">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-white/70 text-xs">Tejido</Label>
                      <div className="mt-1"><TejidoInput value={camisa.tejido} onChange={(v) => updateCamisa(camisa.id, 'tejido', v)} placeholder="Escribe o elige tejido" /></div>
                    </div>
                    <div>
                      <Label className="text-white/60 text-xs mb-2 block">Precio y cantidad</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-white/50 text-xs">Precio (€)</Label>
                          <Input type="number" min={0} step={0.01} className="mt-1 h-10 bg-[#1a2744] border-[#c9a96e]/20 text-white" value={camisa.precio || ''} onChange={(e) => updateCamisa(camisa.id, 'precio', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                          <Label className="text-white/50 text-xs">Cantidad</Label>
                          <Input type="number" min={1} className="mt-1 h-10 bg-[#1a2744] border-[#c9a96e]/20 text-white" value={camisa.cantidad} onChange={(e) => updateCamisa(camisa.id, 'cantidad', Math.max(1, parseInt(e.target.value, 10) || 1))} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-white/70 text-xs">Observaciones</Label>
                      <Textarea className="mt-1 min-h-[60px] bg-[#1a2744] border-[#c9a96e]/20 text-white" value={camisa.obs} onChange={(e) => updateCamisa(camisa.id, 'obs', e.target.value)} placeholder="Opcional" />
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        )}

        {/* ── COMPLEMENTOS ── */}
        <section className="rounded-xl border border-[#c9a96e]/20 bg-[#1a2744]/80 p-5 space-y-4">
          <h2 className="font-serif text-lg text-[#c9a96e]">Complementos boutique</h2>
          <Button type="button" className="min-h-[48px] gap-2 bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 transition-all" onClick={() => setShowComplementSearch(true)}>
            <Plus className="h-5 w-5" /> Añadir complemento
          </Button>
          {complementos.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#c9a96e]/15 bg-[#0d1629] p-3">
              <div className="min-w-0">
                <p className="text-white font-medium truncate">{c.nombre}</p>
                <p className="text-white/60 text-sm">Cantidad: {c.cantidad}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Input type="number" min={0} step={0.01} className="w-20 min-h-[44px] bg-[#1a2744] border-[#c9a96e]/20 text-white text-right" value={c.precio || ''} onChange={(e) => updateComplementPrecio(c.id, parseFloat(e.target.value) || 0)} />
                <span className="text-white/60">€</span>
                <Button type="button" variant="ghost" size="sm" className="text-red-400" onClick={() => removeComplement(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </section>

        {/* ── RESUMEN Y PAGO ── */}
        <section className="rounded-xl border border-[#c9a96e]/30 bg-[#0d1629] p-5 space-y-3">
          <h2 className="font-serif text-lg text-[#c9a96e]">Resumen precios</h2>
          <dl className="space-y-1 text-white/90">
            {precioConfeccion > 0 && (
              <div className="flex justify-between">
                <span>Precio confección:</span>
                <span>{precioConfeccion.toFixed(2)} €</span>
              </div>
            )}
            {totalCamisas > 0 && (
              <div className="flex justify-between">
                <span>Camisas:</span>
                <span>{totalCamisas.toFixed(2)} €</span>
              </div>
            )}
            {totalComplementos > 0 && (
              <div className="flex justify-between">
                <span>Complementos:</span>
                <span>{totalComplementos.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-white pt-2 border-t border-[#c9a96e]/20">
              <span>TOTAL:</span>
              <span>{total.toFixed(2)} €</span>
            </div>
          </dl>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-white/80">Entrega a cuenta (€)</Label>
              <Input type="number" min={0} step={0.01} className="mt-1 min-h-[48px] bg-[#1a2744] border-[#c9a96e]/20 text-white" value={entregaACuenta || ''} onChange={(e) => setEntregaACuenta(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label className="text-white/80">
                Método de pago
                {(Number(entregaACuenta) || 0) > 0 && <span className="text-[#c9a96e] ml-0.5">*</span>}
              </Label>
              <Select value={metodoPago} onValueChange={(v: 'efectivo' | 'tarjeta' | 'transferencia' | 'bizum') => setMetodoPago(v)}>
                <SelectTrigger className="mt-1 min-h-[48px] bg-[#1a2744] border-[#c9a96e]/20 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                  <SelectItem value="efectivo" className="text-white focus:bg-white/10 focus:text-white">Efectivo</SelectItem>
                  <SelectItem value="tarjeta" className="text-white focus:bg-white/10 focus:text-white">Tarjeta</SelectItem>
                  <SelectItem value="transferencia" className="text-white focus:bg-white/10 focus:text-white">Transferencia</SelectItem>
                  <SelectItem value="bizum" className="text-white focus:bg-white/10 focus:text-white">Bizum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-white/80">Pendiente: <strong className="text-white">{pendiente.toFixed(2)} €</strong></p>
          <Button type="button" className="w-full min-h-[48px] bg-[#c9a96e]/20 border border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/30" onClick={handleCreateOrder} disabled={submitting || total <= 0}>
            {submitting ? 'Creando pedido...' : 'Crear pedido y descargar ficha'}
          </Button>
        </section>
      </div>

      {/* ── DIALOG COMPLEMENTOS ── */}
      <Dialog open={showComplementSearch} onOpenChange={setShowComplementSearch}>
        <DialogContent className="max-w-md bg-[#0f1e35] border-[#2a3a5c] text-white">
          <DialogHeader>
            <DialogTitle className="text-[#c9a96e]">Buscar complemento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
              <Input placeholder="Nombre o SKU..." className="pl-9 bg-[#0d1629] border border-[#2a3a5c] text-white" value={complementSearchQuery} onChange={(e) => setComplementSearchQuery(e.target.value)} />
            </div>
            {complementSearchLoading && <p className="text-white/60 text-sm">Buscando...</p>}
            <ul className="max-h-60 overflow-auto space-y-2">
              {complementResults.map((item) => {
                const qty = addingComplementQty[item.id] ?? 1
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#2a3a5c] bg-[#0d1629] p-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-white/60 text-xs">SKU: {item.sku} · {item.price_with_tax.toFixed(2)} € · Stock: {item.stock}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input type="number" min={1} className="w-14 h-8 text-center bg-[#1a2744] text-gray-300 border border-[#2a3a5c] rounded text-sm" value={qty} onChange={(e) => setAddingComplementQty((p) => ({ ...p, [item.id]: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                      <Button type="button" size="sm" className="min-h-[32px] bg-[#c9a96e]/20 text-[#c9a96e] hover:bg-[#c9a96e]/30" onClick={() => addComplementFromSearch(item, qty)}>Añadir</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
            {!complementSearchLoading && complementSearchQuery.length >= 2 && complementResults.length === 0 && (
              <p className="text-white/60 text-sm">No hay resultados.</p>
            )}
            {!complementSearchLoading && complementSearchQuery.trim().length >= 2 && (
              <div className="pt-2 border-t border-[#c9a96e]/20">
                <p className="text-white/60 text-sm mb-2">¿No encuentras el producto?</p>
                <Button type="button" size="sm" className="bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 transition-all" onClick={addComplementAsFreeText}>Añadir como texto libre</Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="px-4 py-2 rounded bg-[#1a2744] text-gray-300 border border-[#2a3a5c] hover:bg-[#243255] transition-colors" onClick={() => setShowComplementSearch(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
