'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Si ya hay un SW esperando, activarlo silenciosamente sin recargar
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          // Activar el nuevo SW en silencio cuando esté listo
          // Sin forzar reload — la próxima navegación natural del usuario usará el nuevo SW
          if (newWorker.state === 'installed' && reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })

      // Buscar actualizaciones cada hora
      setInterval(() => reg.update(), 60 * 60 * 1000)
    }).catch((err) => console.error('SW register error:', err))
  }, [])

  return null
}
