'use client'

import { useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateOrderAction } from '@/actions/orders'

type Cfg = Record<string, unknown>

function detectType(line: any, cfg: Cfg): 'pantalon' | 'chaleco' | 'camiseria' | 'americana' {
  const slug = (cfg.prendaSlug as string) ?? (cfg.prenda as string) ?? ''
  if (slug === 'pantalon') return 'pantalon'
  if (slug === 'chaleco') return 'chaleco'
  if (cfg.tipo === 'camiseria' || cfg.puno !== undefined) return 'camiseria'
  const garment = (line?.garment_types?.code ?? line?.garment_types?.name ?? '').toString().toLowerCase()
  if (garment.includes('pantal')) return 'pantalon'
  if (garment.includes('chaleco')) return 'chaleco'
  if (garment.includes('camis')) return 'camiseria'
  return 'americana'
}

function defaultsFor(type: 'pantalon' | 'chaleco' | 'camiseria' | 'americana'): Cfg {
  if (type === 'pantalon') return {
    vueltas: 'sin_vueltas', bragueta: 'cremallera', pliegues: 'sin_pliegues', plieguesVal: '',
    p7pasadores: false, p5bolsillos: false, pRefForro: false, pRefExtTela: false,
    pSinBolTrasero: false, p1BolTrasero: false, p2BolTraseros: false,
    pBolCostura: false, pBolFrances: false, pBolVivo: false, pBolOreja: false,
    pCenidores: false, pBotonesTirantes: false, pVEnTrasero: false,
    pretinaCorrida: false, pretina2Botones: false, pretinaTamano: '4', pretinaReforzadaDelante: false,
    confFM: '', confFT: '', confPT: '', confRodalTrasero: '', confBajadaDelantero: '',
    confAlturaTrasero: '', confFormaGemelo: false, confFVSalida: '',
  }
  if (type === 'chaleco') return {
    chalecoCorte: 'recto', chalecoBolsillo: '',
    confF: '', confD: '', confFP: '', confFV: '', confHA: '', confHB: '', confVD: '',
  }
  if (type === 'camiseria') return {
    cuello: '', canesu: '', manga: '', frenPecho: '', contPecho: '',
    cintura: '', cadera: '', largo: '', pIzq: '', pDch: '', hombro: '', biceps: '',
    jareton: false, bolsillo: false, hombroCaido: false, derecho: false, izquierdo: false,
    hombrosAltos: false, hombrosBajos: false, erguido: false, cargado: false,
    espaldaLisa: false, espPliegues: false, espTablonCentr: false, espPinzas: false,
    iniciales: false, inicialesTexto: '', modCuello: '', puno: 'sencillo', tejido: '', obs: '',
  }
  // americana y similares
  return {
    botones: '1fila_2', aberturas: '2aberturas', bolsilloTipo: '', cerrilleraExterior: false,
    primerBoton: '', solapa: 'normal', anchoSolapa: '', manga: 'napolit',
    ojalesAbiertos: '', ojalesCerrados: '', medidaHombro: false, hTerminado: false, hTerminadoVal: '',
    escote: false, escoteVal: '', sinHombreras: false, picado34: false, sinHombrera: false,
    hombrerasTraseras: false, pocaHombrera: false, forro: 'completo',
    confF: '', confD: '', confFP: '', confFV: '', confHA: '', confHB: '', confVD: '',
  }
}

interface EditFichaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: any
  line: any
  onSaved?: () => void
}

