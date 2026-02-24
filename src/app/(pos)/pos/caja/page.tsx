import { Metadata } from 'next'
import { PosMainContent } from './pos-main-content'

export const metadata: Metadata = { title: 'TPV — Sastrería Prats' }

export default function PosPage() {
  return <PosMainContent />
}
