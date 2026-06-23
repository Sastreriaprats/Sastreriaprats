import { requireManageOr404 } from '@/lib/ops/access'
import { AccessManager } from './access-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  await requireManageOr404()
  return <AccessManager />
}
