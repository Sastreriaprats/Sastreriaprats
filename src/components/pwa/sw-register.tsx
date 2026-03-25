'use client'

import { useEffect, useState, useCallback } from 'react'

export function ServiceWorkerRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [showUpdate, setShowUpdate] = useState(false)

  const onNewWorkerWaiting = useCallback((sw: ServiceWorker) => {
    setWaitingWorker(sw)
    setShowUpdate(true)
  }, [])

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    }
    setShowUpdate(false)
    // Reload tras un breve delay para dar tiempo al SW a activarse
    setTimeout(() => window.location.reload(), 300)
  }, [waitingWorker])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Si ya hay un SW esperando al cargar
      if (reg.waiting) {
        onNewWorkerWaiting(reg.waiting)
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && reg.waiting) {
            onNewWorkerWaiting(reg.waiting)
          }
        })
      })

      // Buscar actualizaciones cada 5 minutos
      setInterval(() => reg.update(), 5 * 60 * 1000)
    }).catch((err) => console.error('SW register error:', err))

    // Escuchar cuando el nuevo SW toma el control
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })
  }, [onNewWorkerWaiting])

  if (!showUpdate) return null

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
        onClick={handleUpdate}
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
