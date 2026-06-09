/**
 * Telemetría de cliente: envía a `client_error_log` (vía la server action
 * logClientError) errores y ramas degradadas que solo ocurren en el navegador y
 * hoy se tragan en silencio (caso: "no imprime el ticket de cobro de reserva").
 *
 * REGLA DE ORO: NUNCA debe romper el flujo que la llama. Todas las llamadas
 * cuelgan un `.catch(() => {})`, así que un fallo de red/telemetría jamás
 * interrumpe la impresión.
 */
'use client'

import type { PrintDiag } from '@/components/pos/ticket-pdf'

/** Firma del sumidero de telemetría (inyectable para test). */
export type ClientErrorReporter = (
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
) => void

/**
 * Registra un error/incidencia de cliente sin propagar nunca el fallo. La server
 * action se carga de forma perezosa (import dinámico): así este módulo no arrastra
 * el grafo de servidor hasta que de verdad hay algo que reportar.
 */
export function reportClientError(
  source: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  const error_message =
    error instanceof Error ? error.message : error != null ? String(error) : null
  import('@/actions/client-errors')
    .then(({ logClientError }) =>
      logClientError({
        source,
        error_message,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        context,
      }),
    )
    .catch(() => {}) // import o action fallida: nunca rompe el flujo
}

/**
 * Ramas de impresión que indican que NO se imprimió por el camino normal
 * (iframe). Cualquiera de ellas se registra como incidencia; el camino limpio
 * `print:iframe` (y el informativo `blob-ready`) NO se registran, para no meter
 * ruido.
 */
export const DEGRADED_PRINT_STAGES = new Set<string>([
  'print:download',
  'print:download-popup-blocked',
  'print:window-open',
  'print:window-fallback',
  'iframe-error',
  'iframe-load-timeout',
])

/**
 * Construye un callback `PrintDiag` para pasar a printTicketPdf/printReservationPdf.
 * Registra automáticamente las ramas degradadas (sin excepción) en client_error_log.
 * El error real (getBlob que se cuelga, throw) NO pasa por aquí: lo captura el
 * try/catch del call-site, que llama a reportClientError directamente.
 *
 * `report` es inyectable solo para test; en producción usa el sumidero real.
 */
export function makePrintDiag(
  source: string,
  context: Record<string, unknown> = {},
  report: ClientErrorReporter = reportClientError,
): PrintDiag {
  return (stage, detail) => {
    if (DEGRADED_PRINT_STAGES.has(stage)) {
      report(source, `print degradado: ${stage}`, { ...context, stage, detail })
    }
  }
}
