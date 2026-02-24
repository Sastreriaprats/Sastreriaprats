type GtagFn = (...args: unknown[]) => void

function getGtag(): GtagFn | null {
  if (typeof window === 'undefined') return null
  return ((window as unknown as Record<string, unknown>).gtag as GtagFn) || null
}

export function trackPageView(url: string, title: string) {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', 'page_view', { page_path: url, page_title: title })
}

export function trackPurchase(orderId: string, total: number, items: { variant_id?: string; product_id?: string; product_name: string; unit_price: number; quantity: number }[]) {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', 'purchase', {
    transaction_id: orderId,
    value: total,
    currency: 'EUR',
    items: items.map((i, idx) => ({
      item_id: i.variant_id || i.product_id,
      item_name: i.product_name,
      price: i.unit_price,
      quantity: i.quantity,
      index: idx,
    })),
  })
}

export function trackAddToCart(productName: string, price: number, quantity: number) {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', 'add_to_cart', {
    currency: 'EUR',
    value: price * quantity,
    items: [{ item_name: productName, price, quantity }],
  })
}

export function trackBeginCheckout(total: number) {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', 'begin_checkout', { currency: 'EUR', value: total })
}

export function trackViewItem(productName: string, price: number) {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', 'view_item', {
    currency: 'EUR',
    value: price,
    items: [{ item_name: productName, price }],
  })
}

export function trackSearch(query: string) {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', 'search', { search_term: query })
}

export function trackBookAppointment(type: string) {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', 'book_appointment', { appointment_type: type })
}
