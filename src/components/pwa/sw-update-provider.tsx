'use client'

// Provider del Service Worker:
//  - Registra `/sw.js` para TODOS los visitantes (público, clientes, staff).
//    Es necesario que el SW funcione en cualquier ruta (cacheo offline, etc.).
//  - Captura el evento "nuevo SW en espera" y expone por contexto:
//      hasUpdate, applyUpdate()
//
// El banner visible vive en otro componente (`SwUpdateBanner`) que solo se
// monta en los layouts de staff (admin / sastre / vendedor / pos). Así el
// aviso de "Nueva versión disponible" NO aparece a visitantes ni a clientes
// del área `/mi-cuenta`, pero la actualización del SW sí ocurre cuando esos
// usuarios staff la activan.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface SwUpdateContextValue {
  hasUpdate: boolean
  applyUpdate: () => void
}

const SwUpdateContext = createContext<SwUpdateContextValue | null>(null)

export function SwUpdateProvider({ children }: { children: ReactNode }) {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const refreshingRef = useRef(false)

  const onNewWorkerWaiting = useCallback((sw: ServiceWorker) => {
    setWaitingWorker(sw)
  }, [])

  const applyUpdate = useCallback(() => {
    if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    // Reload tras un breve delay para dar tiempo al SW a activarse.
    setTimeout(() => window.location.reload(), 300)
  }, [waitingWorker])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg.waiting) onNewWorkerWaiting(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && reg.waiting) {
              onNewWorkerWaiting(reg.waiting)
            }
          })
        })
        // Buscar actualizaciones cada 5 minutos.
        setInterval(() => reg.update(), 5 * 60 * 1000)
      })
      .catch((err) => console.error('SW register error:', err))

    // Cuando el nuevo SW toma el control, recargar una sola vez.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshingRef.current) {
        refreshingRef.current = true
        window.location.reload()
      }
    })
  }, [onNewWorkerWaiting])

  return (
    <SwUpdateContext.Provider value={{ hasUpdate: !!waitingWorker, applyUpdate }}>
      {children}
    </SwUpdateContext.Provider>
  )
}

/** Si no hay provider, devuelve valores seguros. */
export function useSwUpdate(): SwUpdateContextValue {
  const ctx = useContext(SwUpdateContext)
  if (!ctx) return { hasUpdate: false, applyUpdate: () => {} }
  return ctx
}
