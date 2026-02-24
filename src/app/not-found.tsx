import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="font-display text-6xl font-light text-prats-navy">404</h1>
      <p className="mt-4 text-lg text-muted-foreground">Página no encontrada</p>
      <Button asChild className="mt-8 bg-prats-navy hover:bg-prats-navy/90">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  )
}
