import { NextRequest, NextResponse } from 'next/server'
import { buildDailyReport } from '@/lib/telegram/daily-report'
import { sendMessage } from '@/lib/telegram/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Hora (0-23) actual en Madrid. */
function madridHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  )
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Vercel Cron es UTC y no soporta zonas horarias. Programamos dos disparos
  // (19:30 y 20:30 UTC) y solo enviamos cuando en Madrid son las 21h; así el
  // reporte cae a las 21:30 locales tanto en horario de verano como de invierno.
  // ?force=1 permite disparo manual de prueba saltándose el guardado de hora.
  const force = request.nextUrl.searchParams.get('force') === '1'
  if (!force && madridHour() !== 21) {
    return NextResponse.json({ skipped: true, reason: 'Fuera de la ventana de las 21:30 Madrid' })
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
