import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { AuditoriaContent } from './auditoria-content'

export const metadata: Metadata = { title: 'Auditoría' }

export default async function AuditoriaPage() {
  await requirePermission('audit.view')
  return <AuditoriaContent />
}
