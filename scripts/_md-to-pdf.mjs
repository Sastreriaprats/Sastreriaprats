// ============================================================
// scripts/_md-to-pdf.mjs
//
// Regenera los PDFs de la guía de administración a partir de los .md.
// Procesa exactamente dos ficheros (rutas fijas):
//   docs/GUIA_ADMIN.md     → docs/GUIA_ADMIN.pdf    (A4 paginada, pie con nº)
//   docs/CHULETA_ADMIN.md  → docs/CHULETA_ADMIN.pdf (1 sola página A4, autoescala)
//
// USO (desde sastreria-prats/):
//   node scripts/_md-to-pdf.mjs
//
// REQUISITOS:
//   - Node ≥ 20 (usamos ESM nativo + import dinámico)
//   - Dependencias npm (ya en package.json): `marked` y `playwright`
//   - El navegador de Playwright tiene que estar instalado UNA vez:
//       npx playwright install chromium
//     (sin esto la primera ejecución falla con "Executable doesn't exist").
//
// ESTILO: pensado para leerse bien también impreso en B/N
//   (negritas + bordes + fondos grises, no depende solo del color).
//
// Cuando edites los .md de docs/, ejecuta el script y se regeneran los PDFs.
// ============================================================
import { readFileSync, existsSync } from 'node:fs'
import { marked } from 'marked'
import { chromium } from 'playwright'

marked.setOptions({ gfm: true, breaks: false })

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 20pt; margin: 0 0 4pt; color: #14213d; }
  h2 { font-size: 14pt; margin: 18pt 0 7pt; padding-bottom: 3pt; border-bottom: 2px solid #14213d; color: #14213d; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 13pt 0 4pt; color: #14213d; page-break-after: avoid; }
  p, li { font-size: 10.5pt; line-height: 1.45; }
  ul, ol { margin: 4pt 0 4pt; padding-left: 18px; }
  li { margin: 2.5pt 0; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  a { color: #14213d; text-decoration: none; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; page-break-inside: avoid; }
  th, td { border: 1px solid #b0b0b0; padding: 5px 8px; font-size: 10pt; text-align: left; vertical-align: top; line-height: 1.35; }
  th { background: #e9ecef; font-weight: 700; }
  tr:nth-child(even) td { background: #f7f8fa; }
  blockquote { margin: 9pt 0; padding: 8px 11px; border-left: 4px solid #555; background: #f1f2f4; font-size: 10pt; page-break-inside: avoid; }
  blockquote p { margin: 3pt 0; font-size: 10pt; }
  hr { border: none; border-top: 1px solid #dcdcdc; margin: 12pt 0; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; background: #f1f2f4; padding: 1px 3px; border-radius: 3px; }
`

const CHEAT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.22; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 15pt; margin: 0 0 2pt; color: #14213d; }
  h2 { font-size: 10.5pt; margin: 8pt 0 3pt; padding-bottom: 2pt; border-bottom: 1.5px solid #14213d; color: #14213d; }
  p, li, td, th { font-size: 8.4pt; line-height: 1.22; }
  ul, ol { margin: 2pt 0; padding-left: 15px; }
  li { margin: 1pt 0; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  table { border-collapse: collapse; width: 100%; margin: 3pt 0; }
  th, td { border: 1px solid #b0b0b0; padding: 2.5px 5px; vertical-align: top; line-height: 1.2; }
  th { background: #e9ecef; font-weight: 700; }
  blockquote { margin: 3pt 0; padding: 3px 7px; border-left: 3px solid #555; background: #f1f2f4; }
  blockquote p { margin: 1pt 0; font-size: 8.2pt; }
  hr { display: none; }
`

function htmlDoc(css, bodyHtml) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${css}</style></head><body>${bodyHtml}</body></html>`
}

function countPdfPages(path) {
  const buf = readFileSync(path)
  const s = buf.toString('latin1')
  const m = s.match(/\/Type\s*\/Page(?![s])/g)
  return m ? m.length : -1
}

async function main() {
  const browser = await chromium.launch()

  // ---------- GUÍA (paginada) ----------
  {
    const md = readFileSync('docs/GUIA_ADMIN.md', 'utf8')
    const html = htmlDoc(BASE_CSS, marked.parse(md))
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })
    await page.pdf({
      path: 'docs/GUIA_ADMIN.pdf',
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%; font-size:8px; color:#666; padding:0 16mm; display:flex; justify-content:space-between;">' +
        '<span>Guía de administración — Sastrería Prats</span>' +
        '<span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>' +
        '</div>',
      margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
    })
    await page.close()
    console.log('GUIA_ADMIN.pdf →', countPdfPages('docs/GUIA_ADMIN.pdf'), 'páginas')
  }

  // ---------- CHULETA (1 sola página A4) ----------
  {
    const md = readFileSync('docs/CHULETA_ADMIN.md', 'utf8')
    const html = htmlDoc(CHEAT_CSS, marked.parse(md))
    const page = await browser.newPage()
    // Ancho útil de A4 con márgenes de 9mm → para que la medición de altura
    // coincida con el layout de impresión.
    const MARGIN_MM = 9
    const pxPerMm = 96 / 25.4
    const printableW = Math.round((210 - MARGIN_MM * 2) * pxPerMm)
    const printableH = (297 - MARGIN_MM * 2) * pxPerMm
    await page.setViewportSize({ width: printableW, height: Math.round(printableH) })
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })
    const contentH = await page.evaluate(() => document.documentElement.scrollHeight)
    // Escala para que entre en una página (con un pequeño margen de seguridad).
    let scale = Math.min(1, (printableH / contentH) * 0.97)
    scale = Math.max(0.5, scale) // playwright no admite < 0.1; mantenemos legible
    await page.pdf({
      path: 'docs/CHULETA_ADMIN.pdf',
      format: 'A4',
      printBackground: true,
      scale,
      margin: { top: `${MARGIN_MM}mm`, bottom: `${MARGIN_MM}mm`, left: `${MARGIN_MM}mm`, right: `${MARGIN_MM}mm` },
      pageRanges: '1',
    })
    await page.close()
    console.log(`CHULETA: contentH=${contentH}px printableH=${Math.round(printableH)}px scale=${scale.toFixed(3)} → ${countPdfPages('docs/CHULETA_ADMIN.pdf')} página(s)`)
  }

  await browser.close()
  console.log('OK')
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
