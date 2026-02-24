'use client'

import { useConsent } from '@/components/providers/consent-provider'

export function CookieSettingsButton() {
  const ctx = useConsent()

  if (!ctx) return null

  return (
    <button onClick={ctx.openSettings} className="hover:text-white transition-colors">
      Configurar cookies
    </button>
  )
}
