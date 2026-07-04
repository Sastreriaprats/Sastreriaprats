import { NextRequest, NextResponse } from 'next/server'
import { buildDailyReport } from '@/lib/telegram/daily-report'
import { sendMessage } from '@/lib/telegram/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Hora (0-23) y día de la semana ('Mon'..'Sun') actuales en Madrid. */
function madridNow(): { hour: number; weekday: string } {
  const now = new Date()
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now)
  )
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
  }).format(now) // 'Mon', 'Tue', ... 'Sun'
  return { hour, weekday }
}

/**
 * ¿Toca enviar ahora? Lunes a viernes a las 21:30 y sábados a las 14:30 (hora de
 * Madrid). Domingos no se envía. El minuto lo garantiza el cron (dispara a :30).
 */
function shouldSend(hour: number, weekday: string): boolean {
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday)
  const isSaturday = weekday === 'Sat'
  return (isWeekday && hour === 21) || (isSaturday && hour === 14)
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Vercel Cron es UTC y no soporta zonas horarias. Programamos varios disparos
  // (ver vercel.json) que cubren las franjas de verano/invierno, y aquí filtramos
  // por hora+día en Madrid: L-V a las 21h y sábados a las 14h. Así cae siempre a
  // la hora local correcta con el cambio de hora incluido.
  // ?force=1 permite disparo manual de prueba saltándose el guardado.
  const force = request.nextUrl.searchParams.get('force') === '1'
  const { hour, weekday } = madridNow()
  if (!force && !shouldSend(hour, weekday)) {
    return NextResponse.json({
      skipped: true,
      reason: `Fuera de ventana (Madrid ${weekday} ${hour}h). Envíos: L-V 21:30, Sáb 14:30`,
    })
  }

  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID
  if (!chatId) {
    return NextResponse.json({ error: 'TELEGRAM_REPORT_CHAT_ID no configurado' }, { status: 500 })
  }

  try {
    const report = await buildDailyReport()
    await sendMessage(chatId, report)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Daily report] error:', e)
    // Avisar al chat de que falló, para no quedarnos sin señal.
    try {
      await sendMessage(chatId, '⚠️ No se pudo generar el reporte diario de facturación.')
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
