/**
 * Helpers de PDF que solo se usan en servidor (sharp, fs, path).
 * Importar solo desde código que corre en Node (p. ej. invoice-pdf.ts).
 */

import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'
import { LOGO_BASE64 } from './pdf-company'

/**
 * Lee el logo del filesystem, lo procesa con sharp (fondo blanco → transparente,
 * firma → blanco) y devuelve data URL PNG base64 para usar sobre fondo azul.
 */
export async function getLogoBase64Processed(): Promise<string | null> {
  const logoPath = path.join(process.cwd(), 'public', 'logo-prats.png')
  try {
    const logoBuffer = await fs.readFile(logoPath)
    const { data, info } = await sharp(logoBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }) as { data: Buffer; info: { width: number; height: number; channels: number } }

    const threshold = 200
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      if (r > threshold && g > threshold && b > threshold) {
        data[i + 3] = 0
      } else {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
      }
    }

    const pngBuffer = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer()

    return `data:image/png;base64,${pngBuffer.toString('base64')}`
  } catch {
    return LOGO_BASE64
  }
}
