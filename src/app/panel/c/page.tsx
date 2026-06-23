import { requireScopeOr404 } from '@/lib/ops/access'
import { ScenarioCView } from './scenario-c-view'

export const dynamic = 'force-dynamic'

export default async function Page() {
  await requireScopeOr404('C')
  return <ScenarioCView />
}
