'use client'

// Banner automático "Instalar Prats". Aparece solo donde se monte explícitamente
// (admin/sastre). Reutiliza el evento `beforeinstallprompt` ya capturado por
// PwaInstallProvider. Respeta dismiss de 7 días (localStorage).
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, X, Smartphone } from 'lucide-react'
import { usePwaInstall } from './install-provider'

const DISMISS_KEY = 'pwa_install_dismissed'
const DISMISS_TTL_MS = 7 * 86400000

export function InstallPrompt() {
  const { canInstall, isInstalled, triggerInstall } = usePwaInstall()
  const [hidden, setHidden] = useState(true) // empieza oculto hasta comprobar dismiss

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && Date.now() - parseInt(dismissed) < DISMISS_TTL_MS) return
    setHidden(false)
  }, [])

  const handleInstall = async () => {
    const outcome = await triggerInstall()
    if (outcome === 'accepted') setHidden(true)
  }

  const handleDismiss = () => {
    setHidden(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, Date.now().toString())
    }
  }

  if (hidden || !canInstall || isInstalled) return null

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
