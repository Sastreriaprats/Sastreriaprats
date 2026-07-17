'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Copy } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'
import { createFichaOrder, searchComplementProducts, getOrder, getNextTalonNumber } from '@/actions/orders'
import { getClient, getClientMeasurements, saveBodyMeasurements } from '@/actions/clients'
import { listActiveFabricsForFicha } from '@/actions/fabrics'
import { useGarmentTypes } from '@/hooks/use-cached-queries'
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

type SubPrenda = { slug: string; label: string; parentSlug?: string }

function getPrendasFromSlug(prenda: string): SubPrenda[] {
  const map: Record<string, SubPrenda[]> = {
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
    // frac: el patronaje es propio aunque internamente se cose como 3 piezas.
    // parentSlug='frac' hace que defaultPrendaConfig/propagación lean y
    // escriban los confXX en client_measurements con prefijo frac_ en lugar
    // de americana_/pantalon_/chaleco_.
    frac: [
      { slug: 'americana', label: 'Americana', parentSlug: 'frac' },
      { slug: 'pantalon',  label: 'Pantalón',  parentSlug: 'frac' },
      { slug: 'chaleco',   label: 'Chaleco',   parentSlug: 'frac' },
    ],
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
  { slug: 'levita', label: 'Levita' },
]

// Campos de "Configuración técnica" que ahora viven en
// client_measurements del garment_type 'body' (con prefijo de la prenda)
// y se pre-rellenan automáticamente en la ficha. Cubre pantalon,
// americana, chaleco (Fase A) y abrigo, levita, frac, chaque (Fase B —
// mismos 7 confXX que americana). El frac comparte CAMPOS con
// americana pero NO VALORES: tiene patronaje propio y se guarda con
// prefijo frac_. Otros slugs (teba, gabardina, smoking) no
// pre-rellenan estos campos.
const CONF_AMERICANA_LIKE: string[] = ['confF', 'confD', 'confFP', 'confFV', 'confHA', 'confHB', 'confVD']
const CONF_NUMERIC_KEYS: Record<string, string[]> = {
  pantalon: ['confFM', 'confFT', 'confPT', 'confMuslo', 'confRodalTrasero', 'confBajadaDelantero', 'confAlturaTrasero', 'confFVSalida'],
  americana: CONF_AMERICANA_LIKE,
  chaleco: CONF_AMERICANA_LIKE,
  abrigo: CONF_AMERICANA_LIKE,
  levita: CONF_AMERICANA_LIKE,
  frac: CONF_AMERICANA_LIKE,
  chaque: CONF_AMERICANA_LIKE,
}
const CONF_BOOLEAN_KEYS: Record<string, string[]> = {
  pantalon: ['confFormaGemelo'],
  americana: [],
  chaleco: [],
  abrigo: [],
  levita: [],
  frac: [],
  chaque: [],
}

function extractConfFromMeasurements(
  slug: string,
  measurements: Record<string, unknown> | null | undefined,
  parentSlug?: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const m = measurements ?? {}
  // Las claves de confXX dependen del slug propio (americana/pantalon/chaleco
  // tienen listados distintos). El PREFIJO con el que se buscan en las
  // medidas del cliente es el del parentSlug si existe (ej. una venta de
  // Frac lee frac_confF en lugar de americana_confF).
  const prefix = parentSlug ?? slug
  for (const k of CONF_NUMERIC_KEYS[slug] ?? []) {
    const v = m[`${prefix}_${k}`]
    out[k] = v == null || v === '' ? '' : String(v)
  }
  for (const k of CONF_BOOLEAN_KEYS[slug] ?? []) {
    const v = m[`${prefix}_${k}`]
    out[k] = String(v) === 'true'
  }
  return out
}

function defaultPrendaConfig(slug: string, measurements?: Record<string, unknown> | null, parentSlug?: string): Record<string, unknown> {
  // Sin valores por defecto en los radios: el sastre los marca al rellenar
  // para que no queden opciones tildadas que se le pasen sin querer.
  // Los campos de tela (tejido + forro) viven AHORA por prenda, no globales.
  // El forro se inicializa para TODAS las sub-prendas aunque solo
  // americana/abrigo/levita lo muestren en UI (el resto lo ignora — el
  // PDF tampoco lo imprime si está vacío).
  const tejido = {
    tejidoStockId: '',
    tejidoStockNombre: '',
    tejidoCatalogo: '',
    tejidoMetros: '',
    tejidoPrecioMetro: 0,
    tejidoCosteMaterial: 0,
    forroStockId: '',
    forroStockNombre: '',
    forroCatalogo: '',
    forroMetros: '',
    forroPrecioMetro: 0,
    forroCosteMaterial: 0,
  }
  const conf = extractConfFromMeasurements(slug, measurements, parentSlug)
  if (slug === 'pantalon') return {
    ...tejido,
    vueltas: '', bragueta: '', pliegues: '', plieguesVal: '',
    p7pasadores: false, p5bolsillos: false, pRefForro: false, pRefExtTela: false,
    pSinBolTrasero: false, p1BolTrasero: false, p2BolTraseros: false,
    pBolCostura: false, pBolFrances: false, pBolVivo: false, pBolOreja: false,
    pCenidores: false, pBotonesTirantes: false, pVEnTrasero: false,
    pretinaCorrida: false, pretina2Botones: false, pretinaTamano: '', pretinaReforzadaDelante: false, pretinaReforzada: false,
    confFM: '', confFT: '', confPT: '', confMuslo: '', confRodalTrasero: '', confBajadaDelantero: '',
    confAlturaTrasero: '', confFormaGemelo: false, confFVSalida: '',
    ...conf,
  }
  if (slug === 'chaleco') return {
    ...tejido,
    chalecoCorte: '', chalecoBolsillo: '',
    confF: '', confD: '', confFP: '', confFV: '', confHA: '', confHB: '', confVD: '',
    ...conf,
  }
  // americana, teba, abrigo, gabardina, frac, chaque, smoking
  // Solo se pre-rellenan los confXX si el slug es 'americana'.
  return {
    ...tejido,
    botones: '', aberturas: '', bolsilloTipo: '', cerrilleraExterior: false,
    primerBoton: '', solapa: '', anchoSolapa: '', manga: '',
    ojalesAbiertos: '', ojalesCerrados: '', hTerminado: false, hTerminadoVal: '',
    escote: false, escoteVal: '', sinHombreras: false, picado34: false, sinHombrera: false,
    hombrerasTraseras: false, pocaHombrera: false, forro: '',
    confF: '', confD: '', confFP: '', confFV: '', confHA: '', confHB: '', confVD: '',
    ...conf,
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
  'in_production',
  'in_fitting',
  'finished',
  'delivered',
  'cancelled',
]

// Tipos y constantes movidos a ./components/ficha-camisa-section.tsx

function defaultCamisa(): CamisaItem {
  return {
    id: crypto.randomUUID(),
    mode: 'a_medida',
    cuello: '', canesu: '', largoManga: '', frentePecho: '', pecho: '',
    cintura: '', cadera: '', largoCuerpo: '', hombro: '', punoDerecho: '', punoIzquierdo: '',
    jareton: false, bolsillo: false, hombroCaido: false, derecho: false, izquierdo: false,
    hombrosAltos: false, hombrosBajos: false, erguido: false, cargado: false,
    espaldaLisa: false, espPliegues: false, espTablonCentr: false, espPinzas: false,
    iniciales: false, inicialesTexto: '', inicialesSituacion: '', inicialesColor: '',
    modCuello: '', puno: 'sencillo', tejido: '', tejidoStockId: undefined, tejidoMetros: undefined, precio: 0, cantidad: 1, obs: '',
    cortador: '', oficial: '', coste: undefined,
  }
}

type CamisaMedidas = Pick<CamisaItem, 'cuello' | 'canesu' | 'largoManga' | 'frentePecho' | 'pecho' | 'cintura' | 'cadera' | 'largoCuerpo' | 'hombro' | 'punoDerecho' | 'punoIzquierdo'>

/** Extrae solo las medidas físicas de una camisa del array. Se usa al añadir
 *  una camisa nueva para heredar las medidas de la anterior — el resto
 *  (tejido, precio, opciones, iniciales) se queda en defaults porque cada
 *  camisa puede tener tejido y precio distintos aunque las medidas se repitan. */
function pickMedidasFromCamisa(c: CamisaItem): CamisaMedidas {
  return {
    cuello: c.cuello, canesu: c.canesu, largoManga: c.largoManga,
    frentePecho: c.frentePecho, pecho: c.pecho, cintura: c.cintura,
    cadera: c.cadera, largoCuerpo: c.largoCuerpo, hombro: c.hombro,
    punoDerecho: c.punoDerecho, punoIzquierdo: c.punoIzquierdo,
  }
}

function getMeasuresFromRecord(
  v: Record<string, unknown> | null | undefined
): CamisaMedidas {
  const empty: CamisaMedidas = { cuello: '', canesu: '', largoManga: '', frentePecho: '', pecho: '', cintura: '', cadera: '', largoCuerpo: '', hombro: '', punoDerecho: '', punoIzquierdo: '' }
  if (!v || typeof v !== 'object') return empty
  // Aceptamos las claves modernas (snake_case BD) y fallbacks legacy. Las
  // medidas de cliente se guardan a veces con prefijo "camiseria_" (datos
  // antiguos) y a veces sin él (saveBodyMeasurements actual). Probamos ambos.
  const MEDIDAS_MAP: Array<{ keys: string[]; outKey: keyof CamisaItem }> = [
    { keys: ['cuello'], outKey: 'cuello' },
    { keys: ['canesu'], outKey: 'canesu' },
    { keys: ['largo_manga', 'manga'], outKey: 'largoManga' },
    { keys: ['frente_pecho', 'fren_pecho'], outKey: 'frentePecho' },
    { keys: ['pecho', 'cont_pecho'], outKey: 'pecho' },
    { keys: ['cintura'], outKey: 'cintura' },
    { keys: ['cadera'], outKey: 'cadera' },
    { keys: ['largo_cuerpo', 'largo'], outKey: 'largoCuerpo' },
    { keys: ['hombro'], outKey: 'hombro' },
    { keys: ['puno_derecho'], outKey: 'punoDerecho' },
    { keys: ['puno_izquierdo'], outKey: 'punoIzquierdo' },
  ]
  const out = { ...empty }
  for (const { keys, outKey } of MEDIDAS_MAP) {
    let val: unknown
    for (const k of keys) {
      const candidate = v['camiseria_' + k] ?? v[k]
      if (candidate !== null && candidate !== undefined && candidate !== '') {
        val = candidate
        break
      }
    }
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

interface CartItem { id: string; slug: string; label: string; precio: number; coste?: number; regalo?: boolean }

function getCartItemDisplayLabel(item: CartItem, allItems: CartItem[]): string {
  const sameType = allItems.filter(c => c.slug === item.slug)
  if (sameType.length <= 1) return item.label
  const index = sameType.indexOf(item) + 1
  return `${item.label} ${index}`
}

type FabricStockItem = { id: string; fabric_code: string | null; name: string; price_per_meter: number | null; stock_meters: number | null; composition: string | null }

/** Bloque "TEJIDO" o "FORRO" reutilizable. Lee/escribe las 6 claves
 *  `${prefix}StockId/Nombre/Catalogo/Metros/PrecioMetro/CosteMaterial`
 *  en el config de la sub-prenda. El popover compone su clave global
 *  como `${itemKey}-${prefix}` para que tejido y forro puedan coexistir
 *  abiertos simultáneamente en sub-prendas distintas. */
function FabricBlock({
  itemKey,
  prefix,
  label,
  cfg,
  setField,
  fabricsStock,
  popoverOpenKey,
  setPopoverOpenKey,
}: {
  itemKey: string
  prefix: 'tejido' | 'forro'
  label: string
  cfg: Record<string, unknown>
  setField: (field: string, value: unknown) => void
  fabricsStock: FabricStockItem[]
  popoverOpenKey: string | null
  setPopoverOpenKey: (k: string | null) => void
}) {
  const popoverKey = `${itemKey}-${prefix}`
  const stockIdKey = `${prefix}StockId` as const
  const stockNombreKey = `${prefix}StockNombre` as const
  const catalogoKey = `${prefix}Catalogo` as const
  const metrosKey = `${prefix}Metros` as const
  const precioKey = `${prefix}PrecioMetro` as const
  const costeKey = `${prefix}CosteMaterial` as const

  const recalcCoste = (metros: number, precio: number) => {
    if (precio > 0 && metros > 0) setField(costeKey, Math.round(precio * metros * 100) / 100)
    else setField(costeKey, 0)
  }

  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <h4 className="text-[#c9a96e] text-xs uppercase tracking-wide font-medium">{label}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-white/60 text-xs">{prefix === 'tejido' ? 'Tejido en stock' : 'Forro en stock'}</Label>
          <Popover open={popoverOpenKey === popoverKey} onOpenChange={(o) => setPopoverOpenKey(o ? popoverKey : null)}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={popoverOpenKey === popoverKey}
                className="mt-1 w-full min-h-[44px] justify-between bg-[#0d1629] border-[#c9a96e]/20 text-white hover:bg-[#0d1629] hover:text-white font-normal"
              >
                <span className="truncate">
                  {String(cfg[stockNombreKey] || '') || (prefix === 'tejido' ? 'Buscar o seleccionar tejido...' : 'Buscar o seleccionar forro...')}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 bg-[#0d1629] border border-white/20 text-white" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
              <Command className="bg-transparent text-white">
                <CommandInput placeholder="Buscar por código o nombre..." className="text-white placeholder:text-white/40" />
                <CommandList>
                  <CommandEmpty className="py-4 text-center text-sm text-white/50">Sin resultados</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__none__"
                      onSelect={() => {
                        setField(stockIdKey, '')
                        setField(stockNombreKey, '')
                        setField(precioKey, 0)
                        setField(costeKey, 0)
                        setPopoverOpenKey(null)
                      }}
                      className="text-white aria-selected:bg-white/10 aria-selected:text-white"
                    >
                      <Check className={`mr-2 h-4 w-4 ${cfg[stockIdKey] ? 'opacity-0' : 'opacity-100'}`} />
                      —
                    </CommandItem>
                    {fabricsStock.map((f) => {
                      const fabricLabel = f.fabric_code ? `${f.fabric_code} — ${f.name}` : f.name
                      const precioMetro = Number(f.price_per_meter) || 0
                      return (
                        <CommandItem
                          key={f.id}
                          value={`${f.fabric_code ?? ''} ${f.name}`}
                          onSelect={() => {
                            setField(stockIdKey, f.id)
                            setField(stockNombreKey, `${f.fabric_code ?? ''} — ${f.name}`.trim())
                            setField(precioKey, precioMetro)
                            const metros = Number(cfg[metrosKey]) || 0
                            recalcCoste(metros, precioMetro)
                            setPopoverOpenKey(null)
                          }}
                          className="text-white aria-selected:bg-white/10 aria-selected:text-white"
                        >
                          <Check className={`mr-2 h-4 w-4 ${cfg[stockIdKey] === f.id ? 'opacity-100' : 'opacity-0'}`} />
                          <span className="truncate">{fabricLabel}</span>
                          {precioMetro > 0 && (
                            <span className="ml-2 text-xs text-white/50 shrink-0 tabular-nums">· {precioMetro.toFixed(2)} €/m</span>
                          )}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {(() => {
            const selectedFabric = fabricsStock.find((f) => f.id === cfg[stockIdKey])
            const precio = Number(cfg[precioKey]) || 0
            if (precio <= 0 && !selectedFabric?.composition) return null
            const stockM = selectedFabric?.stock_meters != null ? Number(selectedFabric.stock_meters) : null
            return (
              <p className="text-[10px] text-white/50 mt-0.5">
                {precio > 0 && <span className="tabular-nums">{precio.toFixed(2)} €/m</span>}
                {precio > 0 && stockM != null && ' · '}
                {stockM != null && <span className="tabular-nums">{stockM.toFixed(1)} m disponibles</span>}
                {selectedFabric?.composition && (precio > 0 || stockM != null) && ' · '}
                {selectedFabric?.composition && <span>{selectedFabric.composition}</span>}
              </p>
            )
          })()}
        </div>
        <div>
          <Label className="text-white/60 text-xs">{prefix === 'tejido' ? 'Tejido de catálogo' : 'Forro de catálogo'}</Label>
          <Input
            className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white"
            value={String(cfg[catalogoKey] || '')}
            onChange={(e) => setField(catalogoKey, e.target.value)}
            placeholder="Referencia de catálogo"
          />
        </div>
        <div>
          <Label className="text-white/60 text-xs">Metros a utilizar</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            className="mt-1 min-h-[44px] bg-[#0d1629] border-[#c9a96e]/20 text-white"
            value={String(cfg[metrosKey] || '')}
            onChange={(e) => {
              setField(metrosKey, e.target.value)
              const metros = Number(e.target.value) || 0
              const precio = Number(cfg[precioKey]) || 0
              recalcCoste(metros, precio)
            }}
            placeholder="Ej: 3.5"
          />
          {Number(cfg[costeKey]) > 0 && (
            <p className="text-[10px] text-amber-300 mt-0.5 font-medium tabular-nums">
              = {Number(cfg[costeKey]).toFixed(2)} €
            </p>
          )}
        </div>
      </div>
    </div>
  )
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
  const { data: garmentTypesData } = useGarmentTypes()
  const bodyGarmentTypeId = garmentTypesData?.find((g) => g.code === 'body')?.id ?? null

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
  const [fabricsStock, setFabricsStock] = useState<{ id: string; fabric_code: string | null; name: string; price_per_meter: number | null; stock_meters: number | null; composition: string | null }[]>([])
  /** Key del popover de tela abierto (tejido o forro). Compone clave como
   *  `${itemKey}-tejido` o `${itemKey}-forro` para que ambos puedan
   *  coexistir abiertos en sub-prendas distintas. */
  const [popoverOpenKey, setPopoverOpenKey] = useState<string | null>(null)
  const [client, setClient] = useState<Record<string, unknown> | null>(null)
  const [clientLoading, setClientLoading] = useState(false)
  const [camiseriaMeasurements, setCamiseriaMeasurements] = useState<Record<string, unknown> | null>(null)
  const [camiseriaMeasurementsLoading, setCamiseriaMeasurementsLoading] = useState(true)

  // Common ficha fields (no per-prenda characteristics)
  const [ficha, setFicha] = useState({
    numeroTalon: '',
    cortador: '',
    situacionTrabajo: 'in_production',
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
    fechaEmision: new Date().toISOString().split('T')[0],
  })

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const getSubSections = (slug: string, label: string) => {
    const subs = getPrendasFromSlug(slug)
    return subs.length > 0 ? subs : [{ slug, label }]
  }

  const addToCart = useCallback((prendaDef: { slug: string; label: string }) => {
    const id = crypto.randomUUID()
    const sections = getPrendasFromSlug(prendaDef.slug)
    const subSections: SubPrenda[] = sections.length > 0 ? sections : [{ slug: prendaDef.slug, label: prendaDef.label }]
    setCartItems(prev => [...prev, { id, slug: prendaDef.slug, label: prendaDef.label, precio: 0 }])
    const initConfigs: Record<string, Record<string, unknown>> = {}
    for (const sp of subSections) initConfigs[`${id}_${sp.slug}`] = defaultPrendaConfig(sp.slug, camiseriaMeasurements, sp.parentSlug)
    setPrendaConfigs(prev => ({ ...prev, ...initConfigs }))
    setShowPrendaSelector(false)
  }, [camiseriaMeasurements])

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

  /** Duplica una prenda del carrito clonando configs y oficiales por
   *  cada sub-prenda, pero vaciando el tejido (las 6 claves) y poniendo
   *  precio=0, coste=undefined. El duplicado se inserta inmediatamente
   *  después del original en el array. */
  const duplicateCartItem = (originalId: string) => {
    const original = cartItems.find(c => c.id === originalId)
    if (!original) return
    const newId = crypto.randomUUID()

    setCartItems(prev => {
      const idx = prev.findIndex(c => c.id === originalId)
      if (idx === -1) return prev
      const copy: CartItem = { ...original, id: newId, precio: 0, coste: undefined }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })

    const sections = getSubSections(original.slug, original.label)
    const prefixOld = `${originalId}_`
    const prefixNew = `${newId}_`

    setPrendaConfigs(prev => {
      const next = { ...prev }
      for (const sp of sections) {
        const oldKey = `${prefixOld}${sp.slug}`
        const srcCfg = prev[oldKey]
        if (!srcCfg) continue
        const clone = (typeof structuredClone === 'function'
          ? structuredClone(srcCfg)
          : JSON.parse(JSON.stringify(srcCfg))) as Record<string, unknown>
        // Vaciar la tela en el duplicado (tejido + forro, tipos respetados).
        clone.tejidoStockId = ''
        clone.tejidoStockNombre = ''
        clone.tejidoCatalogo = ''
        clone.tejidoMetros = ''
        clone.tejidoPrecioMetro = 0
        clone.tejidoCosteMaterial = 0
        clone.forroStockId = ''
        clone.forroStockNombre = ''
        clone.forroCatalogo = ''
        clone.forroMetros = ''
        clone.forroPrecioMetro = 0
        clone.forroCosteMaterial = 0
        next[`${prefixNew}${sp.slug}`] = clone
      }
      return next
    })

    setOficiales(prev => {
      const next = { ...prev }
      for (const sp of sections) {
        const oldKey = `${prefixOld}${sp.slug}`
        if (prev[oldKey] !== undefined) next[`${prefixNew}${sp.slug}`] = prev[oldKey]
      }
      return next
    })
  }

  const setPCField = (itemId: string, subSlug: string, field: string, value: unknown) => {
    const key = `${itemId}_${subSlug}`
    setPrendaConfigs(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: value } }))
  }

  // Seed cart from URL param on mount. Esperamos a que terminen de
  // cargarse las medidas del cliente para poder pre-rellenar los
  // campos de "Configuración técnica" (confXX) en los configs.
  useEffect(() => {
    if (seededRef.current || !prenda || isCamiseria) return
    if (camiseriaMeasurementsLoading) return
    const prendaDef = PRENDAS_DISPONIBLES.find(p => p.slug === prenda)
    if (!prendaDef) return
    seededRef.current = true
    const id = crypto.randomUUID()
    const sections = getPrendasFromSlug(prendaDef.slug)
    const subSections: SubPrenda[] = sections.length > 0 ? sections : [{ slug: prendaDef.slug, label: prendaDef.label }]
    setCartItems([{ id, slug: prendaDef.slug, label: prendaDef.label, precio: 0 }])
    const initConfigs: Record<string, Record<string, unknown>> = {}
    for (const sp of subSections) initConfigs[`${id}_${sp.slug}`] = defaultPrendaConfig(sp.slug, camiseriaMeasurements, sp.parentSlug)
    setPrendaConfigs(initConfigs)
  }, [camiseriaMeasurementsLoading, camiseriaMeasurements, prenda, isCamiseria])

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
  /** Añade una camisa nueva. Para las MEDIDAS, lógica híbrida:
   *  1. Si la última camisa del array tiene medidas rellenas (cuello/canesú/
   *     pecho) → clona sus medidas. Útil cuando el sastre tomó las medidas a
   *     mano en la primera camisa (cliente sin medidas en BD) o las ajustó.
   *  2. Si no → usa las medidas del cliente (`camiseriaMeasurements`).
   *  3. Si tampoco → vacío (cae al `defaultCamisa`).
   *
   *  El resto de campos (tejido, precio, opciones, iniciales, observaciones,
   *  cantidad, etc.) NO se heredan — siempre quedan en defaults. Cada camisa
   *  suele cambiar de tejido y opciones aunque las medidas se repitan. */
  const addCamisa = () => {
    setCamisas((prev) => {
      const last = prev[prev.length - 1]
      const lastHasMedidas = last && (last.cuello || last.canesu || last.pecho)
      const base: CamisaMedidas = lastHasMedidas
        ? pickMedidasFromCamisa(last)
        : getMeasuresFromRecord(camiseriaMeasurements ?? undefined)
      return [...prev, { ...defaultCamisa(), ...base }]
    })
  }
  const removeCamisa = (id: string) => setCamisas((prev) => prev.filter((c) => c.id !== id))
  const updateCamisa = (id: string, field: keyof CamisaItem, value: string | number | boolean | undefined) => {
    setCamisas((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }
  /** Duplica una camisa clonando opciones/medidas pero vaciando
   *  tejido (3 claves) y precio/coste. El duplicado se inserta
   *  inmediatamente después de la original. */
  const duplicateCamisa = (originalId: string) => {
    setCamisas((prev) => {
      const idx = prev.findIndex((c) => c.id === originalId)
      if (idx === -1) return prev
      const original = prev[idx]
      const cloned = (typeof structuredClone === 'function'
        ? structuredClone(original)
        : JSON.parse(JSON.stringify(original))) as CamisaItem
      const copy: CamisaItem = {
        ...cloned,
        id: crypto.randomUUID(),
        tejido: '',
        tejidoStockId: undefined,
        tejidoMetros: undefined,
        precio: 0,
        coste: undefined,
      }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
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
    if (item.stock <= 0) {
      toast.warning(`${item.name} — Sin stock en esta tienda`)
    } else if (item.stock < cantidad) {
      toast.warning(`${item.name} — Stock insuficiente (disponible: ${item.stock})`)
    }
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
    const result: Array<{ slug: string; label: string; precio: number; regalo?: boolean; oficial: string; configuration: Record<string, unknown>; coste?: number }> = []
    for (const item of cartItems) {
      const sections = getSubSections(item.slug, item.label)
      const itemDisplayLabel = getCartItemDisplayLabel(item, cartItems)
      sections.forEach((sp, idx) => {
        const key = `${item.id}_${sp.slug}`
        const config = prendaConfigs[key] ?? {}
        const lineLabel = sp.label === item.label ? itemDisplayLabel : `${sp.label} — ${itemDisplayLabel}`
        // prendaParentSlug se omite del JSON si es undefined; solo se persiste
        // cuando la sub-prenda viene de un padre con prefijo propio en
        // client_measurements (caso frac: confXX bajo frac_*, no americana_*).
        const configuration: Record<string, unknown> = {
          ...config,
          prendaLabel: lineLabel,
          prendaSlug: sp.slug,
        }
        if (sp.parentSlug) configuration.prendaParentSlug = sp.parentSlug
        result.push({
          slug: sp.slug,
          label: lineLabel,
          precio: idx === 0 ? item.precio : 0,
          // El regalo marca TODAS las sub-líneas del ítem (americana+pantalón del
          // traje regalado): así el badge y la ficha lo muestran en cada prenda.
          regalo: item.regalo === true,
          // El coste estimado solo se aplica a la primera sub-prenda (la que recoge el importe)
          coste: idx === 0 ? (Number(item.coste) || 0) : 0,
          oficial: oficiales[key] ?? '',
          configuration,
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
    fechaEmision: ficha.fechaEmision,
    // Tejido y metros viven AHORA por prenda en prendaConfigs[key], no aquí.
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

  // ── Propagación de confXX a las medidas del cliente ─────────────────────
  // Tras crear el pedido, si alguna prenda pantalón/americana/chaleco trae
  // valores confXX distintos a los del cliente en client_measurements, se
  // crea una versión nueva. Si los valores coinciden, no se hace nada (no
  // se genera ruido en historial).
  const propagateConfMeasurementsIfChanged = async (sasLines: Array<{ configuration?: Record<string, unknown> | null }>) => {
    if (!bodyGarmentTypeId) return
    if (!sasLines || sasLines.length === 0) return
    try {
      // 1) Construir las claves prefijadas a partir de las líneas creadas.
      //    El prefijo es prendaParentSlug si existe (ej. frac: las 3
      //    sub-líneas escriben bajo frac_*), si no el prendaSlug propio.
      //    Las CLAVES de confXX siguen dependiendo del slug propio
      //    (americana/pantalon/chaleco tienen listas distintas).
      const newConfKeys: Record<string, string> = {}
      for (const ln of sasLines) {
        const cfg = (ln?.configuration ?? {}) as Record<string, unknown>
        const slug = String(cfg.prendaSlug ?? '').toLowerCase()
        const parentSlug = cfg.prendaParentSlug ? String(cfg.prendaParentSlug).toLowerCase() : undefined
        if (!CONF_NUMERIC_KEYS[slug]) continue
        const prefix = parentSlug ?? slug
        for (const k of CONF_NUMERIC_KEYS[slug]) {
          const v = cfg[k]
          if (v !== null && v !== undefined && v !== '') {
            newConfKeys[`${prefix}_${k}`] = String(v)
          }
        }
        for (const k of CONF_BOOLEAN_KEYS[slug] ?? []) {
          const v = cfg[k]
          if (v === true || v === 'true') {
            newConfKeys[`${prefix}_${k}`] = 'true'
          }
        }
      }
      // 2) Detectar diferencias respecto a las medidas actuales del cliente.
      const measures = camiseriaMeasurements ?? {}
      let hasChanges = false
      const changedKeys: string[] = []
      for (const [k, v] of Object.entries(newConfKeys)) {
        if (String(measures[k] ?? '') !== v) {
          hasChanges = true
          changedKeys.push(k)
        }
      }
      // Detectar también claves desaparecidas: hoy en las medidas del cliente
      // pero NO presentes (o vacías) en la venta nueva → significa que el
      // sastre las quitó conscientemente. El "prefijo tocado" es el prefijo
      // efectivo (parentSlug si lo hay, slug si no); en el caso del frac es
      // 'frac' una sola vez aunque haya 3 sub-líneas.
      const prefixesTocados = new Map<string, Set<string>>()  // prefix → slugs propios que contribuyen claves
      for (const ln of sasLines) {
        const cfg = (ln?.configuration ?? {}) as Record<string, unknown>
        const slug = String(cfg.prendaSlug ?? '').toLowerCase()
        const parentSlug = cfg.prendaParentSlug ? String(cfg.prendaParentSlug).toLowerCase() : undefined
        if (!CONF_NUMERIC_KEYS[slug]) continue
        const prefix = parentSlug ?? slug
        if (!prefixesTocados.has(prefix)) prefixesTocados.set(prefix, new Set())
        prefixesTocados.get(prefix)!.add(slug)
      }
      for (const [prefix, slugs] of prefixesTocados) {
        // Unión de claves de todos los slugs que contribuyen a este prefijo.
        const allKeys = new Set<string>()
        for (const slug of slugs) {
          for (const k of CONF_NUMERIC_KEYS[slug] ?? []) allKeys.add(k)
          for (const k of CONF_BOOLEAN_KEYS[slug] ?? []) allKeys.add(k)
        }
        for (const k of allKeys) {
          const fullKey = `${prefix}_${k}`
          if (measures[fullKey] != null && measures[fullKey] !== '' && newConfKeys[fullKey] === undefined) {
            hasChanges = true
            changedKeys.push(fullKey)
          }
        }
      }
      if (!hasChanges) return

      // 3) Construir el conjunto FULL de claves del body a guardar:
      //    mantenemos las medidas físicas existentes (americana_, pantalon_,
      //    chaleco_, frac_, abrigo_, levita_) y sobre-escribimos solo las
      //    confXX tocadas por esta venta.
      const fullValues: Record<string, string> = {}
      for (const [k, v] of Object.entries(measures)) {
        if (v == null || v === '') continue
        const isBodyKey =
          k.startsWith('americana_') || k.startsWith('pantalon_') ||
          k.startsWith('chaleco_') || k.startsWith('frac_') ||
          k.startsWith('abrigo_') || k.startsWith('levita_')
        if (!isBodyKey) continue
        // Si esta clave es un confXX de un prefijo tocado y NO está en
        // newConfKeys, significa que se eliminó: no la incluimos.
        const prefixForKey = k.split('_')[0]
        const isConfKey = k.includes('_conf')
        if (isConfKey && prefixesTocados.has(prefixForKey) && newConfKeys[k] === undefined) continue
        fullValues[k] = String(v)
      }
      for (const [k, v] of Object.entries(newConfKeys)) fullValues[k] = v

      const saveRes = await saveBodyMeasurements({
        client_id: clientId,
        garment_type_id: bodyGarmentTypeId,
        values: fullValues,
      })
      if (saveRes?.success) {
        console.info('[Ficha] confXX propagados a medidas del cliente:', changedKeys)
      } else {
        console.warn('[Ficha] propagación de confXX fallida:', saveRes)
      }
    } catch (e) {
      console.error('[Ficha] propagateConfMeasurementsIfChanged:', e)
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleCreateOrder = async () => {
    if (!clientId || !defaultStoreId) { toast.error('Faltan cliente o tienda.'); return }
    const hayRegalos = cartItems.some(c => c.regalo === true)
    if (total <= 0 && !hayRegalos) { toast.error('El total debe ser mayor que 0 (o marca las prendas como regalo).'); return }
    // Con regalos marcados, las prendas NO regalo siguen necesitando precio.
    if (cartItems.some(c => !c.regalo && (Number(c.precio) || 0) <= 0)) {
      toast.error('Hay prendas sin precio: indica el PVP o márcalas como regalo.')
      return
    }
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
        prendasSastreria,
        fichaCommon: buildFichaCommon(),
        camisas: camisas.flatMap((c) =>
          Array.from({ length: Math.max(1, c.cantidad) }, () => ({
            cuello: c.cuello, canesu: c.canesu, largoManga: c.largoManga, frentePecho: c.frentePecho,
            pecho: c.pecho, cintura: c.cintura, cadera: c.cadera, largoCuerpo: c.largoCuerpo,
            hombro: c.hombro, punoDerecho: c.punoDerecho, punoIzquierdo: c.punoIzquierdo,
            jareton: c.jareton, bolsillo: c.bolsillo, hombroCaido: c.hombroCaido,
            derecho: c.derecho, izquierdo: c.izquierdo, hombrosAltos: c.hombrosAltos,
            hombrosBajos: c.hombrosBajos, erguido: c.erguido, cargado: c.cargado,
            espaldaLisa: c.espaldaLisa, espPliegues: c.espPliegues,
            espTablonCentr: c.espTablonCentr, espPinzas: c.espPinzas,
            iniciales: c.iniciales, inicialesTexto: c.inicialesTexto,
            inicialesSituacion: c.inicialesSituacion || undefined,
            inicialesColor: c.inicialesColor || undefined,
            modCuello: c.modCuello, puno: c.puno,
            tejido: c.tejido, tejidoStockId: c.tejidoStockId || undefined,
            tejidoMetros: typeof c.tejidoMetros === 'number' ? c.tejidoMetros : undefined,
            precio: Number(c.precio) || 0, obs: c.obs,
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
            // Propaga los confXX de la venta a las medidas del cliente si
            // algún valor difiere del actual. Solo crea versión nueva si
            // realmente hay cambios.
            await propagateConfMeasurementsIfChanged(sasLines)
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
              <div key={item.id} className="py-2 border-b border-white/[0.06] last:border-0 space-y-2">
                <div className="flex items-start gap-3">
                  <span className="text-white flex-1 min-w-0 font-medium pt-2">{getCartItemDisplayLabel(item, cartItems)}</span>
                  <div className="flex flex-col gap-1">
                    <Input
                      type="number" min={0} step={0.01} placeholder={item.regalo ? 'Regalo' : 'PVP'}
                      disabled={item.regalo === true}
                      className="w-28 h-9 bg-white/[0.07] border-white/20 text-white text-sm disabled:opacity-50"
                      value={item.regalo ? '' : (item.precio || '')}
                      onChange={e => setCartItems(prev => prev.map(c => c.id === item.id ? { ...c, precio: parseFloat(e.target.value) || 0 } : c))}
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-white/60 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={item.regalo === true}
                        onChange={e => setCartItems(prev => prev.map(c => c.id === item.id
                          ? { ...c, regalo: e.target.checked, precio: e.target.checked ? 0 : c.precio }
                          : c))}
                        className="h-3.5 w-3.5 accent-[#c9a96e]"
                      />
                      Regalo (0 €)
                    </label>
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
                <Button
                  type="button"
                  onClick={() => duplicateCartItem(item.id)}
                  className="w-full min-h-[48px] gap-2 bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 transition-all"
                  title="Duplicar esta prenda con sus características (sin tejido ni precio)"
                >
                  <Copy className="h-5 w-5" /> Duplicar prenda
                </Button>
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
                    <Input
                      type="date"
                      value={ficha.fechaEmision}
                      onChange={(e) => setFichaField('fechaEmision', e.target.value)}
                      className="mt-1 bg-white/5 border-white/10 text-white"
                    />
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

                        {/* Tejido por sub-prenda */}
                        <FabricBlock
                          itemKey={key}
                          prefix="tejido"
                          label={`TEJIDO DE ${sp.label.toUpperCase()}`}
                          cfg={cfg}
                          setField={setField}
                          fabricsStock={fabricsStock}
                          popoverOpenKey={popoverOpenKey}
                          setPopoverOpenKey={setPopoverOpenKey}
                        />

                        {/* Forro: solo americana (incluida la del frac), abrigo y levita.
                            Pantalón/chaleco (incluso del frac), teba, gabardina, chaqué
                            no muestran el bloque. */}
                        {(sp.slug === 'americana' || sp.slug === 'abrigo' || sp.slug === 'levita') && (() => {
                          const hasForroData = Boolean(
                            cfg.forroStockId
                            || (typeof cfg.forroCatalogo === 'string' && cfg.forroCatalogo.trim())
                            || cfg.forroMetros
                          )
                          const incoherencia = cfg.forro === 'sin_forro' && hasForroData
                          return (
                            <>
                              {incoherencia && (
                                <p className="text-xs text-amber-300 -mb-2 pl-1">
                                  Has marcado &ldquo;Sin forro&rdquo; pero has añadido tela de forro. Revisa la coherencia o ignora si es intencional.
                                </p>
                              )}
                              <FabricBlock
                                itemKey={key}
                                prefix="forro"
                                label={`FORRO DE ${sp.label.toUpperCase()}`}
                                cfg={cfg}
                                setField={setField}
                                fabricsStock={fabricsStock}
                                popoverOpenKey={popoverOpenKey}
                                setPopoverOpenKey={setPopoverOpenKey}
                              />
                            </>
                          )
                        })()}

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
          fabricsStock={fabricsStock}
          addCamisa={addCamisa}
          removeCamisa={removeCamisa}
          duplicateCamisa={duplicateCamisa}
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
          hasGifts={cartItems.some(c => c.regalo === true)}
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