export function EditFichaDialog({ open, onOpenChange, order, line, onSaved }: EditFichaDialogProps) {
  const initialCfg = useMemo<Cfg>(() => (line?.configuration as Cfg) ?? {}, [line?.configuration])
  const type = useMemo(() => detectType(line, initialCfg), [line, initialCfg])
  const [cfg, setCfg] = useState<Cfg>(() => ({ ...defaultsFor(type), ...initialCfg }))
  const [saving, setSaving] = useState(false)

  const set = <T,>(field: string, value: T) => setCfg((prev) => ({ ...prev, [field]: value }))
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const bool = (v: unknown) => !!v

  const prendaName = String(initialCfg.prendaLabel ?? initialCfg.product_name ?? line?.garment_types?.name ?? 'prenda')

  const handleSubmit = async () => {
    // Reenviamos TODAS las líneas (preservando campos intactos) cambiando solo la configuration de la editada.
    const allLines = (order?.tailoring_order_lines ?? []) as any[]
    const payloadLines = allLines.map((l: any, i: number) => ({
      id: l.id,
      garment_type_id: l.garment_type_id,
      line_type: l.line_type,
      unit_price: Number(l.unit_price ?? 0),
      discount_percentage: Number(l.discount_percentage ?? 0),
      tax_rate: Number(l.tax_rate ?? 21),
      material_cost: Number(l.material_cost ?? 0),
      labor_cost: Number(l.labor_cost ?? 0),
      factory_cost: Number(l.factory_cost ?? 0),
      fabric_id: l.fabric_id ?? null,
      fabric_description: l.fabric_description ?? null,
      fabric_meters: l.fabric_meters ?? null,
      supplier_id: l.supplier_id ?? null,
      model_name: l.model_name ?? null,
      model_size: l.model_size ?? null,
      finishing_notes: l.finishing_notes ?? null,
      configuration: l.id === line.id ? { ...(l.configuration as Cfg), ...cfg } : (l.configuration ?? {}),
      sort_order: l.sort_order ?? i,
    }))

    setSaving(true)
    const res = await updateOrderAction({
      orderId: order.id,
      lines: payloadLines,
    })
    setSaving(false)
    if (!res.success) { toast.error(res.error || 'No se pudo guardar la ficha'); return }
    toast.success('Ficha actualizada')
    onOpenChange(false)
    onSaved?.()
  }

  // ─── Sub-renders ──────────────────────────────────────────────────────────
  const RadioGroup = ({ name, value, options, onChange }: { name: string; value: unknown; options: Array<{ v: string; label: string }>; onChange: (v: string) => void }) => (
    <div className="flex flex-wrap gap-3">
      {options.map(({ v, label }) => (
        <label key={v} className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  )

  const CheckboxGrid = ({ items }: { items: Array<{ k: string; label: string }> }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map(({ k, label }) => (
        <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={bool(cfg[k])} onChange={(e) => set(k, e.target.checked)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  )

  // ─── Secciones por tipo ───────────────────────────────────────────────────
  const PantalonSection = () => (
    <>
      <div className="space-y-1">
        <Label>Vueltas</Label>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="vueltas" checked={cfg.vueltas === 'sin_vueltas'} onChange={() => set('vueltas', 'sin_vueltas')} />
            <span>Sin vueltas</span>
          </label>
          <span className="text-muted-foreground text-sm self-center">Con vuelta:</span>
          {['3.5', '4', '4.5', '5'].map((v) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" name="vueltas" checked={cfg.vueltas === v} onChange={() => set('vueltas', v)} />
              <span>{v} cm</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Bragueta</Label>
        <RadioGroup name="bragueta" value={cfg.bragueta} onChange={(v) => set('bragueta', v)}
          options={[{ v: 'cremallera', label: 'Br. cremallera' }, { v: 'botones', label: 'Br. botones' }]} />
      </div>

      <div className="space-y-1">
        <Label>Pliegues</Label>
        <div className="flex items-center gap-3 flex-wrap">
          {[{ v: 'sin_pliegues', label: 'Sin pliegues' }, { v: '1_pliegue', label: '1 pliegue' }, { v: '2_pliegues', label: '2 pliegues' }].map(({ v, label }) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" name="pliegues" checked={cfg.pliegues === v} onChange={() => set('pliegues', v)} />
              <span>{label}</span>
            </label>
          ))}
          <Input className="h-7 w-20" value={str(cfg.plieguesVal)} onChange={(e) => set('plieguesVal', e.target.value)} placeholder="cm" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Bolsillos y detalles</Label>
        <CheckboxGrid items={[
          { k: 'p7pasadores', label: '7 pasadores' }, { k: 'p5bolsillos', label: '5 bolsillos' },
          { k: 'pRefForro', label: 'Ref. forro' }, { k: 'pRefExtTela', label: 'Ref. ext. tela' },
          { k: 'pSinBolTrasero', label: 'Sin bol. trasero' }, { k: 'p1BolTrasero', label: '1 bol. trasero' },
          { k: 'p2BolTraseros', label: '2 bol. traseros' }, { k: 'pBolCostura', label: 'Bol. costura' },
          { k: 'pBolFrances', label: 'Bol. francés' }, { k: 'pBolVivo', label: 'Bol. vivo' }, { k: 'pBolOreja', label: 'Bol. oreja' },
          { k: 'pCenidores', label: 'Ceñidores costados' }, { k: 'pBotonesTirantes', label: 'Botones tirantes' },
          { k: 'pVEnTrasero', label: 'V en trasero' },
        ]} />
      </div>

      <div className="space-y-2">
        <Label>Pretina</Label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={bool(cfg.pretinaCorrida)} onChange={(e) => set('pretinaCorrida', e.target.checked)} />
          <span>Pretina corrida a 13 y un pasador a 7 en pico</span>
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={bool(cfg.pretina2Botones)} onChange={(e) => set('pretina2Botones', e.target.checked)} />
            <span>Pretina de dos botones en punta</span>
          </label>
          {bool(cfg.pretina2Botones) && (
            <div className="flex gap-3">
              {['4', '4.5', '5'].map((v) => (
                <label key={v} className="flex items-center gap-1 cursor-pointer text-sm">
                  <input type="radio" name="pretinaTamano" checked={cfg.pretinaTamano === v} onChange={() => set('pretinaTamano', v)} />
                  <span>{v} cm</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={bool(cfg.pretinaReforzadaDelante)} onChange={(e) => set('pretinaReforzadaDelante', e.target.checked)} />
          <span>Pretina reforzada por delante</span>
        </label>
      </div>

      <div className="space-y-1">
        <Label>Configuración</Label>
        <div className="flex flex-wrap gap-3">
          {[
            { k: 'confFM', label: 'FM' }, { k: 'confFT', label: 'FT' }, { k: 'confPT', label: 'PT' },
            { k: 'confRodalTrasero', label: 'Rodal trasero' }, { k: 'confBajadaDelantero', label: 'Bajada delantero' },
            { k: 'confAlturaTrasero', label: 'Altura trasero' }, { k: 'confFVSalida', label: 'FV con salida' },
          ].map(({ k, label }) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{label}</span>
              <Input className="h-8 w-20" value={str(cfg[k])} onChange={(e) => set(k, e.target.value)} placeholder="—" />
            </div>
          ))}
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={bool(cfg.confFormaGemelo)} onChange={(e) => set('confFormaGemelo', e.target.checked)} />
            <span>Forma gemelo</span>
          </label>
        </div>
      </div>
    </>
  )

  const ChalecoSection = () => (
    <>
      <div className="space-y-1">
        <Label>Corte</Label>
        <RadioGroup name="chalecoCorte" value={cfg.chalecoCorte} onChange={(v) => set('chalecoCorte', v)}
          options={[{ v: 'recto', label: 'Recto' }, { v: 'cruzado', label: 'Cruzado' }]} />
      </div>
      <div className="space-y-1">
        <Label>Bolsillo</Label>
        <RadioGroup name="chalecoBolsillo" value={cfg.chalecoBolsillo} onChange={(v) => set('chalecoBolsillo', v)}
          options={[{ v: 'cartera', label: 'Bols. cartera' }, { v: 'vivo', label: 'Bolsillo vivo' }]} />
      </div>
      <div className="space-y-1">
        <Label>Configuración</Label>
        <div className="flex flex-wrap gap-3">
          {[
            { k: 'confF', label: 'F' }, { k: 'confD', label: 'D' }, { k: 'confFP', label: 'FP' },
            { k: 'confFV', label: 'FV' }, { k: 'confHA', label: 'HA' }, { k: 'confHB', label: 'HB' }, { k: 'confVD', label: 'VD' },
          ].map(({ k, label }) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{label}</span>
              <Input className="h-8 w-20" value={str(cfg[k])} onChange={(e) => set(k, e.target.value)} placeholder="—" />
            </div>
          ))}
        </div>
      </div>
    </>
  )

  const AmericanaSection = () => (
    <>
      <div className="space-y-1">
        <Label>Botones</Label>
        <RadioGroup name="botones" value={cfg.botones} onChange={(v) => set('botones', v)}
          options={[
            { v: '1fila_1', label: '1 Fila 1 botón' }, { v: '1fila_2', label: '1 Fila 2 botones' },
            { v: '1fila_3para2', label: '1 Fila 3 para 2' }, { v: '2filas_6', label: '2 Filas 6 btns 2 adorno' },
          ]} />
      </div>
      <div className="space-y-1">
        <Label>Aberturas</Label>
        <RadioGroup name="aberturas" value={cfg.aberturas} onChange={(v) => set('aberturas', v)}
          options={[{ v: '2aberturas', label: '2 Aberturas' }, { v: '1abertura', label: '1 Abertura' }, { v: 'sin_abertura', label: 'Sin abertura' }]} />
      </div>
      <div className="space-y-1">
        <Label>Bolsillos</Label>
        <RadioGroup name="bolsilloTipo" value={cfg.bolsilloTipo} onChange={(v) => set('bolsilloTipo', v)}
          options={[
            { v: 'recto', label: 'Bolsillo recto' }, { v: 'inclinado', label: 'Bol. inclinado' },
            { v: 'parche', label: 'Bolsillo parche' }, { v: 'bercheta', label: 'Bol. pecho bercheta' },
            { v: 'bercheta_parche', label: 'Bol. pecho parche bercheta' },
          ]} />
        <div className="flex items-center gap-3 mt-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={bool(cfg.cerrilleraExterior)} onChange={(e) => set('cerrilleraExterior', e.target.checked)} />
            <span>Cerillera exterior</span>
          </label>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Primer botón</Label>
            <Input className="h-8 w-24" value={str(cfg.primerBoton)} onChange={(e) => set('primerBoton', e.target.value)} placeholder="cm" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Solapa</Label>
        <div className="flex flex-wrap items-center gap-3">
          <RadioGroup name="solapa" value={cfg.solapa} onChange={(v) => set('solapa', v)}
            options={[{ v: 'normal', label: 'Normal' }, { v: 'pico', label: 'Pico' }, { v: 'chal', label: 'Chal' }]} />
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Ancho</Label>
            <Input className="h-8 w-20" value={str(cfg.anchoSolapa)} onChange={(e) => set('anchoSolapa', e.target.value)} placeholder="cm" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Manga</Label>
        <RadioGroup name="manga" value={cfg.manga} onChange={(v) => set('manga', v)}
          options={[
            { v: 'napolit', label: 'Napolitana' }, { v: 'reborde', label: 'Reborde' },
            { v: 'sin_reborde', label: 'Sin reborde' }, { v: 'con_reborde', label: 'Con reborde' },
          ]} />
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Ojales abiertos</Label>
            <Input className="h-9" value={str(cfg.ojalesAbiertos)} onChange={(e) => set('ojalesAbiertos', e.target.value)} placeholder="nº" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Ojales cerrados</Label>
            <Input className="h-9" value={str(cfg.ojalesCerrados)} onChange={(e) => set('ojalesCerrados', e.target.value)} placeholder="nº" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Hombros</Label>
        <CheckboxGrid items={[
          { k: 'medidaHombro', label: 'Medida hombro' }, { k: 'sinHombreras', label: 'Sin hombreras' },
          { k: 'picado34', label: 'Picado 3/4 todo' }, { k: 'sinHombrera', label: 'Sin hombrera' },
          { k: 'hombrerasTraseras', label: 'Hombreras traseras' }, { k: 'pocaHombrera', label: 'Poca hombrera' },
        ]} />
        <div className="flex flex-wrap items-center gap-4 mt-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={bool(cfg.hTerminado)} onChange={(e) => set('hTerminado', e.target.checked)} />
            <span>H. terminado</span>
            <Input className="h-7 w-20" value={str(cfg.hTerminadoVal)} onChange={(e) => set('hTerminadoVal', e.target.value)} placeholder="cm" />
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={bool(cfg.escote)} onChange={(e) => set('escote', e.target.checked)} />
            <span>Escote</span>
            <Input className="h-7 w-20" value={str(cfg.escoteVal)} onChange={(e) => set('escoteVal', e.target.value)} placeholder="cm" />
          </label>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Forro</Label>
        <RadioGroup name="forro" value={cfg.forro} onChange={(v) => set('forro', v)}
          options={[{ v: 'sin_forro', label: 'Sin forro' }, { v: 'medio', label: 'Medio forro' }, { v: 'completo', label: 'Forro completo' }]} />
      </div>
      <div className="space-y-1">
        <Label>Configuración</Label>
        <div className="flex flex-wrap gap-3">
          {[
            { k: 'confF', label: 'F' }, { k: 'confD', label: 'D' }, { k: 'confFP', label: 'FP' },
            { k: 'confFV', label: 'FV' }, { k: 'confHA', label: 'HA' }, { k: 'confHB', label: 'HB' }, { k: 'confVD', label: 'VD' },
          ].map(({ k, label }) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{label}</span>
              <Input className="h-8 w-20" value={str(cfg[k])} onChange={(e) => set(k, e.target.value)} placeholder="—" />
            </div>
          ))}
        </div>
      </div>
    </>
  )

  const CamiseriaSection = () => {
    const MEDIDAS: Array<{ label: string; field: string }> = [
      { label: 'Cuello', field: 'cuello' }, { label: 'Canesú', field: 'canesu' }, { label: 'Manga', field: 'manga' },
      { label: 'Fren.Pecho', field: 'frenPecho' }, { label: 'Cont.Pecho', field: 'contPecho' },
      { label: 'Cintura', field: 'cintura' }, { label: 'Cadera', field: 'cadera' }, { label: 'Lar.Cuerpo', field: 'largo' },
      { label: 'P.Izq', field: 'pIzq' }, { label: 'P.Dch', field: 'pDch' }, { label: 'Hombro', field: 'hombro' }, { label: 'Bíceps', field: 'biceps' },
    ]
    return (
      <>
        <div className="space-y-1">
          <Label>Medidas</Label>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {MEDIDAS.map((m) => (
              <div key={m.field}>
                <Label className="text-xs text-muted-foreground">{m.label}</Label>
                <Input className="h-9" value={str(cfg[m.field])} onChange={(e) => set(m.field, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Opciones</Label>
          <CheckboxGrid items={[
            { k: 'jareton', label: 'Jaretón' }, { k: 'bolsillo', label: 'Bolsillo' },
            { k: 'hombroCaido', label: 'Hombro caído' }, { k: 'derecho', label: 'Derecho' },
            { k: 'izquierdo', label: 'Izquierdo' }, { k: 'hombrosAltos', label: 'Hombros altos' },
            { k: 'hombrosBajos', label: 'Hombros bajos' }, { k: 'erguido', label: 'Erguido' },
            { k: 'cargado', label: 'Cargado' }, { k: 'espaldaLisa', label: 'Espalda lisa' },
            { k: 'espPliegues', label: 'Esp. pliegues' }, { k: 'espTablonCentr', label: 'Esp. tablón central' },
            { k: 'espPinzas', label: 'Esp. pinzas' }, { k: 'iniciales', label: 'Iniciales' },
          ]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {bool(cfg.iniciales) && (
            <div>
              <Label className="text-xs text-muted-foreground">Texto iniciales</Label>
              <Input className="h-9" value={str(cfg.inicialesTexto)} onChange={(e) => set('inicialesTexto', e.target.value)} placeholder="Ej: J.G.M." />
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Mod. cuello</Label>
            <Input className="h-9" value={str(cfg.modCuello)} onChange={(e) => set('modCuello', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Puño</Label>
          <RadioGroup name="puno" value={cfg.puno} onChange={(v) => set('puno', v)}
            options={[
              { v: 'sencillo', label: 'Sencillo' }, { v: 'gemelo', label: 'Gemelo' },
              { v: 'mixto', label: 'Mixto' }, { v: 'mosquetero', label: 'Mosquetero' }, { v: 'otro', label: 'Otro' },
            ]} />
        </div>
        <div className="space-y-1">
          <Label>Tejido</Label>
          <Input value={str(cfg.tejido)} onChange={(e) => set('tejido', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Observaciones de camisa</Label>
          <Textarea rows={2} value={str(cfg.obs)} onChange={(e) => set('obs', e.target.value)} />
        </div>
      </>
    )
  }

  // ─── Render principal ─────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar ficha — {prendaName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Campos comunes */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Datos comunes</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Cortador</Label>
                <Input value={str(cfg.cortador)} onChange={(e) => set('cortador', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Oficial</Label>
                <Input value={str(cfg.oficial)} onChange={(e) => set('oficial', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tejido</Label>
                <Input
                  value={str(cfg.tejidoStockNombre ?? cfg.tejidoCatalogo ?? cfg.tejido)}
                  onChange={(e) => set('tejidoCatalogo', e.target.value)}
                  placeholder="Nombre o referencia"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observaciones (comunes)</Label>
              <Textarea rows={2} value={str(cfg.observaciones)} onChange={(e) => set('observaciones', e.target.value)} />
            </div>
          </section>

          {/* Sección específica por tipo */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold">
              {type === 'pantalon' && 'Configuración del pantalón'}
              {type === 'chaleco' && 'Configuración del chaleco'}
              {type === 'camiseria' && 'Configuración de camisa'}
              {type === 'americana' && 'Configuración de la prenda'}
            </h3>
            {type === 'pantalon' && <PantalonSection />}
            {type === 'chaleco' && <ChalecoSection />}
            {type === 'camiseria' && <CamiseriaSection />}
            {type === 'americana' && <AmericanaSection />}
          </section>

          {/* Características / notas de prenda (no aplica a camisería porque allí ya está obs) */}
          {type !== 'camiseria' && (
            <section className="space-y-1">
              <Label>Características de la prenda</Label>
              <Textarea
                rows={3}
                placeholder="Notas, detalles especiales, indicaciones para el oficial..."
                value={str(cfg.caracteristicasPrenda)}
                onChange={(e) => set('caracteristicasPrenda', e.target.value)}
              />
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1 bg-prats-navy hover:bg-prats-navy-light">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
