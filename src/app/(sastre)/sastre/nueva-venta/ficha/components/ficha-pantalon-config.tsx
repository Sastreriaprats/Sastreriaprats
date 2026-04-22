'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  keyId: string
  cfg: Record<string, unknown>
  setField: (field: string, value: unknown) => void
}

export function FichaPantalonConfig({ keyId, cfg, setField }: Props) {
  return (
    <>
      <div>
        <Label className="text-white/60 text-xs">Vueltas</Label>
        <div className="flex flex-wrap gap-3 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name={`vueltas-${keyId}`} checked={cfg.vueltas === 'sin_vueltas'} onChange={() => setField('vueltas', 'sin_vueltas')} className="text-[#c9a96e]" />
            <span className="text-white/80 text-sm">Sin vueltas</span>
          </label>
          <span className="text-white/40 text-sm self-center">Con vuelta:</span>
          {['3.5', '4', '4.5', '5'].map((v) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name={`vueltas-${keyId}`} checked={cfg.vueltas === v} onChange={() => setField('vueltas', v)} className="text-[#c9a96e]" />
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
              <input type="radio" name={`bragueta-${keyId}`} checked={cfg.bragueta === v} onChange={() => setField('bragueta', v)} className="text-[#c9a96e]" />
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
              <input type="radio" name={`pliegues-${keyId}`} checked={cfg.pliegues === v} onChange={() => setField('pliegues', v)} className="text-[#c9a96e]" />
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
                    <input type="radio" name={`pretinaTamano-${keyId}`} checked={cfg.pretinaTamano === v} onChange={() => setField('pretinaTamano', v)} className="text-[#c9a96e]" />
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
  )
}
