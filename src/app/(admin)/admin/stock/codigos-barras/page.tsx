import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { CodigosBarrasContent } from './codigos-barras-content'

export const metadata: Metadata = { title: 'Códigos de barras' }

export default async function CodigosBarrasPage() {
  await requirePermission('barcodes.manage')
  return <CodigosBarrasContent />
}
