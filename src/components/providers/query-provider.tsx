'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

const defaultOptions = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 segundos
      gcTime: 300_000,       // 5 minutos (antes cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient(defaultOptions))
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
