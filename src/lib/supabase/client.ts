import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton: reutilizar la misma instancia en toda la app para evitar
// NavigatorLockAcquireTimeoutError por múltiples clientes compitiendo por el auth lock
let instance: SupabaseClient | null = null

export function createClient() {
  if (typeof window === 'undefined') {
    // En SSR no hay singleton — cada request es independiente
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  if (!instance) {
    instance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  return instance
}
