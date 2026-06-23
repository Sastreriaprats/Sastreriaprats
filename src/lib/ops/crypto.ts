import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'node:crypto'

// Cifrado de datos internos. Clave maestra en OPS_DATA_KEY (32 bytes base64),
// fuera del repo (env de Vercel / .env.local). De ella se derivan dos subclaves
// independientes: una para AES-256-GCM (sellado de contenido) y otra para HMAC
// (etiqueta de deduplicación opaca).
//
// Formato del blob sellado:  iv(12) || authTag(16) || ciphertext

const RAW = process.env.OPS_DATA_KEY

function master(): Buffer {
  if (!RAW) throw new Error('OPS_DATA_KEY no configurada')
  const buf = Buffer.from(RAW, 'base64')
  if (buf.length < 32) throw new Error('OPS_DATA_KEY inválida: se esperan 32 bytes (base64)')
  return buf
}

const encKey = () => createHash('sha256').update(master()).update('enc').digest() // 32 bytes
const macKey = () => createHash('sha256').update(master()).update('mac').digest() // 32 bytes

/** ¿Hay clave configurada? (para fallar de forma controlada si falta). */
export function isCryptoConfigured(): boolean {
  return !!RAW
}

/** Sella un objeto -> blob (Buffer) listo para columna bytea. */
export function seal(obj: unknown): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv)
  const pt = Buffer.from(JSON.stringify(obj), 'utf8')
  const ct = Buffer.concat([cipher.update(pt), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct])
}

/** Abre un blob sellado -> objeto. Lanza si la clave no corresponde o está manipulado. */
export function open<T = unknown>(blob: Buffer): T {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', encKey(), iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return JSON.parse(pt.toString('utf8')) as T
}

/** Etiqueta opaca y estable para deduplicar importaciones sin revelar la referencia. */
export function dedupTag(ref: string): Buffer {
  return createHmac('sha256', macKey()).update(ref).digest()
}
