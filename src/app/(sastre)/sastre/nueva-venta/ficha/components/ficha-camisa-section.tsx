'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Copy } from 'lucide-react'

type FabricStockItem = { id: string; fabric_code: string | null; name: string }

export type CamisaItem = {
  id: string
  /** 'a_medida' usa medidas + opciones detalladas; 'industrial' es una camisa
   *  estándar facturada solo por precio + cantidad (sin medidas detalladas). */
  mode: 'a_medida' | 'industrial'
  cuello: string; canesu: string; largoManga: string; frentePecho: string; pecho: string
  cintura: string; cadera: string; largoCuerpo: string
  hombro: string; punoDerecho: string; punoIzquierdo: string
  jareton: boolean; bolsillo: boolean; hombroCaido: boolean; derecho: boolean; izquierdo: boolean
  hombrosAltos: boolean; hombrosBajos: boolean; erguido: boolean; cargado: boolean
  espaldaLisa: boolean; espPliegues: boolean; espTablonCentr: boolean; espPinzas: boolean
  iniciales: boolean; inicialesTexto: string
  inicialesSituacion: '' | 'puno_derecho' | 'puno_izquierdo' | 'pecho' | 'talle'
  inicialesColor: string
  modCuello: string
  puno: 'sencillo' | 'gemelo' | 'mixto' | 'mosquetero' | 'otro'
  tejido: string; tejidoStockId?: string; tejidoMetros?: number; precio: number; cantidad: number; obs: string
  cortador: string; oficial: string
  coste?: number
}

const PUNO_CAMISA_OPTIONS: Array<{ value: CamisaItem['puno']; label: string }> = [
  { value: 'sencillo', label: 'Sencillo' },
  { value: 'gemelo', label: 'Gemelo' },
  { value: 'mixto', label: 'Mixto' },
  { value: 'mosquetero', label: 'Mosquetero' },
  { value: 'otro', label: 'Otro' },
]

export const INICIALES_SITUACION_OPTIONS: Array<{ value: Exclude<CamisaItem['inicialesSituacion'], ''>; label: string }> = [
  { value: 'puno_derecho',   label: 'Puño derecho' },
  { value: 'puno_izquierdo', label: 'Puño izquierdo' },
  { value: 'pecho',          label: 'Pecho' },
  { value: 'talle',          label: 'Talle' },
]

export function inicialesSituacionLabel(value: CamisaItem['inicialesSituacion']): string {
  return INICIALES_SITUACION_OPTIONS.find((o) => o.value === value)?.label ?? ''
}

const MEDIDAS_FIELDS: Array<{ label: string; field: 'cuello' | 'canesu' | 'largoManga' | 'frentePecho' | 'pecho' | 'cintura' | 'cadera' | 'largoCuerpo' | 'hombro' | 'punoDerecho' | 'punoIzquierdo' }> = [
  { label: 'Cuello', field: 'cuello' },
  { label: 'Canesú', field: 'canesu' },
  { label: 'Largo manga', field: 'largoManga' },
  { label: 'Frente pecho', field: 'frentePecho' },
  { label: 'Pecho', field: 'pecho' },
  { label: 'Cintura', field: 'cintura' },
  { label: 'Cadera', field: 'cadera' },
  { label: 'Largo cuerpo', field: 'largoCuerpo' },
  { label: 'Hombro', field: 'hombro' },
  { label: 'Puño dch', field: 'punoDerecho' },
  { label: 'Puño izq', field: 'punoIzquierdo' },
]

