'use client'

// Contexto PWA: captura el evento `beforeinstallprompt` una vez (se dispara
// solo una vez por carga de página) y lo expone para que cualquier consumidor
// pueda lanzar la instalación a propósito desde un botón/menú.
//
// El provider vive en el layout raíz para no perder el evento (puede dispararse
// en cualquier ruta). El banner automático (InstallPrompt) y las entradas
// "Instalar app" de los menús consumen este contexto.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaInstallContextValue {
  canInstall: boolean
  isInstalled: boolean
  /** Lanza el diálogo nativo de instalación. Devuelve 'unavailable' si no hay evento capturado. */
  triggerInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null)

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable' as const
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return outcome
  }, [deferredPrompt])

  return (
    <PwaInstallContext.Provider
      value={{
        canInstall: !!deferredPrompt && !isInstalled,
        isInstalled,
        triggerInstall,
      }}
    >
      {children}
    </PwaInstallContext.Provider>
  )
}

/** Si no hay provider, devuelve valores seguros (canInstall=false). */
export function usePwaInstall(): PwaInstallContextValue {
  const ctx = useContext(PwaInstallContext)
  if (!ctx) {
    return {
      canInstall: false,
      isInstalled: false,
      triggerInstall: async () => 'unavailable' as const,
    }
  }
  return ctx
}
