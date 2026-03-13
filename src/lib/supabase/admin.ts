import { createClient } from '@supabase/supabase-js'

// Service role client — NEVER expose to browser
// Use only in Server Actions, API routes, and server-side code
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminInstance: ReturnType<typeof createClient<any>> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminClient(): ReturnType<typeof createClient<any>> {
  if (!adminInstance) {
    adminInstance = createClient<any>(
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
  return adminInstance!
}
