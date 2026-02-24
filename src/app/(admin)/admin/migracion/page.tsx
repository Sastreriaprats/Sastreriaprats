import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { MigrationContent } from './migration-content'

export const metadata: Metadata = { title: 'Migración de datos' }

export default async function MigrationPage() {
  await requirePermission('config.view')
  return <MigrationContent />
}
