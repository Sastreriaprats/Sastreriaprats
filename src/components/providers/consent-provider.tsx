'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface ConsentState {
  necessary: boolean
  analytics: boolean
  marketing: boolean
  preferences: boolean
  timestamp?: string
  version: string
}

interface ConsentContextType {
  consent: ConsentState
  hasResponded: boolean
  showBanner: boolean
  acceptAll: () => void
  rejectAll: () => void
  savePreferences: (prefs: Partial<ConsentState>) => void
  openSettings: () => void
}

const CONSENT_KEY = 'prats_cookie_consent'
const CONSENT_VERSION = '1.0'

const defaultConsent: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
  version: CONSENT_VERSION,
}

const ConsentContext = createContext<ConsentContextType | null>(null)

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>(defaultConsent)
  const [hasResponded, setHasResponded] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONSENT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as ConsentState
        if (parsed.version === CONSENT_VERSION) {
          setConsent(parsed)
          setHasResponded(true)
        } else {
          setShowBanner(true)
        }
      } else {
        setShowBanner(true)
      }
    } catch {
      setShowBanner(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).gtag) {
      const gtag = (window as unknown as Record<string, unknown>).gtag as (...args: unknown[]) => void
      gtag('consent', 'update', {
        analytics_storage: consent.analytics ? 'granted' : 'denied',
        ad_storage: consent.marketing ? 'granted' : 'denied',
        ad_user_data: consent.marketing ? 'granted' : 'denied',
        ad_personalization: consent.marketing ? 'granted' : 'denied',
        functionality_storage: consent.preferences ? 'granted' : 'denied',
        personalization_storage: consent.preferences ? 'granted' : 'denied',
        security_storage: 'granted',
      })
    }
  }, [consent])

  const saveConsent = useCallback((newConsent: ConsentState) => {
    const final = { ...newConsent, timestamp: new Date().toISOString(), version: CONSENT_VERSION }
    setConsent(final)
    setHasResponded(true)
    setShowBanner(false)
    localStorage.setItem(CONSENT_KEY, JSON.stringify(final))
  }, [])

  const acceptAll = useCallback(() => {
    saveConsent({ necessary: true, analytics: true, marketing: true, preferences: true, version: CONSENT_VERSION })
  }, [saveConsent])

  const rejectAll = useCallback(() => {
    saveConsent({ ...defaultConsent })
  }, [saveConsent])

  const savePreferences = useCallback((prefs: Partial<ConsentState>) => {
    saveConsent({ ...consent, ...prefs, necessary: true, version: CONSENT_VERSION })
  }, [consent, saveConsent])

  const openSettings = useCallback(() => {
    setShowBanner(true)
  }, [])

  return (
    <ConsentContext.Provider value={{ consent, hasResponded, showBanner, acceptAll, rejectAll, savePreferences, openSettings }}>
      {children}
    </ConsentContext.Provider>
  )
}

export const useConsent = () => {
  const ctx = useContext(ConsentContext)
  return ctx
}

export const useConsentRequired = () => {
  const ctx = useContext(ConsentContext)
  if (!ctx) throw new Error('useConsent must be inside ConsentProvider')
  return ctx
}
