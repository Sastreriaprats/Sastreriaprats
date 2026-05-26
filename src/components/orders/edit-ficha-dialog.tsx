'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Loader2, Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { updateOrderAction } from '@/actions/orders'
import { listActiveFabricsForFicha } from '@/actions/fabrics'
import { createClient } from '@/lib/supabase/client'

type OfficialOption = { id: string; name: string; specialty?: string | null }

type Cfg = Record<string, unknown>

/** Props que reciben las secciones por tipo de prenda. El state y los setters
 *  viven en `EditFichaDialog`; las secciones son puramente presentacionales. */
interface SectionProps {
  cfg: Cfg
  set: <T,>(field: string, value: T) => void
  bool: (v: unknown) => boolean
  str: (v: unknown) => string
}

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
  // Sin valores marcados por defecto en radios: el sastre los pone al rellenar
  // (consistente con defaultPrendaConfig del flujo de nueva venta).
  if (type === 'pantalon') return {
    vueltas: '', bragueta: '', pliegues: '', plieguesVal: '',
    p7pasadores: false, p5bolsillos: false, pRefForro: false, pRefExtTela: false,
    pSinBolTrasero: false, p1BolTrasero: false, p2BolTraseros: false,
    pBolCostura: false, pBolFrances: false, pBolVivo: false, pBolOreja: false,
    pCenidores: false, pBotonesTirantes: false, pVEnTrasero: false,
    pretinaCorrida: false, pretina2Botones: false, pretinaTamano: '', pretinaReforzadaDelante: false, pretinaReforzada: false,
    confFM: '', confFT: '', confPT: '', confMuslo: '', confRodalTrasero: '', confBajadaDelantero: '',
    confAlturaTrasero: '', confFormaGemelo: false, confFVSalida: '',
  }
  if (type === 'chaleco') return {
    chalecoCorte: '', chalecoBolsillo: '',
    confF: '', confD: '', confFP: '', confFV: '', confHA: '', confHB: '', confVD: '',
  }
  if (type === 'camiseria') return {
    cuello: '', canesu: '', largoManga: '', frentePecho: '', pecho: '',
    cintura: '', cadera: '', largoCuerpo: '', hombro: '', punoDerecho: '', punoIzquierdo: '',
    jareton: false, bolsillo: false, hombroCaido: false, derecho: false, izquierdo: false,
    hombrosAltos: false, hombrosBajos: false, erguido: false, cargado: false,
    espaldaLisa: false, espPliegues: false, espTablonCentr: false, espPinzas: false,
    iniciales: false, inicialesTexto: '', inicialesSituacion: '', inicialesColor: '',
    modCuello: '', puno: '', tejido: '', obs: '',
  }
  // americana y similares
  return {
    botones: '', aberturas: '', bolsilloTipo: '', cerrilleraExterior: false,
    primerBoton: '', solapa: '', anchoSolapa: '', manga: '',
    ojalesAbiertos: '', ojalesCerrados: '', hTerminado: false, hTerminadoVal: '',
    escote: false, escoteVal: '', sinHombreras: false, picado34: false, sinHombrera: false,
    hombrerasTraseras: false, pocaHombrera: false, forro: '',
    confF: '', confD: '', confFP: '', confFV: '', confHA: '', confHB: '', confVD: '',
  }
}

// ─── Sub-componentes (top-level del módulo) ────────────────────────────────
//
// IMPORTANTE: estas funciones viven FUERA de EditFichaDialog deliberadamente.
// Si se declaran dentro del padre, React las trata como referencias nuevas en
// cada render y desmonta/remonta sus inputs en cada keystroke — el iPad pierde
// el foco del Textarea de "Observaciones" tras teclear una letra (bug real).
// Top-level + props evita el problema.

