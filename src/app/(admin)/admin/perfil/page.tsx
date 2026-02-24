import { Metadata } from 'next'
import { ProfileContent } from './profile-content'

export const metadata: Metadata = { title: 'Mi perfil' }

export default function ProfilePage() {
  return <ProfileContent />
}
