/**
 * Helpers compartidos para integración RedSys / SIS / Sermepa.
 *
 * Se usa desde:
 *  - /api/public/checkout/route.ts          (firma OUTGOING al iniciar pago)
 *  - /api/public/checkout/redsys-redirect   (HTML autosubmit form con firma)
 *  - /api/webhooks/redsys/route.ts          (verificación de firma INCOMING)
 *
 * Protocolo RedSys SIS (HMAC_SHA256_V1):
 *  1. Codificar merchantParams: JSON → UTF-8 → base64
 *  2. Derivar clave: 3DES-CBC(secretKeyBase64, IV=0, Ds_Merchant_MerchantOrder padded 16 bytes)
 *  3. Firma: HMAC-SHA256(claveDerivada, encodedParams), salida base64
 *  4. Enviar form POST con Ds_SignatureVersion + Ds_MerchantParameters + Ds_Signature
 *
 * El webhook recibe los mismos 3 campos en form-data: con la misma derivación
 * (Ds_Order viene dentro de los merchantParams) se recalcula la firma y se
 * compara con la recibida (normalizada URL-safe base64).
 */
import crypto from 'crypto'

/** JSON → UTF-8 → base64 (formato Ds_MerchantParameters que espera RedSys). */
export function encodeMerchantParameters(params: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(params), 'utf8').toString('base64')
}

/** base64 → UTF-8 → JSON (lo que llega en el webhook o respuesta de RedSys). */
export function decodeMerchantParameters(encoded: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
}

/**
 * Diversifica la clave secreta del comercio con el número de pedido usando
 * 3DES-CBC sin padding y devuelve los 8 bytes resultantes (clave para HMAC).
 *
 * - `secretKeyBase64`: la clave secreta tal como la entrega el banco (24 bytes en base64).
 * - `merchantOrder`: el Ds_Order (4-12 chars). Se padea con ceros a 16 bytes
 *    porque 3DES-CBC requiere bloques múltiplos de 8 y RedSys especifica 16.
 */
export function deriveMerchantKey(secretKeyBase64: string, merchantOrder: string): Buffer {
  const keyBuffer = Buffer.from(secretKeyBase64, 'base64')
  const iv = Buffer.alloc(8, 0)
  const orderPadded = Buffer.alloc(16, 0)
  Buffer.from(merchantOrder, 'utf8').copy(orderPadded)
  const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(orderPadded), cipher.final()])
}

/**
 * Calcula la firma RedSys (HMAC_SHA256_V1):
 *   HMAC-SHA256(deriveMerchantKey(secretKey, merchantOrder), encodedParams) → base64
 *
 * `encodedParams` es la cadena base64 ya construida (no el objeto). `merchantOrder`
 * debe ser exactamente el mismo valor que está dentro de los merchantParams
 * (Ds_Merchant_MerchantOrder para outgoing, Ds_Order para incoming).
 */
export function computeRedsysSignature(
  encodedParams: string,
  merchantOrder: string,
  secretKeyBase64: string,
): string {
  const derivedKey = deriveMerchantKey(secretKeyBase64, merchantOrder)
  const hmac = crypto.createHmac('sha256', derivedKey)
  hmac.update(encodedParams)
  return hmac.digest('base64')
}

/**
 * Compara la firma recibida con la calculada. RedSys devuelve la firma en
 * base64 URL-safe (`-` y `_` en lugar de `+` y `/`, sin padding) en el webhook,
 * así que normalizamos ambos lados antes de comparar.
 */
export function verifyRedsysSignature(
  receivedSignature: string,
  encodedParams: string,
  merchantOrder: string,
  secretKeyBase64: string,
): boolean {
  const calculated = computeRedsysSignature(encodedParams, merchantOrder, secretKeyBase64)
  const normalize = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return normalize(calculated) === normalize(receivedSignature)
}

/**
 * Genera un Ds_Order que cumple el formato RedSys:
 *  - Longitud 4-12 caracteres
 *  - Los 4 primeros son numéricos
 *  - Único por pedido
 *
 * Estrategia: 8 últimos dígitos del timestamp + 4 dígitos aleatorios = 12 chars
 * todos numéricos (cumple ambas reglas con margen). La probabilidad de colisión
 * en una misma sastrería es despreciable.
 */
export function generateRedsysOrder(): string {
  const timestamp = Date.now().toString().slice(-8)
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${timestamp}${random}`
}
