import { Metadata } from 'next'
import { PosSummaryContent } from './pos-summary-content'

export const metadata: Metadata = { title: 'Resumen del día — TPV' }

export default function PosSummaryPage() {
  return <PosSummaryContent />
}
