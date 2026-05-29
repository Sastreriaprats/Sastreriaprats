import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { JournalEntryForm } from '../journal-entry-form'

export const metadata: Metadata = { title: 'Nuevo asiento' }

export default async function NewJournalEntryPage() {
  await requirePermission('journal_entries.manage')
  return <JournalEntryForm />
}
