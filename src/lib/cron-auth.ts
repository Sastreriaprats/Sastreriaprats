// Autorización compartida de los endpoints /api/cron/*.
//
// Contexto: los crons dejaron de ejecutarse a finales de abril de 2026 porque la
// env var CRON_SECRET no existe en el proyecto de Vercel: sin ella Vercel no manda
// el header Authorization en los disparos, y el guard antiguo comparaba contra
// `Bearer ${undefined}`, que además dejaba pasar a cualquiera que enviara
// literalmente "Bearer undefined". El scheduling pasó a pg_cron + pg_net dentro
// de Supabase (jobs 'cron-*', ver tabla cron.job) y este guard acepta dos
// credenciales:
//
// 1. `Bearer ${CRON_SECRET}` si la env var está definida (compatibilidad con
//    Vercel Cron si algún día se configura la variable en el dashboard).
// 2. `Bearer ${sha256('cron-auth:' + TELEGRAM_BOT_TOKEN)}` — secreto derivado de
//    una variable que producción ya tiene; es el que usan los jobs de pg_cron.
//    OJO: si se rota TELEGRAM_BOT_TOKEN hay que regenerar el header de esos jobs.
//
// Falla cerrado: sin ninguna de las dos variables definidas, nada está autorizado.

import { createHash } from 'crypto'

export function isAuthorizedCron(authHeader: string | null): boolean {
  if (!authHeader) return false

  // trim(): la env var de Vercel puede llevar whitespace pegado (el token de prod
  // tiene un \n final); el secreto canónico se deriva siempre del valor limpio.
  const envSecret = (process.env.CRON_SECRET || '').trim()
  if (envSecret && authHeader === `Bearer ${envSecret}`) return true

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
  if (botToken) {
    const derived = createHash('sha256').update(`cron-auth:${botToken}`).digest('hex')
    if (authHeader === `Bearer ${derived}`) return true
  }

  return false
}
