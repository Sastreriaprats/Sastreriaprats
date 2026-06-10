// Test headless de createPrintReporter: confirma que (a) registra SOLO las ramas
// degradadas con source/context correctos, NO las limpias; (b) reportError adjunta
// TODOS los eventos de diagnóstico acumulados (logo/vfs/getblob_retry_no_logo).
// Inyecta un spy como reporter (no toca la server action ni la BD).
// Ejecutar: npx tsx scripts/test-print-diag.ts
import { createPrintReporter, DEGRADED_PRINT_STAGES } from '../src/lib/client-telemetry'

let failed = 0
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failed++
}

type Call = { source: string; error: unknown; context?: Record<string, unknown> }

// --- A) ramas degradadas se registran al vuelo, las limpias no ---
const calls: Call[] = []
const spy = (source: string, error: unknown, context?: Record<string, unknown>) =>
  calls.push({ source, error, context })

const { diag } = createPrintReporter(
  'reservation_ticket_print',
  { call: 'manual', reservation_number: 'R-1', lines: 2 },
  spy,
)

diag('vfs', { keys: 6 })          // diagnóstico: NO registra al vuelo
diag('logo', { loaded: true, mime: 'image/png', bytes: 1000, ms: 12 }) // NO al vuelo
diag('blob-ready', { size: 1234 }) // limpio: NO
diag('print:iframe')               // limpio: NO
diag('print:download', { fileName: 'reserva-R-1.pdf' }) // degradado: SÍ
diag('iframe-load-timeout')        // degradado: SÍ

check('solo 2 registros al vuelo (las 2 degradadas)', calls.length === 2)
check('source correcto', calls[0]?.source === 'reservation_ticket_print')
check('mensaje incluye el stage degradado', calls[0]?.error === 'print degradado: print:download')
check('contexto base conservado (call)', calls[0]?.context?.call === 'manual')
check('contexto base conservado (reservation_number)', calls[0]?.context?.reservation_number === 'R-1')
check('degradado adjunta eventos previos (vfs)', (calls[0]?.context?.vfs as { keys?: number })?.keys === 6)
check('degradado adjunta eventos previos (logo)', (calls[0]?.context?.logo as { loaded?: boolean })?.loaded === true)
check('degradado lleva su propio detail (print:download)', (calls[0]?.context?.['print:download'] as { fileName?: string })?.fileName === 'reserva-R-1.pdf')

// --- B) reportError adjunta TODOS los eventos acumulados (caso real: timeout getBlob) ---
const errCalls: Call[] = []
const r2 = createPrintReporter(
  'reservation_ticket_print',
  { call: 'manual', reservation_number: 'RSV-2026-0026', lines: 1 },
  (s, e, c) => errCalls.push({ source: s, error: e, context: c }),
)
r2.diag('vfs', { keys: 4 })
r2.diag('logo', { loaded: true, mime: 'image/png', bytes: 14973, ms: 5 })
r2.reportError(new Error('Tiempo de espera agotado generando PDF'))

check('reportError registra 1 vez', errCalls.length === 1)
check('reportError pasa el Error real', errCalls[0]?.error instanceof Error)
check('reportError adjunta vfs', (errCalls[0]?.context?.vfs as { keys?: number })?.keys === 4)
check('reportError adjunta logo', (errCalls[0]?.context?.logo as { bytes?: number })?.bytes === 14973)
check('reportError conserva contexto base', errCalls[0]?.context?.reservation_number === 'RSV-2026-0026')

// --- C) sanity del set de ramas degradadas ---
check('set NO incluye print:iframe', !DEGRADED_PRINT_STAGES.has('print:iframe'))
check('set NO incluye blob-ready', !DEGRADED_PRINT_STAGES.has('blob-ready'))
check('set NO incluye vfs ni logo (telemetría durable, no degradada)', !DEGRADED_PRINT_STAGES.has('vfs') && !DEGRADED_PRINT_STAGES.has('logo'))
check('set incluye print:window-open', DEGRADED_PRINT_STAGES.has('print:window-open'))
check('set incluye print:download-popup-blocked', DEGRADED_PRINT_STAGES.has('print:download-popup-blocked'))

console.log(failed === 0 ? '\nTEST 2: PASS' : `\nTEST 2: FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
