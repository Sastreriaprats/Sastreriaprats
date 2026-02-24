'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Algo ha fallado</h1>
      <p className="text-muted-foreground">Ha ocurrido un error inesperado.</p>
      <Button onClick={reset}>Intentar de nuevo</Button>
    </div>
  )
}
