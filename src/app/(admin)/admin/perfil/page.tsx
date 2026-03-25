import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ProfileContent } from './profile-content'

export const metadata: Metadata = { title: 'Mi perfil' }

export default async function ProfilePage() {
  await requirePermission('profile.view')
  return <ProfileContent />
}
