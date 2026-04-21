export type SupplierPaymentMethod =
  | 'transfer'
  | 'direct_debit'
  | 'check'
  | 'cash'
  | 'card'
  | 'bank_draft'

export const SUPPLIER_PAYMENT_METHOD_LABEL: Record<SupplierPaymentMethod, string> = {
  transfer: 'Transferencia',
  direct_debit: 'Domiciliación',
  check: 'Cheque',
  cash: 'Efectivo',
  card: 'Tarjeta',
  bank_draft: 'Pagaré',
}
