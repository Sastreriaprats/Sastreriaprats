/**
 * Tipos de TPV: sesiones de caja, ventas, pagos, vales, devoluciones, descuentos.
 */

export type {
  CashSession,
  NewCashSession,
  CashWithdrawal,
  NewCashWithdrawal,
  Sale,
  NewSale,
  SaleLine,
  NewSaleLine,
  SalePayment,
  NewSalePayment,
  Voucher,
  NewVoucher,
  Return,
  NewReturn,
  DiscountCode,
  NewDiscountCode,
} from '@/lib/db/schema'

/** Vista: ventas del día con detalles */
export interface DailySale {
  id: string
  ticket_number: string
  sale_type: string | null
  total: string
  payment_method: string
  status: string
  is_tax_free: boolean | null
  created_at: Date
  client_name: string | null
  salesperson_name: string
  store_name: string
  cash_session_id: string
}
