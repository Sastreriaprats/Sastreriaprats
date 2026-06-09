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
 * Crea el par { diag, reportError } para instrumentar una impresión.
 *
 * - `diag` se pasa a printTicketPdf/printReservationPdf. Acumula TODOS los eventos
 *   (logo, vfs, getblob_retry_no_logo, ramas de impresión…) en un objeto interno.
 *   Las ramas DEGRADADAS (sin excepción) se registran al vuelo, ya con todo el
 *   contexto acumulado hasta ese punto.
 * - `reportError(err)` lo llama el `catch` del call-site: registra el error real
 *   (p.ej. el timeout de getBlob) ADJUNTANDO todos los eventos de diagnóstico
 *   acumulados — así el log del fallo lleva logo/vfs/reintento sin logo.
 *
 * Ninguna de las dos rompe nunca el flujo (reportClientError es fire-and-forget).
 * `report` es inyectable solo para test.
 */
export function createPrintReporter(
  source: string,
  context: Record<string, unknown> = {},
  report: ClientErrorReporter = reportClientError,
): { diag: PrintDiag; reportError: (error: unknown) => void } {
  const collected: Record<string, unknown> = {}
  const diag: PrintDiag = (stage, detail) => {
    collected[stage] = detail === undefined ? true : detail
    if (DEGRADED_PRINT_STAGES.has(stage)) {
      report(source, `print degradado: ${stage}`, { ...context, ...collected })
    }
  }
  const reportError = (error: unknown) => {
    report(source, error, { ...context, ...collected })
  }
  return { diag, reportError }
}
