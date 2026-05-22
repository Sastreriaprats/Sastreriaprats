'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useConsent } from '@/components/providers/consent-provider'

/**
 * Banner de consentimiento de cookies — diseño minimalista estilo Shopify.
 *
 * Posicionamiento: tarjeta flotante en la esquina inferior izquierda,
 * SIN backdrop. El usuario puede seguir navegando mientras decide
 * (mejor compliance RGPD europea — no es "cookie wall").
 *
 * Lógica: 100% delegada a useConsent (consent-provider). Este componente
 * solo cambia la presentación; los handlers acceptAll/rejectAll/
 * savePreferences/openSettings funcionan exactamente igual.
 *
 * Dos vistas:
 *  - Compacta (default): título + párrafo + 2 botones full-width +
 *    link "Configuración" para abrir la granularidad.
 *  - Expandida (showDetails=true): mismos 4 toggles que antes
 *    (necesarias/analíticas/marketing/preferencias) + botón Guardar.
 */
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
    <div
      className="fixed bottom-6 left-6 z-[200] max-w-md w-[calc(100vw-3rem)] animate-in slide-in-from-bottom-4 duration-300"
      role="region"
      aria-label="Configuración de cookies"
    >
      <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-6">
        {!showDetails ? (
          // ─── Vista compacta ────────────────────────────────────────
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-center text-black">
              Configuración de las cookies
            </h2>

            <p className="text-sm text-gray-700 text-center leading-relaxed">
              Al elegir &ldquo;Aceptar&rdquo;, aceptas almacenar cookies en tu dispositivo para mejorar la navegación del sitio, analizar los hábitos de uso y colaborar con nuestra labor de marketing.{' '}
              <Link href="/cookies" className="underline hover:no-underline text-black">
                Ver la política de cookies
              </Link>
            </p>

            <div className="space-y-2 pt-2">
              <Button
                onClick={acceptAll}
                className="w-full bg-black hover:bg-gray-900 text-white"
                aria-label="Aceptar todas las cookies"
              >
                Aceptar
              </Button>
              <Button
                onClick={rejectAll}
                variant="outline"
                className="w-full border-black text-black hover:bg-gray-50"
                aria-label="Aceptar solo las cookies necesarias"
              >
                Solo las cookies necesarias
              </Button>
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className="text-sm text-gray-700 underline hover:no-underline"
              >
                Configuración
              </button>
            </div>
          </div>
        ) : (
          // ─── Vista expandida (granularidad) ────────────────────────
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-center text-black">
              Configuración de las cookies
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black">Necesarias</p>
                  <p className="text-xs text-gray-500">Esenciales para el funcionamiento del sitio. No se pueden desactivar.</p>
                </div>
                <Switch checked disabled />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black">Analíticas</p>
                  <p className="text-xs text-gray-500">Google Analytics para entender cómo usas el sitio.</p>
                </div>
                <Switch
                  checked={prefs.analytics}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, analytics: v }))}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black">Marketing</p>
                  <p className="text-xs text-gray-500">Publicidad personalizada y remarketing.</p>
                </div>
                <Switch
                  checked={prefs.marketing}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, marketing: v }))}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black">Preferencias</p>
                  <p className="text-xs text-gray-500">Recordar idioma, tema y configuración.</p>
                </div>
                <Switch
                  checked={prefs.preferences}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, preferences: v }))}
                />
              </div>
            </div>

            <Button
              onClick={() => savePreferences(prefs)}
              className="w-full bg-black hover:bg-gray-900 text-white"
            >
              Guardar preferencias
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="text-sm text-gray-700 underline hover:no-underline"
              >
                Volver
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
