import { Metadata } from 'next'
import { ReturnsContent } from './returns-content'

export const metadata: Metadata = { title: 'Devoluciones — TPV' }

export default function ReturnsPage() {
  return <ReturnsContent />
}
