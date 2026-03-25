import { requirePermission } from '@/actions/auth'
import { PrinterSettings } from './printer-settings'

export default async function PrinterPage() {
  await requirePermission('config.view')
  return <PrinterSettings />
}
