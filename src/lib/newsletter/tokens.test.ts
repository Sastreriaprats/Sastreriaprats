/**
 * Tests para src/lib/newsletter/tokens.ts
 *
 * El proyecto no tiene framework de tests configurado (ni vitest, ni jest).
 * Estos tests usan `node:test` (nativo desde Node 18+) y se ejecutan con tsx:
 *
 *   NEWSLETTER_TOKEN_SECRET=test-secret npx tsx --test src/lib/newsletter/tokens.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NEWSLETTER_TOKEN_SECRET ??= 'test-secret-for-tokens-tests'

import { generateOptInToken, verifyOptInToken } from './tokens'

const SAMPLE_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440000'

test('genera y verifica un token recién creado', () => {
  const token = generateOptInToken(SAMPLE_CLIENT_ID)
  const r = verifyOptInToken(token)
  assert.equal(r.valid, true)
  if (r.valid) assert.equal(r.clientId, SAMPLE_CLIENT_ID)
})

test('rechaza un token con firma manipulada', () => {
  const token = generateOptInToken(SAMPLE_CLIENT_ID)
  const [payload, sig] = token.split('.')
  // Cambiamos un carácter de la firma manteniendo length y charset base64url
  const tampered = sig[0] === 'A' ? 'B' + sig.slice(1) : 'A' + sig.slice(1)
  const r = verifyOptInToken(`${payload}.${tampered}`)
  assert.equal(r.valid, false)
  if (!r.valid) assert.equal(r.reason, 'invalid_signature')
})

test('rechaza un token con payload manipulado (firma original ya no cuadra)', () => {
  const token = generateOptInToken(SAMPLE_CLIENT_ID)
  const [, sig] = token.split('.')
  const fakePayload = Buffer.from(
    JSON.stringify({ clientId: SAMPLE_CLIENT_ID, ts: 0 }),
    'utf8'
  ).toString('base64url')
  const r = verifyOptInToken(`${fakePayload}.${sig}`)
  assert.equal(r.valid, false)
  if (!r.valid) assert.equal(r.reason, 'invalid_signature')
})

test('marca como expirado un token de hace 31 días', () => {
  // No podemos retroceder Date.now() sin mocks, así que firmamos a mano un payload viejo.
  const { createHmac } = require('node:crypto') as typeof import('node:crypto')
  const oldTs = Date.now() - 31 * 24 * 60 * 60 * 1000
  const payload = Buffer.from(
    JSON.stringify({ clientId: SAMPLE_CLIENT_ID, ts: oldTs }),
    'utf8'
  ).toString('base64url')
  const sig = createHmac('sha256', process.env.NEWSLETTER_TOKEN_SECRET!)
    .update(payload)
    .digest('base64url')
  const r = verifyOptInToken(`${payload}.${sig}`)
  assert.equal(r.valid, false)
  if (!r.valid) {
    assert.equal(r.expired, true)
    assert.equal(r.reason, 'expired')
  }
})

test('rechaza tokens mal formados', () => {
  for (const bad of ['', '   ', 'sin-punto', '.', 'a.', '.b', 'a.b.c']) {
    const r = verifyOptInToken(bad)
    assert.equal(r.valid, false, `debería rechazar: "${bad}"`)
  }
})

test('rechaza payload sin clientId UUID válido', () => {
  const { createHmac } = require('node:crypto') as typeof import('node:crypto')
  const payload = Buffer.from(
    JSON.stringify({ clientId: 'not-a-uuid', ts: Date.now() }),
    'utf8'
  ).toString('base64url')
  const sig = createHmac('sha256', process.env.NEWSLETTER_TOKEN_SECRET!)
    .update(payload)
    .digest('base64url')
  const r = verifyOptInToken(`${payload}.${sig}`)
  assert.equal(r.valid, false)
  if (!r.valid) assert.equal(r.reason, 'invalid_payload')
})
