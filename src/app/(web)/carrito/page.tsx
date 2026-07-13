import type { Metadata } from 'next'
import { CartContent } from './cart-content'

export const metadata: Metadata = {
  title: 'Carrito — Sastrería Prats',
  // Página transaccional: no debe competir en el índice de Google.
  robots: { index: false, follow: true },
}

export default function CartPage() {
  return <CartContent />
}
