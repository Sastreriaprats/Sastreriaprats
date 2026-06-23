import { requireScopeOr404 } from '@/lib/ops/access'
import { LedgerPanel } from './ledger-panel'

export const dynamic = 'force-dynamic'

export default async function Page() {
  await requireScopeOr404('B')
  return <LedgerPanel />
}
