import type { Metadata } from 'next'
import { CatalogContent } from './catalog-content'

export const metadata: Metadata = {
  title: 'Boutique — Sastrería Prats',
  description: 'Colección de moda masculina de lujo. Americanas, camisas, pantalones y accesorios de las mejores marcas.',
  openGraph: {
    title: 'Boutique — Sastrería Prats',
    description: 'Colección de moda masculina de lujo.',
  },
}

export default function BoutiquePage() {
  return <CatalogContent />
}
