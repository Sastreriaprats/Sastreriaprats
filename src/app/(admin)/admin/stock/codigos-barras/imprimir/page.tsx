import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ImprimirEtiquetasContent } from './imprimir-etiquetas-content'

export const metadata: Metadata = { title: 'Imprimir etiquetas' }

export default async function ImprimirEtiquetasPage(props: {
  searchParams: Promise<{ ids?: string; variantIds?: string; qtys?: string; autoprint?: string }>
}) {
  await requirePermission('barcodes.manage')
  const { ids, variantIds, qtys, autoprint } = await props.searchParams
  // variantIds = variantes por talla; ids = legacy (product ids) redirigimos a codigos-barras si solo hay ids
  // qtys = cantidades iniciales por variante, en el mismo orden que variantIds (opcional)
  // autoprint=1 lanza el diálogo de impresión automáticamente al cargar (flujo recepción de pedido)
  return <ImprimirEtiquetasContent variantIdsParam={variantIds ?? ''} legacyIdsParam={ids ?? ''} qtysParam={qtys ?? ''} autoprint={autoprint === '1'} />
}
