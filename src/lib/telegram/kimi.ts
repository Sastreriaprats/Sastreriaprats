// Motor de consultas en lenguaje natural para el bot de Telegram.
// Usa la API de Kimi (Moonshot), compatible con OpenAI, con function calling:
// el modelo genera SQL de solo lectura, nosotros lo ejecutamos (rpc_bot_readonly_query)
// y le devolvemos las filas; itera hasta poder responder en español.

import { DB_SCHEMA_CONTEXT } from './schema-context'

const KIMI_BASE = process.env.KIMI_API_BASE || 'https://api.moonshot.ai/v1'
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.6'
const MAX_STEPS = 6

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

const SYSTEM_PROMPT = `Eres el asistente de datos de "Sastrería Prats". Respondes preguntas del dueño sobre su negocio (ventas, cajas, comisiones, stock, pedidos, empleados) consultando la base de datos.

Herramienta disponible: "consultar_sql", que ejecuta UNA consulta SQL de solo lectura (SELECT o WITH) en PostgreSQL y te devuelve las filas en JSON.

Cómo trabajar:
- Traduce la pregunta a SQL usando el esquema de abajo. Ejecuta consultar_sql tantas veces como necesites.
- Si la consulta devuelve un error, léelo, corrige el SQL y reintenta.
- Nunca inventes tablas o columnas que no estén en el esquema. Si algo no se puede saber con estos datos, dilo con claridad.
- Cuando tengas los datos, responde en ESPAÑOL, breve y directo (es un chat de Telegram). Formatea el dinero como "1.234,56 €" (miles con punto, decimales con coma). Usa listas cortas o líneas simples. No muestres el SQL salvo que te lo pidan.
- Si la pregunta es ambigua, haz la interpretación más razonable y acláralo en una línea.
- CONTEXTO: tienes la conversación previa de este chat. Si el usuario hace una pregunta de seguimiento apoyándose en lo anterior ("¿y en la otra tienda?", "¿y el mes pasado?", "¿y de ese vendedor?"), resuélvela usando ese contexto (misma métrica, cambiando solo lo que indique). Si el seguimiento es realmente ambiguo, pídele una aclaración corta.

Esquema de la base de datos:
${DB_SCHEMA_CONTEXT}`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'consultar_sql',
      description:
        'Ejecuta una consulta SQL de solo lectura (una única sentencia SELECT o WITH) sobre la base de datos y devuelve las filas resultantes en JSON (máx 500 filas).',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'Una única consulta PostgreSQL SELECT o WITH. Sin punto y coma final ni varias sentencias.',
          },
        },
        required: ['sql'],
      },
    },
  },
]

async function kimiChat(messages: ChatMessage[]): Promise<{
  content: string | null
  tool_calls?: ToolCall[]
}> {
  const apiKey = process.env.KIMI_API_KEY
  if (!apiKey) throw new Error('KIMI_API_KEY no configurado')

  const res = await fetch(`${KIMI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      // Nota: kimi-k2.6 solo admite temperature=1, así que no la enviamos (default del modelo).
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Kimi API ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = await res.json()
  const msg = data?.choices?.[0]?.message
  return { content: msg?.content ?? null, tool_calls: msg?.tool_calls }
}

/** Turno previo de la conversación (solo texto) para dar contexto. */
export type HistoryTurn = { role: 'user' | 'assistant'; content: string }

/**
 * Responde una pregunta en lenguaje natural.
 * @param question texto del usuario
 * @param runSql   ejecuta el SQL y devuelve las filas (o lanza con el error de la BD)
 * @param history  turnos previos del chat (para preguntas de seguimiento)
 * @returns respuesta en español lista para enviar a Telegram
 */
export async function answerQuestion(
  question: string,
  runSql: (sql: string) => Promise<unknown>,
  history: HistoryTurn[] = []
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: question },
  ]

  for (let step = 0; step < MAX_STEPS; step++) {
    const { content, tool_calls } = await kimiChat(messages)

    if (!tool_calls || tool_calls.length === 0) {
      return content?.trim() || 'No he podido generar una respuesta.'
    }

    // Registrar el turno del asistente con sus tool_calls.
    messages.push({ role: 'assistant', content: content ?? null, tool_calls })

    // Ejecutar cada tool_call y devolver el resultado.
    for (const call of tool_calls) {
      let toolResult: string
      try {
        const args = JSON.parse(call.function.arguments || '{}')
        const sql = String(args.sql || '')
        if (!sql) throw new Error('Falta el parámetro sql')
        const rows = await runSql(sql)
        const json = JSON.stringify(rows)
        toolResult = json.length > 12000 ? json.slice(0, 12000) + '…(truncado)' : json
      } catch (e) {
        toolResult = `ERROR: ${e instanceof Error ? e.message : String(e)}`
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: toolResult,
      })
    }
  }

  // Se agotaron los pasos: pedir una respuesta final sin más herramientas.
  const { content } = await kimiChat([
    ...messages,
    { role: 'user', content: 'Responde ya con lo que tengas, en español y breve.' },
  ])
  return content?.trim() || 'La consulta era demasiado compleja. Prueba a reformularla.'
}
