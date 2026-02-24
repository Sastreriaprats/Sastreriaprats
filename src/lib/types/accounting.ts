/**
 * Tipos de contabilidad: plan contable, asientos, facturas, gastos, comisiones.
 */

export type {
  ChartOfAccount,
  NewChartOfAccount,
  JournalEntry,
  NewJournalEntry,
  JournalEntryLine,
  NewJournalEntryLine,
  FiscalPeriod,
  NewFiscalPeriod,
  Invoice,
  NewInvoice,
  InvoiceLine,
  NewInvoiceLine,
  Expense,
  NewExpense,
  SalesCommission,
  NewSalesCommission,
} from '@/lib/db/schema'

/** Vista: balance contable simplificado */
export interface AccountBalance {
  account_code: string
  name: string
  account_type: string
  level: number
  is_detail: boolean
  total_debit: string
  total_credit: string
  balance: string
}
