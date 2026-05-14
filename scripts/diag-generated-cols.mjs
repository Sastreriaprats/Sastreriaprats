import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Comprobamos qué columnas tiene clients para confirmar disponibilidad de first_name/last_name
const { data } = await sb.from('clients').select('id, first_name, last_name, full_name, email, phone, document_number, client_code').limit(1)
console.log('clients sample:', JSON.stringify(data?.[0], null, 2))
