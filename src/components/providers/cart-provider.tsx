'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface CartItem {
  variant_id: string
  product_id: string
  product_name: string
  variant_sku: string
  size?: string
  color?: string
  image_url?: string
  unit_price: number
  quantity: number
  max_stock: number
}

interface CartContextType {
  items: CartItem[]
  itemCount: number
  subtotal: number
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void
  updateQuantity: (variantId: string, quantity: number) => void
  removeItem: (variantId: string) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextType | null>(null)

const CART_KEY = 'prats_cart'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY)
      if (saved) setItems(JSON.parse(saved))
    } catch { /* empty */ }
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(CART_KEY, JSON.stringify(items))
    }
  }, [items, isLoaded])

  const addItem = useCallback((newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    setItems(prev => {
      const existing = prev.find(i => i.variant_id === newItem.variant_id)
      if (existing) {
        const newQty = Math.min(existing.quantity + (newItem.quantity || 1), newItem.max_stock)
        return prev.map(i => i.variant_id === newItem.variant_id ? { ...i, quantity: newQty } : i)
      }
      return [...prev, { ...newItem, quantity: newItem.quantity || 1 }]
    })
  }, [])

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setItems(prev => {
      if (quantity <= 0) return prev.filter(i => i.variant_id !== variantId)
      return prev.map(i => i.variant_id === variantId ? { ...i, quantity: Math.min(quantity, i.max_stock) } : i)
    })
  }, [])

  const removeItem = useCallback((variantId: string) => {
    setItems(prev => prev.filter(i => i.variant_id !== variantId))
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
    localStorage.removeItem(CART_KEY)
  }, [])

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, itemCount, subtotal, addItem, updateQuantity, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
