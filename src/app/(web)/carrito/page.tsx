import type { Metadata } from 'next'
import { CartContent } from './cart-content'

export const metadata: Metadata = {
  title: 'Carrito — Sastrería Prats',
}

export default function CartPage() {
  return <CartContent />
}
