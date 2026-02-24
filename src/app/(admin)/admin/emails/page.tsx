import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { EmailsContent } from './emails-content'

export const metadata: Metadata = { title: 'Emails y Comunicaciones' }

export default async function EmailsPage() {
  await requirePermission('emails.view')
  return <EmailsContent />
}
