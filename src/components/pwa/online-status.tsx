'use client'

import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'

export function OnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white text-center py-1.5 text-xs font-medium flex items-center justify-center gap-2">
      <WifiOff className="h-3.5 w-3.5" />
      Sin conexión — Los cambios se sincronizarán al reconectar
    </div>
  )
}
