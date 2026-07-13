import type { Metadata } from 'next'
import { CheckoutContent } from './checkout-content'

export const metadata: Metadata = {
  title: 'Checkout — Sastrería Prats',
  // Página transaccional: no debe competir en el índice de Google.
  robots: { index: false, follow: true },
}

export default function CheckoutPage() {
  return <CheckoutContent />
}
