'use client'

import { useRef, useCallback } from 'react'

const ZONE_IDS = [
  'hombro_izq',
  'hombro_der',
  'pecho',
  'cintura',
  'cadera',
  'manga_izq',
  'manga_der',
  'largo_espalda',
  'entrepierna',
  'largo_total',
] as const

interface SiluetaSastreProps {
  highlightedZone: string | null
  onZoneClick: (code: string) => void
  /** refs map: field code -> HTML element to scroll into view */
  fieldRefsMap: React.MutableRefObject<Record<string, HTMLElement | null>>
}

export function SiluetaSastre({ highlightedZone, onZoneClick, fieldRefsMap }: SiluetaSastreProps) {
  const handleZoneClick = useCallback(
    (code: string) => {
      onZoneClick(code)
      const el = fieldRefsMap.current[code]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    [onZoneClick, fieldRefsMap]
  )

  return (
    <div className="w-full max-w-sm mx-auto flex items-center justify-center p-4">
      <svg
        viewBox="0 0 200 380"
        className="w-full h-auto text-white/90"
        aria-label="Silueta corporal"
      >
        {/* Cabeza */}
        <ellipse cx="100" cy="28" rx="22" ry="26" fill="currentColor" opacity={0.9} />
        {/* Cuello */}
        <rect x="92" y="52" width="16" height="14" rx="2" fill="currentColor" opacity={0.9} />

        {/* Tronco: hombros, pecho, cintura, cadera */}
        <path
          id="zone-hombro_izq"
          data-zone="hombro_izq"
          onClick={() => handleZoneClick('hombro_izq')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'hombro_izq' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'hombro_izq' ? 1 : 0.85}
          d="M 68 66 L 55 78 L 70 82 Z"
        />
        <path
          id="zone-hombro_der"
          data-zone="hombro_der"
          onClick={() => handleZoneClick('hombro_der')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'hombro_der' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'hombro_der' ? 1 : 0.85}
          d="M 132 66 L 145 78 L 130 82 Z"
        />
        <path
          id="zone-pecho"
          data-zone="pecho"
          onClick={() => handleZoneClick('pecho')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'pecho' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'pecho' ? 1 : 0.85}
          d="M 70 82 L 130 82 L 128 130 L 72 130 Z"
        />
        <path
          id="zone-cintura"
          data-zone="cintura"
          onClick={() => handleZoneClick('cintura')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'cintura' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'cintura' ? 1 : 0.85}
          d="M 72 130 L 128 130 L 122 170 L 78 170 Z"
        />
        <path
          id="zone-cadera"
          data-zone="cadera"
          onClick={() => handleZoneClick('cadera')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'cadera' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'cadera' ? 1 : 0.85}
          d="M 78 170 L 122 170 L 118 210 L 82 210 Z"
        />

        {/* Mangas */}
        <path
          id="zone-manga_izq"
          data-zone="manga_izq"
          onClick={() => handleZoneClick('manga_izq')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'manga_izq' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'manga_izq' ? 1 : 0.85}
          d="M 55 78 L 35 78 L 30 140 L 58 130 Z"
        />
        <path
          id="zone-manga_der"
          data-zone="manga_der"
          onClick={() => handleZoneClick('manga_der')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'manga_der' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'manga_der' ? 1 : 0.85}
          d="M 145 78 L 165 78 L 170 140 L 142 130 Z"
        />

        {/* Largo espalda (zona espalda superior) */}
        <path
          id="zone-largo_espalda"
          data-zone="largo_espalda"
          onClick={() => handleZoneClick('largo_espalda')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'largo_espalda' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'largo_espalda' ? 1 : 0.85}
          d="M 72 82 L 78 82 L 78 170 L 72 170 Z"
        />

        {/* Piernas: entrepierna y largo total */}
        <path
          id="zone-entrepierna"
          data-zone="entrepierna"
          onClick={() => handleZoneClick('entrepierna')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'entrepierna' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'entrepierna' ? 1 : 0.85}
          d="M 82 210 L 88 210 L 88 280 L 82 280 Z M 112 210 L 118 210 L 118 280 L 112 280 Z"
        />
        <path
          id="zone-largo_total"
          data-zone="largo_total"
          onClick={() => handleZoneClick('largo_total')}
          className="cursor-pointer transition-all hover:opacity-100"
          fill={highlightedZone === 'largo_total' ? '#c9a96e' : 'currentColor'}
          opacity={highlightedZone === 'largo_total' ? 1 : 0.85}
          d="M 88 280 L 112 280 L 108 360 L 92 360 Z"
        />
      </svg>
    </div>
  )
}
