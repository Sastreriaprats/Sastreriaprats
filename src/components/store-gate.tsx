'use client'

import { Loader2, MapPin, AlertTriangle, LogOut } from 'lucide-react'
import { useRequireStore } from '@/hooks/use-require-store'
import { useAuth } from '@/components/providers/auth-provider'
import { useRouter } from 'next/navigation'

interface StoreGateProps {
  children: React.ReactNode
  /**
   * Tema visual del gate:
   * - 'dark' (por defecto): fondo navy, usado en /sastre y /pos.
   * - 'light': fondo gris, usado en /vendedor.
   */
  theme?: 'dark' | 'light'
}

export function StoreGate({ children, theme = 'dark' }: StoreGateProps) {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const { isConfirmed, availableStores, selectStore, isLoading } = useRequireStore()

  const handleSignOut = async () => {
    await signOut()
    router.replace('/auth/login')
  }

  // Esperando sesión de usuario
  if (!user) {
    return (
      <GateShell theme={theme}>
        <Loader2 className={`h-8 w-8 animate-spin ${theme === 'dark' ? 'text-white/40' : 'text-muted-foreground'}`} />
      </GateShell>
    )
  }

  if (isLoading) {
    return (
      <GateShell theme={theme}>
        <Loader2 className={`h-8 w-8 animate-spin ${theme === 'dark' ? 'text-white/40' : 'text-muted-foreground'}`} />
      </GateShell>
    )
  }

  if (isConfirmed) {
    return <>{children}</>
  }

  // Sin tiendas asignadas
  if (availableStores.length === 0) {
    return (
      <GateShell theme={theme}>
        <div className="max-w-md w-full space-y-4 text-center">
          <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-amber-500/10' : 'bg-amber-100'}`}>
            <AlertTriangle className={`h-7 w-7 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`} />
          </div>
          <h1 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
            No tienes tiendas asignadas
          </h1>
          <p className={theme === 'dark' ? 'text-white/60' : 'text-muted-foreground'}>
            Contacta con administración para que te asignen la tienda donde trabajas.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className={
              theme === 'dark'
                ? 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 transition-colors'
                : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors'
            }
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </GateShell>
    )
  }

  // Modal de selección (bloqueante)
  return (
    <GateShell theme={theme}>
      <div className="max-w-xl w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className={`text-2xl sm:text-3xl font-serif ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
            ¿En qué tienda estás hoy?
          </h1>
          <p className={theme === 'dark' ? 'text-white/60' : 'text-muted-foreground'}>
            Selecciona la tienda para continuar. Tu elección es obligatoria para ventas, caja e informes.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {availableStores.map((store) => (
            <button
              key={store.storeId}
              type="button"
              onClick={() => selectStore(store.storeId)}
              className={
                theme === 'dark'
                  ? 'group relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/[0.05] border border-white/10 text-white hover:bg-white/10 hover:border-[#c9a96e]/60 transition-all focus:outline-none focus:ring-2 focus:ring-[#c9a96e]/50'
                  : 'group relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white border border-slate-200 text-slate-900 hover:border-prats-navy hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-prats-navy/40'
              }
            >
              <div className={theme === 'dark' ? 'w-12 h-12 rounded-full bg-[#c9a96e]/15 flex items-center justify-center' : 'w-12 h-12 rounded-full bg-prats-navy/10 flex items-center justify-center'}>
                <MapPin className={theme === 'dark' ? 'h-6 w-6 text-[#c9a96e]' : 'h-6 w-6 text-prats-navy'} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-base">{store.storeName}</p>
                {store.storeCode && (
                  <p className={theme === 'dark' ? 'text-white/40 text-xs mt-0.5' : 'text-muted-foreground text-xs mt-0.5'}>
                    {store.storeCode}
                  </p>
                )}
                {store.isPrimary && (
                  <p className={theme === 'dark' ? 'text-[#c9a96e] text-[10px] mt-1 uppercase tracking-wider' : 'text-prats-navy text-[10px] mt-1 uppercase tracking-wider'}>
                    Tu tienda principal
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </GateShell>
  )
}

function GateShell({ children, theme }: { children: React.ReactNode; theme: 'dark' | 'light' }) {
  const bgStyle =
    theme === 'dark'
      ? { background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }
      : undefined
  return (
    <div
      style={bgStyle}
      className={
        theme === 'dark'
          ? 'fixed inset-0 z-50 flex flex-col items-center justify-center p-6'
          : 'fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-slate-50'
      }
    >
      {children}
    </div>
  )
}
