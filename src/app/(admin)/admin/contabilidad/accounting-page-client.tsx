'use client'

import dynamic from 'next/dynamic'

const AccountingContent = dynamic(
  () => import('./accounting-content').then(m => ({ default: m.AccountingContent })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-prats-navy border-t-transparent" />
      </div>
    ),
  }
)

export function AccountingPageClient() {
  return <AccountingContent />
}
