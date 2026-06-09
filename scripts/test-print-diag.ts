// Test headless de makePrintDiag: confirma que registra SOLO las ramas degradadas
// con el source/context correctos, y NO las limpias. Inyecta un spy como reporter
// (no toca la server action ni la BD). Ejecutar: npx tsx scripts/test-print-diag.ts
import { makePrintDiag, DEGRADED_PRINT_STAGES } from '../src/lib/client-telemetry'

let failed = 0
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failed++
}

type Call = { source: string; error: unknown; context?: Record<string, unknown> }
const calls: Call[] = []
const spy = (source: string, error: unknown, context?: Record<string, unknown>) =>
  calls.push({ source, error, context })

const diag = makePrintDiag(
  'reservation_ticket_print',
  { call: 'manual', reservation_number: 'R-1', lines: 2 },
  spy,
)

// Ramas limpias / informativas -> NO deben registrar nada
diag('blob-ready', { size: 1234 })
diag('print:iframe')
// Ramas degradadas -> SÍ deben registrar
diag('print:download', { fileName: 'reserva-R-1.pdf' })
diag('iframe-load-timeout')

check('solo 2 llamadas (las 2 degradadas)', calls.length === 2)
check('no registra print:iframe ni blob-ready', !calls.some(c => String(c.error).includes('iframe)')) && calls.length === 2)
check('source correcto', calls[0]?.source === 'reservation_ticket_print')
check('mensaje incluye el stage degradado', calls[0]?.error === 'print degradado: print:download')
check('context.stage = print:download', calls[0]?.context?.stage === 'print:download')
check('context conserva call', calls[0]?.context?.call === 'manual')
check('context conserva reservation_number', calls[0]?.context?.reservation_number === 'R-1')
check('context conserva lines', calls[0]?.context?.lines === 2)
check('context lleva el detail', (calls[0]?.context?.detail as { fileName?: string })?.fileName === 'reserva-R-1.pdf')
check('segunda llamada = iframe-load-timeout', calls[1]?.context?.stage === 'iframe-load-timeout')

// Sanity del set de ramas degradadas
check('set NO incluye print:iframe', !DEGRADED_PRINT_STAGES.has('print:iframe'))
check('set NO incluye blob-ready', !DEGRADED_PRINT_STAGES.has('blob-ready'))
check('set incluye print:window-open', DEGRADED_PRINT_STAGES.has('print:window-open'))
check('set incluye print:download-popup-blocked', DEGRADED_PRINT_STAGES.has('print:download-popup-blocked'))

// El source también funciona para venta
const calls2: Call[] = []
const diagSale = makePrintDiag('sale_ticket_print', { call: 'pos_sale', ticket_number: 'T-9' }, (s, e, c) =>
  calls2.push({ source: s, error: e, context: c }),
)
diagSale('print:window-open')
check('venta: registra window-open con source sale_ticket_print', calls2.length === 1 && calls2[0].source === 'sale_ticket_print')

console.log(failed === 0 ? '\nTEST 2: PASS' : `\nTEST 2: FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
