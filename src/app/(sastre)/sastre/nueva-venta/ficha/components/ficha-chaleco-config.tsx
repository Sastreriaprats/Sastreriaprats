'use client'

import { Label } from '@/components/ui/label'

interface Props {
  keyId: string
  cfg: Record<string, unknown>
  setField: (field: string, value: unknown) => void
}

export function FichaChalecoConfig({ keyId, cfg, setField }: Props) {
  return (
    <>
      <div>
        <Label className="text-white/60 text-xs">Corte</Label>
        <div className="flex gap-3 mt-2">
          {[{ v: 'recto', label: 'Recto' }, { v: 'cruzado', label: 'Cruzado' }].map(({ v, label }) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name={`chalecoCorte-${keyId}`} checked={cfg.chalecoCorte === v} onChange={() => setField('chalecoCorte', v)} className="text-[#c9a96e]" />
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
              <input type="radio" name={`chalecoBolsillo-${keyId}`} checked={cfg.chalecoBolsillo === v} onChange={() => setField('chalecoBolsillo', v)} className="text-[#c9a96e]" />
              <span className="text-white/80 text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
