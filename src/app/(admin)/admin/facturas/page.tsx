import { Metadata } from 'next'
import { Suspense } from 'react'
import { requirePermission } from '@/actions/auth'
import { InvoicesPanel } from '@/components/accounting/invoices-panel'

export const metadata: Metadata = { title: 'Facturas' }

export default async function FacturasPage() {
  await requirePermission('accounting.manage_invoices')
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-prats-navy border-t-transparent" />
        </div>
      }
    >
      <InvoicesPanel />
    </Suspense>
  )
}
