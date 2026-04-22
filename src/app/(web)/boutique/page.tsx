import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CatalogContent } from './catalog-content'
import { PratsSpinner } from '@/components/ui/prats-spinner'

// No usamos `revalidate` porque la página depende de searchParams (?category=...).
// Con ISR + useSearchParams sin Suspense, el prerender dejaba los params vacíos
// y el fetch se disparaba sin filtro de categoría.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Boutique — Sastrería Prats',
  description: 'Colección de moda masculina de lujo. Americanas, camisas, pantalones y accesorios de las mejores marcas.',
  openGraph: {
    title: 'Boutique — Sastrería Prats',
    description: 'Colección de moda masculina de lujo.',
  },
}

export default function BoutiquePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><PratsSpinner /></div>}>
      <CatalogContent />
    </Suspense>
  )
}
