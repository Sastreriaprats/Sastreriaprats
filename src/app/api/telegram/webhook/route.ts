import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { answerQuestion, type HistoryTurn } from '@/lib/telegram/kimi'
import { sendMessage, sendTyping } from '@/lib/telegram/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HELP = `👋 Soy el asistente de Sastrería Prats. Pregúntame cualquier cosa del negocio en lenguaje natural. Ejemplos:

• ¿Cuánto se ha vendido hoy en Wellington?
• Comisiones de [empleado] este mes
• Stock de la americana azul
• Ventas de sastrería de la semana por tienda
• Top 5 vendedores del mes

Recuerdo el hilo de la conversación: puedes preguntarme cosas de seguimiento ("¿y en la otra tienda?", "¿y el mes pasado?").

Comandos: /start ayuda · /id ver el id de este chat · /reset empezar conversación nueva`

/** Lista blanca de chats que pueden consultar (env, separados por coma) + chat del reporte. */
function allowedChats(): Set<string> {
  const raw = [process.env.TELEGRAM_ALLOWED_CHAT_IDS, process.env.TELEGRAM_REPORT_CHAT_ID]
    .filter(Boolean)
    .join(',')
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

/** Ejecuta el SQL generado por la IA a través de la RPC de solo lectura. */
async function runSql(sql: string): Promise<unknown> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rpc_bot_readonly_query', { p_sql: sql })
  if (error) throw new Error(error.message)
  return data
}

// ── Memoria de conversación por chat ────────────────────────────────────────
const HISTORY_WINDOW_MIN = 120 // solo contexto de las últimas 2 horas
const HISTORY_MAX = 16 // últimos 16 mensajes (8 intercambios)

/** Carga los últimos turnos del chat, en orden cronológico. */
async function loadHistory(chatId: number): Promise<HistoryTurn[]> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - HISTORY_WINDOW_MIN * 60000).toISOString()
  const { data } = await admin
    .from('telegram_chat_history')
    .select('role, content')
    .eq('chat_id', chatId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(HISTORY_MAX)
  return ((data as HistoryTurn[]) || []).reverse()
}

/** Guarda el turno (pregunta del usuario + respuesta del asistente). */
async function saveTurn(chatId: number, question: string, answer: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('telegram_chat_history').insert([
    { chat_id: chatId, role: 'user', content: question },
    { chat_id: chatId, role: 'assistant', content: answer },
  ])
}

/** Borra el historial de un chat (comando /reset). */
async function resetHistory(chatId: number): Promise<void> {
  const admin = createAdminClient()
  await admin.from('telegram_chat_history').delete().eq('chat_id', chatId)
}

export async function POST(request: NextRequest) {
  // 1. Verificar el secret token que Telegram envía en cada webhook.
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: Record<string, unknown>
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Aceptar mensajes nuevos o editados; ignorar el resto (callbacks, etc.).
  const message = (update.message || update.edited_message) as
    | { chat?: { id?: number }; text?: string }
    | undefined
  const chatId = message?.chat?.id
  const text = (message?.text || '').trim()

  if (!chatId || !text) {
    return NextResponse.json({ ok: true })
  }

  const chatKey = String(chatId)

  try {
    // Comandos abiertos (útiles para configurar el grupo antes del whitelist).
    if (text === '/start' || text === '/help' || text.startsWith('/start@') || text.startsWith('/help@')) {
      await sendMessage(chatId, HELP)
      return NextResponse.json({ ok: true })
    }
    if (text === '/id' || text.startsWith('/id@')) {
      await sendMessage(chatId, `El id de este chat es: ${chatKey}`)
      return NextResponse.json({ ok: true })
    }

    // Autorización.
    if (!allowedChats().has(chatKey)) {
      await sendMessage(
        chatId,
        `⛔ Este chat no está autorizado.\nid de este chat: ${chatKey}\nPide que se añada a TELEGRAM_ALLOWED_CHAT_IDS.`
      )
      return NextResponse.json({ ok: true })
    }

    // Reiniciar el contexto de la conversación.
    if (text === '/reset' || text === '/nuevo' || text.startsWith('/reset@') || text.startsWith('/nuevo@')) {
      await resetHistory(chatId)
      await sendMessage(chatId, '🧹 Conversación reiniciada. Empezamos de cero.')
      return NextResponse.json({ ok: true })
    }

    // Consulta en lenguaje natural, con memoria del hilo.
    await sendTyping(chatId)
    const history = await loadHistory(chatId)
    const answer = await answerQuestion(text, runSql, history)
    await sendMessage(chatId, answer)
    await saveTurn(chatId, text, answer)
  } catch (e) {
    console.error('[Telegram webhook] error:', e)
    try {
      await sendMessage(chatId, '⚠️ Ha ocurrido un error procesando tu consulta. Inténtalo de nuevo en un momento.')
    } catch {
      /* ignore */
    }
  }

  // Siempre 200 para que Telegram no reintente el update.
  return NextResponse.json({ ok: true })
}
