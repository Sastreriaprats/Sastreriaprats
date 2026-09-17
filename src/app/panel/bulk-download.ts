// Descarga en grupo del panel de tesorería: baja cada archivo por su URL y los
// empaqueta en un ZIP en el navegador (sin pasar el binario por el servidor).
import { zipSync } from 'fflate'

// Cada archivo llega por URL (facturas, adjuntos) o se genera al vuelo en el
// navegador (tickets y cobros, que no tienen PDF guardado).
export type ZipItem = { name: string; url?: string | null; blob?: () => Promise<Blob | null> }

// Nombre de archivo seguro y sin repetir dentro del ZIP
function uniqueName(raw: string, used: Set<string>) {
  const clean = raw.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'documento'
  const dot = clean.lastIndexOf('.')
  const stem = dot > 0 ? clean.slice(0, dot) : clean
  const ext = dot > 0 ? clean.slice(dot) : ''
  let name = clean, i = 1
  while (used.has(name.toLowerCase())) name = `${stem} (${++i})${ext}`
  used.add(name.toLowerCase())
  return name
}

// Extensión del archivo según su URL (los adjuntos de proveedor pueden ser
// imágenes); por defecto .pdf
export function extFromUrl(url: string | null | undefined) {
  const m = String(url ?? '').split('?')[0].match(/\.([a-z0-9]{2,5})$/i)
  return m ? `.${m[1].toLowerCase()}` : '.pdf'
}

export async function downloadZip(
  items: ZipItem[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; failed: string[] }> {
  const files: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  const failed: string[] = []
  let done = 0, next = 0
  const worker = async () => {
    while (next < items.length) {
      const it = items[next++]
      try {
        let buf: ArrayBuffer
        if (it.blob) {
          const b = await it.blob()
          if (!b) throw new Error('sin archivo')
          buf = await b.arrayBuffer()
        } else {
          if (!it.url) throw new Error('sin archivo')
          const res = await fetch(it.url)
          if (!res.ok) throw new Error(String(res.status))
          buf = await res.arrayBuffer()
        }
        files[uniqueName(it.name, used)] = new Uint8Array(buf)
      } catch {
        failed.push(it.name)
      }
      onProgress?.(++done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker))
  if (failed.length) {
    files[uniqueName('_no_descargadas.txt', used)] = new TextEncoder().encode(failed.join('\r\n'))
  }
  // Los PDF ya van comprimidos: level 0 = empaquetar sin recomprimir (rápido)
  const zipped = zipSync(files, { level: 0 })
  const blob = new Blob([zipped as BlobPart], { type: 'application/zip' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  return { ok: items.length - failed.length, failed }
}
