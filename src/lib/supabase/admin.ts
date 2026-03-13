import { createClient } from '@supabase/supabase-js'

// Service role client — NEVER expose to browser
// Use only in Server Actions, API routes, and server-side code
let adminInstance: ReturnType<typeof createClient> | null = null

export function createAdminClient() {
  if (!adminInstance) {
    adminInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }
  return adminInstance
}
