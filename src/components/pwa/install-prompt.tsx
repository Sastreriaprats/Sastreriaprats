'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, X, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const dismissed = localStorage.getItem('pwa_install_dismissed')
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 86400000) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowBanner(false)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShowBanner(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa_install_dismissed', Date.now().toString())
  }

  if (!showBanner || isInstalled) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-prats-navy rounded-2xl p-4 shadow-2xl border border-white/10">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-prats-gold/20 flex items-center justify-center flex-shrink-0">
            <Smartphone className="h-5 w-5 text-prats-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">Instalar Prats</h3>
            <p className="text-xs text-white/60 mt-0.5">Acceso rápido desde tu escritorio o móvil</p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="bg-prats-gold hover:bg-prats-gold/90 text-prats-navy text-xs h-8"
                onClick={handleInstall}
              >
                <Download className="h-3 w-3 mr-1" /> Instalar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white/50 hover:text-white text-xs h-8"
                onClick={handleDismiss}
              >
                Ahora no
              </Button>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-white/30 hover:text-white/60 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
