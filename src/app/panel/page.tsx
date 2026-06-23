import { redirect } from 'next/navigation'
import { getViewerAccess } from '@/lib/ops/access'

export const dynamic = 'force-dynamic'

export default async function PanelIndex() {
  const a = await getViewerAccess()
  if (a.scopes.includes('B')) redirect('/panel/b')
  if (a.scopes.includes('C')) redirect('/panel/c')
  return null // el layout ya hace 404 si no hay capas
}