function TejidoInput({ fabrics, value, onSelect, placeholder }: { fabrics: FabricStockItem[]; value: string; onSelect: (label: string, fabricId?: string) => void; placeholder?: string }) {
  const [showDropdown, setShowDropdown] = useState(false)

  const labelFor = (f: FabricStockItem) => (f.fabric_code ? `${f.fabric_code} — ${f.name}` : f.name)
  const filtered = fabrics.filter((f) => labelFor(f).toLowerCase().includes(value.toLowerCase()))

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input className="flex-1 h-10 bg-[#0d1629] border-[#c9a96e]/20 text-white" value={value} onChange={(e) => onSelect(e.target.value, undefined)} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} placeholder={placeholder ?? 'Escribe o elige tejido'} />
        <button type="button" onClick={() => setShowDropdown(!showDropdown)} className="h-10 w-10 rounded-md border border-[#c9a96e]/20 bg-[#0d1629] text-[#c9a96e] flex items-center justify-center hover:bg-[#c9a96e]/10">▾</button>
      </div>
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1a2744] border border-[#c9a96e]/30 rounded-xl max-h-40 overflow-y-auto shadow-xl">
          {filtered.map((f) => {
            const label = labelFor(f)
            return (
              <button key={f.id} type="button" onMouseDown={() => { onSelect(label, f.id); setShowDropdown(false) }} className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-[#c9a96e]/10 hover:text-white border-b border-[#c9a96e]/10 last:border-0">{label}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface Props {
  isCamiseria: boolean
  camisas: CamisaItem[]
  camiseriaMeasurements: Record<string, unknown> | null
  camiseriaMeasurementsLoading: boolean
  officials: { id: string; name: string; specialty: string | null }[]
  fabricsStock: FabricStockItem[]
  addCamisa: () => void
  removeCamisa: (id: string) => void
  duplicateCamisa: (id: string) => void
  updateCamisa: (id: string, field: keyof CamisaItem, value: string | number | boolean | undefined) => void
}

export function FichaCamisaSection({
  isCamiseria, camisas, camiseriaMeasurements, camiseriaMeasurementsLoading,
  officials, fabricsStock, addCamisa, removeCamisa, duplicateCamisa, updateCamisa,
}: Props) {
  if (!(isCamiseria || camiseriaMeasurements)) return null

  return (
    <section className="rounded-xl border border-[#c9a96e]/20 bg-[#1a2744]/80 p-5 space-y-4">
      <h2 className="font-serif text-lg text-[#c9a96e]">{isCamiseria ? 'Camisería' : 'Camisas'}</h2>
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
          {camisas.map((camisa, index) => {
            const isIndustrial = camisa.mode === 'industrial'
            return (
            <div key={camisa.id} className="rounded-lg border border-[#c9a96e]/15 bg-[#0d1629] p-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[#c9a96e] font-medium">CAMISA #{index + 1}</h3>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded-md border border-[#c9a96e]/30 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => updateCamisa(camisa.id, 'mode', 'a_medida')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          !isIndustrial ? 'bg-[#c9a96e]/25 text-[#c9a96e]' : 'bg-transparent text-white/60 hover:text-white'
                        }`}
                      >
                        A medida
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCamisa(camisa.id, 'mode', 'industrial')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-[#c9a96e]/30 ${
                          isIndustrial ? 'bg-[#c9a96e]/25 text-[#c9a96e]' : 'bg-transparent text-white/60 hover:text-white'
                        }`}
                      >
                        Industrial
                      </button>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => removeCamisa(camisa.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => duplicateCamisa(camisa.id)}
                  className="w-full min-h-[48px] gap-2 bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 transition-all"
                  title="Duplicar esta camisa con sus características (sin tejido ni precio)"
                >
                  <Copy className="h-5 w-5" /> Duplicar camisa
                </Button>
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[150px] flex items-center gap-2">
                    <Label className="text-white/60 text-xs whitespace-nowrap">Cortador</Label>
                    <Select value={camisa.cortador || '__none__'} onValueChange={(v) => updateCamisa(camisa.id, 'cortador', v === '__none__' ? '' : v)}>
                      <SelectTrigger className="min-h-[36px] h-9 bg-[#0d1629] border-[#c9a96e]/20 text-white text-xs flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                        <SelectItem value="__none__" className="text-white focus:bg-white/10 focus:text-white">—</SelectItem>
                        {officials.filter(o => o.specialty?.split(',').some(s => s.trim().toLowerCase() === 'cortador')).map(o => <SelectItem key={o.id} value={o.name} className="text-white focus:bg-white/10 focus:text-white">{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[150px] flex items-center gap-2">
                    <Label className="text-white/60 text-xs whitespace-nowrap">Oficial</Label>
                    <Select value={camisa.oficial || '__none__'} onValueChange={(v) => updateCamisa(camisa.id, 'oficial', v === '__none__' ? '' : v)}>
                      <SelectTrigger className="min-h-[36px] h-9 bg-[#0d1629] border-[#c9a96e]/20 text-white text-xs flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                        <SelectItem value="__none__" className="text-white focus:bg-white/10 focus:text-white">—</SelectItem>
                        {officials.filter(o => o.specialty?.split(',').some(s => s.trim().toLowerCase() === 'camisería')).map(o => <SelectItem key={o.id} value={o.name} className="text-white focus:bg-white/10 focus:text-white">{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Precio y cantidad arriba para que sean siempre visibles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-[#0a1020] p-3">
                <div>
                  <Label className="text-white/70 text-xs">Precio (€) *</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    className="mt-1 h-10 bg-[#1a2744] border-[#c9a96e]/20 text-white"
                    value={camisa.precio || ''}
                    onChange={(e) => updateCamisa(camisa.id, 'precio', parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    min={1}
                    className="mt-1 h-10 bg-[#1a2744] border-[#c9a96e]/20 text-white"
                    value={camisa.cantidad}
                    onChange={(e) => updateCamisa(camisa.id, 'cantidad', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Coste est. (€)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    className="mt-1 h-10 bg-[#1a2744] border-[#c9a96e]/20 text-white"
                    value={camisa.coste ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      const value = raw === '' ? undefined : (parseFloat(raw) || 0)
                      updateCamisa(camisa.id, 'coste', value)
                    }}
                    placeholder="—"
                  />
                </div>
                <div className="flex items-end">
                  <p className="text-white/70 text-xs">
                    Subtotal:{' '}
                    <span className="text-[#c9a96e] font-semibold">
                      {((Number(camisa.precio) || 0) * (camisa.cantidad || 1)).toFixed(2)} €
                    </span>
                  </p>
                </div>
              </div>

              {!isIndustrial && (
                <div>
                  <Label className="text-white/60 text-xs mb-2 block">Medidas</Label>
                  <div className="grid grid-cols-6 gap-3 rounded-lg bg-[#0a1020] p-3">
                    {MEDIDAS_FIELDS.map(({ label, field }) => (
                      <div key={field}>
                        <Label className="text-xs text-gray-400 block mb-1">{label}</Label>
                        <Input type="text" inputMode="decimal" className="w-full py-2 text-center bg-[#1a2744] border-[#c9a96e]/20 text-white text-sm" value={camisa[field] ?? ''} onChange={(e) => updateCamisa(camisa.id, field, e.target.value)} placeholder="—" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!isIndustrial && (
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
                      <div className="flex flex-col gap-2 pl-6">
                        <Input
                          className="h-9 bg-[#1a2744] border-[#c9a96e]/20 text-white text-sm"
                          value={camisa.inicialesTexto}
                          onChange={(e) => updateCamisa(camisa.id, 'inicialesTexto', e.target.value)}
                          placeholder="Ej: J.G.M."
                        />
                        <Select
                          value={camisa.inicialesSituacion || undefined}
                          onValueChange={(v) => updateCamisa(camisa.id, 'inicialesSituacion', v as CamisaItem['inicialesSituacion'])}
                        >
                          <SelectTrigger className="h-9 bg-[#1a2744] border-[#c9a96e]/20 text-white text-sm">
                            <SelectValue placeholder="Situación…" />
                          </SelectTrigger>
                          <SelectContent>
                            {INICIALES_SITUACION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="h-9 bg-[#1a2744] border-[#c9a96e]/20 text-white text-sm"
                          value={camisa.inicialesColor}
                          onChange={(e) => updateCamisa(camisa.id, 'inicialesColor', e.target.value)}
                          placeholder="Color del bordado"
                        />
                      </div>
                    )}
                    <div>
                      <Label className="text-white/70 text-xs">Mod. cuello</Label>
                      <Input className="mt-1 h-9 bg-[#1a2744] border-[#c9a96e]/20 text-white text-sm" value={camisa.modCuello} onChange={(e) => updateCamisa(camisa.id, 'modCuello', e.target.value)} placeholder="Texto" />
                    </div>
                  </div>
                </div>
              </div>
              )}
              {!isIndustrial && (
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
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr,140px] gap-3">
                <div>
                  <Label className="text-white/70 text-xs">Tejido</Label>
                  <div className="mt-1"><TejidoInput
                    fabrics={fabricsStock}
                    value={camisa.tejido}
                    onSelect={(label, fabricId) => {
                      updateCamisa(camisa.id, 'tejido', label)
                      updateCamisa(camisa.id, 'tejidoStockId', fabricId ?? '')
                    }}
                    placeholder="Escribe o elige tejido"
                  /></div>
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Metros</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0.0"
                    value={camisa.tejidoMetros ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      const value = raw === '' ? undefined : (parseFloat(raw) || 0)
                      updateCamisa(camisa.id, 'tejidoMetros', value)
                    }}
                    className="mt-1 h-10 bg-[#1a2744] border-[#c9a96e]/20 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-white/70 text-xs">Observaciones</Label>
                <Textarea className="mt-1 min-h-[60px] bg-[#1a2744] border-[#c9a96e]/20 text-white" value={camisa.obs} onChange={(e) => updateCamisa(camisa.id, 'obs', e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          )})}
        </>
      )}
    </section>
  )
}
