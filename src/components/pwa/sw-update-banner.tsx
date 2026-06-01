'use client'

// Banner "Nueva versión disponible". Consume `useSwUpdate()` del provider en
// el layout raíz. Solo se monta en layouts de staff (admin / sastre / vendedor
// / pos) — visitantes públicos y clientes (/mi-cuenta) no lo ven aunque el SW
// sí esté registrado para todos.
import { useSwUpdate } from './sw-update-provider'

export function SwUpdateBanner() {
  const { hasUpdate, applyUpdate } = useSwUpdate()
  if (!hasUpdate) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: '#1B2A4A',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '14px 20px',
        fontSize: '14px',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.3)',
      }}
    >
      <span>Nueva versión disponible</span>
      <button
        onClick={applyUpdate}
        style={{
          backgroundColor: '#C9A96E',
          color: '#1B2A4A',
          border: 'none',
          padding: '8px 20px',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Actualizar
      </button>
    </div>
  )
}
