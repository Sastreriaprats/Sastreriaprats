'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Cookie, Settings, Shield, X } from 'lucide-react'
import { useConsent } from '@/components/providers/consent-provider'

export function CookieBanner() {
  const ctx = useConsent()
  const [showDetails, setShowDetails] = useState(false)
  const [prefs, setPrefs] = useState({
    analytics: false,
    marketing: false,
    preferences: false,
  })

  useEffect(() => {
    if (ctx) {
      setPrefs({
        analytics: ctx.consent.analytics,
        marketing: ctx.consent.marketing,
        preferences: ctx.consent.preferences,
      })
    }
  }, [ctx])

  if (!ctx || !ctx.showBanner) return null

  const { acceptAll, rejectAll, savePreferences } = ctx

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] animate-in slide-in-from-bottom-4">
      <div className="bg-white border-t shadow-2xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          {!showDetails ? (
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Cookie className="h-5 w-5 text-prats-gold mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-700">
                    Utilizamos cookies para mejorar tu experiencia, analizar el tráfico y personalizar contenido.
                    Puedes aceptar todas, rechazarlas o configurar tus preferencias.
                  </p>
                  <Link href="/cookies" className="text-xs text-prats-gold hover:underline mt-1 inline-block">
                    Política de cookies
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowDetails(true)}>
                  <Settings className="h-3 w-3 mr-1" />Configurar
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={rejectAll}>
                  Rechazar
                </Button>
                <Button size="sm" className="text-xs bg-prats-navy hover:bg-prats-navy/90" onClick={acceptAll}>
                  Aceptar todas
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-prats-navy flex items-center gap-2">
                  <Shield className="h-5 w-5" />Configuración de cookies
                </h3>
                <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className="text-sm font-medium">Necesarias</p>
                    <p className="text-xs text-gray-500">Esenciales para el funcionamiento del sitio. No se pueden desactivar.</p>
                  </div>
                  <Switch checked disabled />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">Analíticas</p>
                    <p className="text-xs text-gray-500">Google Analytics para entender cómo usas el sitio.</p>
                  </div>
                  <Switch checked={prefs.analytics} onCheckedChange={v => setPrefs(p => ({ ...p, analytics: v }))} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">Marketing</p>
                    <p className="text-xs text-gray-500">Publicidad personalizada y remarketing.</p>
                  </div>
                  <Switch checked={prefs.marketing} onCheckedChange={v => setPrefs(p => ({ ...p, marketing: v }))} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">Preferencias</p>
                    <p className="text-xs text-gray-500">Recordar idioma, tema y configuración.</p>
                  </div>
                  <Switch checked={prefs.preferences} onCheckedChange={v => setPrefs(p => ({ ...p, preferences: v }))} />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" className="text-xs" onClick={rejectAll}>Rechazar todo</Button>
                <Button size="sm" className="text-xs bg-prats-navy hover:bg-prats-navy/90" onClick={() => savePreferences(prefs)}>
                  Guardar preferencias
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
