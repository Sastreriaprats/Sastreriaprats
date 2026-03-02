import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ImprimirEtiquetasContent } from './imprimir-etiquetas-content'

export const metadata: Metadata = { title: 'Imprimir etiquetas' }

export default async function ImprimirEtiquetasPage(props: {
  searchParams: Promise<{ ids?: string; variantIds?: string }>
}) {
  await requirePermission('barcodes.manage')
  const { ids, variantIds } = await props.searchParams
  // variantIds = variantes por talla; ids = legacy (product ids) redirigimos a codigos-barras si solo hay ids
  return <ImprimirEtiquetasContent variantIdsParam={variantIds ?? ''} legacyIdsParam={ids ?? ''} />
}
