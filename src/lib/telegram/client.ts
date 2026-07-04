// Cliente mínimo de la Bot API de Telegram (sin dependencias, usa fetch).

const API_BASE = 'https://api.telegram.org'

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN no configurado')
  return t
}

/** Trocea texto por debajo del límite de 4096 caracteres de Telegram. */
function chunk(text: string, size = 3900): string[] {
  if (text.length <= size) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > size) {
    // cortar por el último salto de línea antes del límite si es posible
    let cut = rest.lastIndexOf('\n', size)
    if (cut < size * 0.5) cut = size
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest.length) parts.push(rest)
  return parts
}

/**
 * Envía un mensaje de texto. Por defecto sin parse_mode (texto plano) para evitar
 * errores de formato con contenido dinámico; pasar 'HTML' o 'MarkdownV2' si el
 * texto ya viene escapado.
 */
export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { parseMode?: 'HTML' | 'MarkdownV2'; disablePreview?: boolean } = {}
): Promise<void> {
  for (const part of chunk(text)) {
    const res = await fetch(`${API_BASE}/bot${token()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: part,
        ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
        ...(opts.disablePreview ? { link_preview_options: { is_disabled: true } } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[Telegram] sendMessage falló:', res.status, body)
    }
  }
}

/** Indicador "escribiendo…" mientras se procesa la consulta. */
export async function sendTyping(chatId: number | string): Promise<void> {
  try {
    await fetch(`${API_BASE}/bot${token()}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    })
  } catch {
    /* no crítico */
  }
}
