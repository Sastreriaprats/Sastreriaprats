'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  keyId: string
  cfg: Record<string, unknown>
  setField: (field: string, value: unknown) => void
}

export function FichaAmericanaConfig({ keyId, cfg, setField }: Props) {
  return (
    <>
      <div>
        <Label className="text-white/60 text-xs">Botones</Label>
        <div className="flex flex-wrap gap-3 mt-2">
          {[
            { v: '1fila_1', label: '1 Fila 1 botón' }, { v: '1fila_2', label: '1 Fila 2 botones' },
            { v: '1fila_3para2', label: '1 Fila 3 para 2' }, { v: '2filas_6', label: '2 Filas 6 btns 2 adorno' },
          ].map(({ v, label }) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name={`botones-${keyId}`} checked={cfg.botones === v} onChange={() => setField('botones', v)} className="text-[#c9a96e]" />
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
              <input type="radio" name={`aberturas-${keyId}`} checked={cfg.aberturas === v} onChange={() => setField('aberturas', v)} className="text-[#c9a96e]" />
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
              <input type="radio" name={`bolsilloTipo-${keyId}`} checked={cfg.bolsilloTipo === v} onChange={() => setField('bolsilloTipo', v)} className="text-[#c9a96e]" />
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
              <input type="radio" name={`solapa-${keyId}`} checked={cfg.solapa === v} onChange={() => setField('solapa', v)} className="text-[#c9a96e]" />
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
              <input type="radio" name={`manga-${keyId}`} checked={cfg.manga === v} onChange={() => setField('manga', v)} className="text-[#c9a96e]" />
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
              <input type="radio" name={`forro-${keyId}`} checked={cfg.forro === v} onChange={() => setField('forro', v)} className="text-[#c9a96e]" />
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
  )
}
