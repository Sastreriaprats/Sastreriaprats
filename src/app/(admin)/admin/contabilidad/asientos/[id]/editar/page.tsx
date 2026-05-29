import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { getManualJournalEntry } from '@/actions/accounting'
import { JournalEntryForm } from '../../journal-entry-form'

export const metadata: Metadata = { title: 'Editar asiento' }

export default async function EditJournalEntryPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('journal_entries.manage')
  const { id } = await props.params
  const res = await getManualJournalEntry(id)
  if (!res.success || !res.data) notFound()
  // Solo asientos manuales no vinculados y con periodo abierto son editables.
  if (!res.data.editable) redirect('/admin/contabilidad?tab=journal')
  return <JournalEntryForm initial={res.data} />
}
