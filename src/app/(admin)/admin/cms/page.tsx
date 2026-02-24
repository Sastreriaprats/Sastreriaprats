import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { CmsContent } from './cms-content'

export const metadata: Metadata = { title: 'CMS — Gestión de contenido' }

export default async function CmsPage() {
  await requirePermission('cms.view')
  return <CmsContent />
}