function RadioGroup({ name, value, options, onChange }: {
  name: string
  value: unknown
  options: Array<{ v: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map(({ v, label }) => (
        <label key={v} className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  )
}

function CheckboxGrid({ items, cfg, set, bool }: {
  items: Array<{ k: string; label: string }>
} & SectionProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map(({ k, label }) => (
        <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={bool(cfg[k])} onChange={(e) => set(k, e.target.checked)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  )
}

function PantalonSection({ cfg, set, bool, str }: SectionProps) {
  return (
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
        <CheckboxGrid cfg={cfg} set={set} bool={bool} str={str} items={[
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={bool(cfg.pretinaReforzadaDelante)} onChange={(e) => set('pretinaReforzadaDelante', e.target.checked)} />
            <span>Pretina reforzada por delante</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={bool(cfg.pretinaReforzada)} onChange={(e) => set('pretinaReforzada', e.target.checked)} />
            <span>Pretina reforzada</span>
          </label>
        </div>
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
}

function ChalecoSection({ cfg, set, str }: SectionProps) {
  return (
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
}

function AmericanaSection({ cfg, set, bool, str }: SectionProps) {
  return (
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
        <CheckboxGrid cfg={cfg} set={set} bool={bool} str={str} items={[
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
}

function CamiseriaSection({ cfg, set, bool, str }: SectionProps) {
  const MEDIDAS: Array<{ label: string; field: string; fallbacks?: string[] }> = [
    { label: 'Cuello', field: 'cuello' },
    { label: 'Canesú', field: 'canesu' },
    { label: 'Largo manga', field: 'largoManga', fallbacks: ['largo_manga', 'manga'] },
    { label: 'Frente pecho', field: 'frentePecho', fallbacks: ['frente_pecho', 'frenPecho'] },
    { label: 'Pecho', field: 'pecho', fallbacks: ['cont_pecho', 'contPecho'] },
    { label: 'Cintura', field: 'cintura' },
    { label: 'Cadera', field: 'cadera' },
    { label: 'Largo cuerpo', field: 'largoCuerpo', fallbacks: ['largo_cuerpo', 'largo'] },
    { label: 'Hombro', field: 'hombro' },
    { label: 'Puño dch', field: 'punoDerecho', fallbacks: ['puno_derecho'] },
    { label: 'Puño izq', field: 'punoIzquierdo', fallbacks: ['puno_izquierdo'] },
  ]
  const readMedida = (m: { field: string; fallbacks?: string[] }) => {
    const candidates = [m.field, ...(m.fallbacks ?? [])]
    for (const k of candidates) {
      const v = cfg[k]
      if (v !== undefined && v !== null && String(v) !== '') return str(v)
    }
    return ''
  }
  return (
    <>
      <div className="space-y-1">
        <Label>Medidas</Label>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {MEDIDAS.map((m) => (
            <div key={m.field}>
              <Label className="text-xs text-muted-foreground">{m.label}</Label>
              <Input className="h-9" value={readMedida(m)} onChange={(e) => set(m.field, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label>Opciones</Label>
        <CheckboxGrid cfg={cfg} set={set} bool={bool} str={str} items={[
          { k: 'jareton', label: 'Jaretón' }, { k: 'bolsillo', label: 'Bolsillo' },
          { k: 'hombroCaido', label: 'Hombro caído' }, { k: 'derecho', label: 'Derecho' },
          { k: 'izquierdo', label: 'Izquierdo' }, { k: 'hombrosAltos', label: 'Hombros altos' },
          { k: 'hombrosBajos', label: 'Hombros bajos' }, { k: 'erguido', label: 'Erguido' },
          { k: 'cargado', label: 'Cargado' }, { k: 'espaldaLisa', label: 'Espalda lisa' },
          { k: 'espPliegues', label: 'Esp. pliegues' }, { k: 'espTablonCentr', label: 'Esp. tablón central' },
          { k: 'espPinzas', label: 'Esp. pinzas' }, { k: 'iniciales', label: 'Iniciales' },
        ]} />
      </div>
      {bool(cfg.iniciales) && (
        <div className="grid grid-cols-3 gap-3 rounded-md border border-dashed p-3">
          <div>
            <Label className="text-xs text-muted-foreground">Texto iniciales</Label>
            <Input className="h-9" value={str(cfg.inicialesTexto)} onChange={(e) => set('inicialesTexto', e.target.value)} placeholder="Ej: J.G.M." />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Situación</Label>
            <Select value={str(cfg.inicialesSituacion) || undefined} onValueChange={(v) => set('inicialesSituacion', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="puno_derecho">Puño derecho</SelectItem>
                <SelectItem value="puno_izquierdo">Puño izquierdo</SelectItem>
                <SelectItem value="pecho">Pecho</SelectItem>
                <SelectItem value="talle">Talle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Color bordado</Label>
            <Input className="h-9" value={str(cfg.inicialesColor)} onChange={(e) => set('inicialesColor', e.target.value)} placeholder="Color" />
          </div>
        </div>
      )}
      <div>
        <Label className="text-xs text-muted-foreground">Mod. cuello</Label>
        <Input className="h-9" value={str(cfg.modCuello)} onChange={(e) => set('modCuello', e.target.value)} />
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

// ─── Componente principal ──────────────────────────────────────────────────

interface EditFichaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: any
  line: any
  onSaved?: () => void
}

export function EditFichaDialog({ open, onOpenChange, order, line, onSaved }: EditFichaDialogProps) {
  const initialCfg = useMemo<Cfg>(() => {
    const base = (line?.configuration as Cfg) ?? {}
    // Si el pedido se creó desde el wizard de admin, el tejido vive en
    // columnas dedicadas (line.fabric_id / fabric_description) y no en
    // configuration. Lo traemos aquí para que se vea y se pueda editar.
    const hasConfigTejido = base.tejidoStockId || base.tejidoStockNombre || base.tejidoCatalogo || base.tejido
    if (!hasConfigTejido && line?.fabric_id) {
      return {
        ...base,
        tejidoStockId: String(line.fabric_id),
        tejidoStockNombre: String(line.fabric_description ?? ''),
      }
    }
    if (!hasConfigTejido && line?.fabric_description) {
      return { ...base, tejidoCatalogo: String(line.fabric_description) }
    }
    return base
  }, [line?.configuration, line?.fabric_id, line?.fabric_description])
  const type = useMemo(() => detectType(line, initialCfg), [line, initialCfg])
  const [cfg, setCfg] = useState<Cfg>(() => ({ ...defaultsFor(type), ...initialCfg }))
  const [saving, setSaving] = useState(false)
  const [fabricsStock, setFabricsStock] = useState<Array<{ id: string; fabric_code: string | null; name: string }>>([])
  const [tejidoPopoverOpen, setTejidoPopoverOpen] = useState(false)

  // Selectores buscables para Cortador y Oficial (configuration.cortador /
  // configuration.oficial en el JSONB de la línea — son strings libres, no FK).
  // Cortador: officials con specialty ILIKE '%Cortador%'.
  // Oficial : officials con specialty NOT ILIKE '%Cortador%'.
  // Permite también texto libre: cualquier texto escrito se preserva en cfg
  // aunque no matchee a ninguno de la lista.
  const [cortadorPopoverOpen, setCortadorPopoverOpen] = useState(false)
  const [cortadorSearch, setCortadorSearch] = useState('')
  const [cortadorResults, setCortadorResults] = useState<OfficialOption[]>([])
  const [isSearchingCortador, setIsSearchingCortador] = useState(false)

  const [oficialPopoverOpen, setOficialPopoverOpen] = useState(false)
  const [oficialSearch, setOficialSearch] = useState('')
  const [oficialResults, setOficialResults] = useState<OfficialOption[]>([])
  const [isSearchingOficial, setIsSearchingOficial] = useState(false)

  useEffect(() => {
    if (open) {
      setCfg({ ...defaultsFor(type), ...initialCfg })
    }
  }, [open, line?.id])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    listActiveFabricsForFicha().then((res) => {
      if (cancelled) return
      if (res?.success && Array.isArray(res.data)) setFabricsStock(res.data)
    }).catch((err) => console.error('[EditFichaDialog] fabrics:', err))
    return () => { cancelled = true }
  }, [open])

  // Búsqueda de cortadores (debounce 300ms cuando hay término; inmediato cuando
  // está vacío para mostrar la lista por defecto al abrir el Popover).
  useEffect(() => {
    if (!cortadorPopoverOpen) return
    const term = cortadorSearch.trim()
    const timeout = setTimeout(async () => {
      setIsSearchingCortador(true)
      const sb = createClient()
      let q = sb.from('officials')
        .select('id, name, specialty')
        .ilike('specialty', '%Cortador%')
        .eq('is_active', true)
        .order('name')
        .limit(10)
      if (term) q = q.ilike('name', `%${term}%`)
      const { data } = await q
      if (data) setCortadorResults(data as OfficialOption[])
      setIsSearchingCortador(false)
    }, term ? 300 : 0)
    return () => clearTimeout(timeout)
  }, [cortadorPopoverOpen, cortadorSearch])

  // Búsqueda de oficiales (mismo patrón, excluyendo cortadores).
  useEffect(() => {
    if (!oficialPopoverOpen) return
    const term = oficialSearch.trim()
    const timeout = setTimeout(async () => {
      setIsSearchingOficial(true)
      const sb = createClient()
      let q = sb.from('officials')
        .select('id, name, specialty')
        .not('specialty', 'ilike', '%Cortador%')
        .eq('is_active', true)
        .order('name')
        .limit(10)
      if (term) q = q.ilike('name', `%${term}%`)
      const { data } = await q
      if (data) setOficialResults(data as OfficialOption[])
      setIsSearchingOficial(false)
    }, term ? 300 : 0)
    return () => clearTimeout(timeout)
  }, [oficialPopoverOpen, oficialSearch])

  const set = <T,>(field: string, value: T) => setCfg((prev) => ({ ...prev, [field]: value }))
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const bool = (v: unknown) => !!v

  const prendaName = String(initialCfg.prendaLabel ?? initialCfg.product_name ?? line?.garment_types?.name ?? 'prenda')

  const handleSubmit = async () => {
    // Reenviamos TODAS las líneas (preservando campos intactos) cambiando solo la configuration de la editada.
    const allLines = (order?.tailoring_order_lines ?? []) as any[]
    const payloadLines = allLines.map((l: any, i: number) => {
      const isEdited = l.id === line.id
      // Para la línea editada, sincronizamos también las columnas
      // fabric_id / fabric_description con lo elegido en el buscador.
      const editedFabricId = isEdited
        ? (cfg.tejidoStockId ? String(cfg.tejidoStockId) : null)
        : (l.fabric_id ?? null)
      const editedFabricDescription = isEdited
        ? String(cfg.tejidoStockNombre ?? cfg.tejidoCatalogo ?? cfg.tejido ?? '') || null
        : (l.fabric_description ?? null)
      return {
        id: l.id,
        garment_type_id: l.garment_type_id,
        line_type: l.line_type,
        unit_price: Number(l.unit_price ?? 0),
        discount_percentage: Number(l.discount_percentage ?? 0),
        tax_rate: Number(l.tax_rate ?? 21),
        material_cost: Number(l.material_cost ?? 0),
        labor_cost: Number(l.labor_cost ?? 0),
        factory_cost: Number(l.factory_cost ?? 0),
        fabric_id: editedFabricId,
        fabric_description: editedFabricDescription,
        fabric_meters: l.fabric_meters ?? null,
        supplier_id: l.supplier_id ?? null,
        model_name: l.model_name ?? null,
        model_size: l.model_size ?? null,
        finishing_notes: l.finishing_notes ?? null,
        configuration: isEdited ? { ...(l.configuration as Cfg), ...cfg } : (l.configuration ?? {}),
        sort_order: l.sort_order ?? i,
      }
    })

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
                <Popover
                  open={cortadorPopoverOpen}
                  onOpenChange={(open) => {
                    setCortadorPopoverOpen(open)
                    if (open) setCortadorSearch(str(cfg.cortador))
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={cortadorPopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {str(cfg.cortador) || <span className="text-muted-foreground">Buscar o escribir cortador...</span>}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar cortador..."
                        value={cortadorSearch}
                        onValueChange={(v) => {
                          setCortadorSearch(v)
                          // Texto libre: lo escrito se guarda como cfg.cortador
                          // aunque no matchee a ninguno de la lista.
                          set('cortador', v)
                        }}
                      />
                      <CommandList>
                        {isSearchingCortador && <Loader2 className="h-4 w-4 animate-spin mx-auto my-2" />}
                        <CommandEmpty className="py-3 px-3 text-xs text-muted-foreground">
                          Sin cortadores con ese texto. Lo escrito se guarda como texto libre.
                        </CommandEmpty>
                        <CommandGroup>
                          {cortadorResults.map((o) => {
                            const selected = str(cfg.cortador) === o.name
                            return (
                              <CommandItem
                                key={o.id}
                                value={`${o.name} ${o.specialty ?? ''}`}
                                onSelect={() => {
                                  set('cortador', o.name)
                                  setCortadorSearch(o.name)
                                  setCortadorPopoverOpen(false)
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${selected ? 'opacity-100' : 'opacity-0'}`} />
                                <div className="flex items-center justify-between w-full">
                                  <span>{o.name}</span>
                                  {o.specialty && <span className="text-xs text-muted-foreground">{o.specialty}</span>}
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label>Oficial</Label>
                <Popover
                  open={oficialPopoverOpen}
                  onOpenChange={(open) => {
                    setOficialPopoverOpen(open)
                    if (open) setOficialSearch(str(cfg.oficial))
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={oficialPopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {str(cfg.oficial) || <span className="text-muted-foreground">Buscar o escribir oficial...</span>}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar oficial..."
                        value={oficialSearch}
                        onValueChange={(v) => {
                          setOficialSearch(v)
                          set('oficial', v)
                        }}
                      />
                      <CommandList>
                        {isSearchingOficial && <Loader2 className="h-4 w-4 animate-spin mx-auto my-2" />}
                        <CommandEmpty className="py-3 px-3 text-xs text-muted-foreground">
                          Sin oficiales con ese texto. Lo escrito se guarda como texto libre.
                        </CommandEmpty>
                        <CommandGroup>
                          {oficialResults.map((o) => {
                            const selected = str(cfg.oficial) === o.name
                            return (
                              <CommandItem
                                key={o.id}
                                value={`${o.name} ${o.specialty ?? ''}`}
                                onSelect={() => {
                                  set('oficial', o.name)
                                  setOficialSearch(o.name)
                                  setOficialPopoverOpen(false)
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${selected ? 'opacity-100' : 'opacity-0'}`} />
                                <div className="flex items-center justify-between w-full">
                                  <span>{o.name}</span>
                                  {o.specialty && <span className="text-xs text-muted-foreground">{o.specialty}</span>}
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label>Tejido</Label>
                <Popover open={tejidoPopoverOpen} onOpenChange={setTejidoPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={tejidoPopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {str(cfg.tejidoStockNombre ?? cfg.tejidoCatalogo ?? cfg.tejido) || 'Buscar o escribir tejido...'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                    <Command>
                      <CommandInput
                        placeholder="Buscar por código o nombre..."
                        onValueChange={(v) => {
                          // El texto escrito se queda en tejidoCatalogo por si no
                          // coincide con ningún tejido del stock (texto libre).
                          setCfg((prev) => ({
                            ...prev,
                            tejidoStockId: '',
                            tejidoStockNombre: '',
                            tejidoCatalogo: v,
                          }))
                        }}
                      />
                      <CommandList>
                        <CommandEmpty className="py-3 px-3 text-xs text-muted-foreground">
                          Sin tejidos en stock con ese texto. Lo que escribas se guardará como referencia.
                        </CommandEmpty>
                        <CommandGroup>
                          {fabricsStock.map((f) => {
                            const label = f.fabric_code ? `${f.fabric_code} — ${f.name}` : f.name
                            const selected = cfg.tejidoStockId === f.id
                            return (
                              <CommandItem
                                key={f.id}
                                value={`${f.fabric_code ?? ''} ${f.name}`}
                                onSelect={() => {
                                  setCfg((prev) => ({
                                    ...prev,
                                    tejidoStockId: f.id,
                                    tejidoStockNombre: `${f.fabric_code ?? ''} — ${f.name}`.trim(),
                                    tejidoCatalogo: '',
                                  }))
                                  setTejidoPopoverOpen(false)
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${selected ? 'opacity-100' : 'opacity-0'}`} />
                                {label}
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
            {type === 'pantalon' && <PantalonSection cfg={cfg} set={set} bool={bool} str={str} />}
            {type === 'chaleco' && <ChalecoSection cfg={cfg} set={set} bool={bool} str={str} />}
            {type === 'camiseria' && <CamiseriaSection cfg={cfg} set={set} bool={bool} str={str} />}
            {type === 'americana' && <AmericanaSection cfg={cfg} set={set} bool={bool} str={str} />}
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
