'use client'

import { useEffect } from 'react'
import { useCart } from '@/components/providers/cart-provider'

export function ClearCartOnConfirm() {
  const { clearCart } = useCart()
  useEffect(() => {
    clearCart()
  }, [clearCart])
  return null
}
