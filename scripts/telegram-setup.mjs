#!/usr/bin/env node
// Registra / consulta el webhook del bot de Telegram.
//
// Uso (desde la raíz del proyecto):
//   node scripts/telegram-setup.mjs set   https://tu-dominio.com   # registra el webhook
//   node scripts/telegram-setup.mjs info                            # estado del webhook
//   node scripts/telegram-setup.mjs delete                          # borra el webhook
//   node scripts/telegram-setup.mjs me                              # datos del bot (getMe)
//
// Lee TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET de .env.local (o del entorno).
// Si no pasas la URL en `set`, usa NEXT_PUBLIC_APP_URL.

import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* sin .env.local: usar solo process.env */
  }
}
loadEnvLocal()

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
if (!TOKEN) {
  console.error('Falta TELEGRAM_BOT_TOKEN')
  process.exit(1)
}

const API = `https://api.telegram.org/bot${TOKEN}`
const cmd = process.argv[2]

async function call(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return res.json()
}

async function main() {
  if (cmd === 'set') {
    const base = (process.argv[3] || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    if (!base) {
      console.error('Pasa la URL: node scripts/telegram-setup.mjs set https://tu-dominio.com')
      process.exit(1)
    }
    if (!SECRET) {
      console.error('Falta TELEGRAM_WEBHOOK_SECRET')
      process.exit(1)
    }
    const url = `${base}/api/telegram/webhook`
    const out = await call('setWebhook', {
      url,
      secret_token: SECRET,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: true,
    })
    console.log('setWebhook →', url)
    console.log(JSON.stringify(out, null, 2))
  } else if (cmd === 'info') {
    console.log(JSON.stringify(await call('getWebhookInfo'), null, 2))
  } else if (cmd === 'delete') {
    console.log(JSON.stringify(await call('deleteWebhook', { drop_pending_updates: true }), null, 2))
  } else if (cmd === 'me') {
    console.log(JSON.stringify(await call('getMe'), null, 2))
  } else if (cmd === 'updates') {
    // Descubrir chat ids ANTES de registrar el webhook (getUpdates no funciona con webhook activo).
    // Añade el bot al grupo, escribe algo y ejecuta este comando: verás el chat.id (negativo en grupos).
    const out = await call('getUpdates')
    const chats = (out.result || []).map((u) => {
      const m = u.message || u.edited_message || u.channel_post
      return m ? { id: m.chat?.id, type: m.chat?.type, title: m.chat?.title || m.chat?.username } : null
    })
    console.log('Chats vistos:', JSON.stringify(chats.filter(Boolean), null, 2))
  } else {
    console.log('Comandos: set <url> | info | delete | me | updates')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
