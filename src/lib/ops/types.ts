// Tipos compartidos del módulo interno (sin 'use server', solo tipos).

export type LedgerPayload = {
  kind: 'erp' | 'manual'
  date: string            // YYYY-MM-DD
  concept: string
  direction: 'in' | 'out' // cobro / pago
  base: number
  vat: number
  amount: number
  includeInC: boolean
  source?: string
  sourceId?: string
}

export type LedgerLine = LedgerPayload & { id: string }

export type Metrics = {
  facturacion: number
  gastos: number
  resultado: number
  ivaRepercutido: number
  ivaSoportado: number
  ivaAPagar: number
}

export type ScenarioResult = {
  A: Metrics
  C: Metrics
  removed: { base: number; vat: number; lines: number }
}
