import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type VerifyResult =
  | { valid: true; clientId: string }
  | { valid: false; expired?: boolean; reason: 'malformed' | 'invalid_signature' | 'expired' | 'invalid_payload' }

interface TokenPayload {
  clientId: string
  ts: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getSecret(): string {
  const secret = process.env.NEWSLETTER_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      'NEWSLETTER_TOKEN_SECRET no está configurada. Genera una con `openssl rand -base64 32` y añádela a .env.local.'
    )
  }
  return secret
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

export function generateOptInToken(clientId: string): string {
  const secret = getSecret()
  const payload: TokenPayload = { clientId, ts: Date.now() }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = sign(payloadB64, secret)
  return `${payloadB64}.${sig}`
}

export function verifyOptInToken(token: string): VerifyResult {
  const secret = getSecret()

  if (typeof token !== 'string' || token.length === 0) {
    return { valid: false, reason: 'malformed' }
  }
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'malformed' }
  }
  const [payloadB64, sigB64] = parts

  const expectedSig = sign(payloadB64, secret)
  let received: Buffer
  let expected: Buffer
  try {
    received = Buffer.from(sigB64, 'base64url')
    expected = Buffer.from(expectedSig, 'base64url')
  } catch {
    return { valid: false, reason: 'invalid_signature' }
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { valid: false, reason: 'invalid_signature' }
  }

  let payload: TokenPayload
  try {
    const raw = Buffer.from(payloadB64, 'base64url').toString('utf8')
    payload = JSON.parse(raw) as TokenPayload
  } catch {
    return { valid: false, reason: 'invalid_payload' }
  }
  if (typeof payload.clientId !== 'string' || !UUID_RE.test(payload.clientId)) {
    return { valid: false, reason: 'invalid_payload' }
  }
  if (typeof payload.ts !== 'number' || !Number.isFinite(payload.ts)) {
    return { valid: false, reason: 'invalid_payload' }
  }

  if (Date.now() - payload.ts > TOKEN_TTL_MS) {
    return { valid: false, expired: true, reason: 'expired' }
  }

  return { valid: true, clientId: payload.clientId }
}
