import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SinPermisosPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <ShieldX className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-bold">Acceso denegado</h1>
      <p className="text-muted-foreground max-w-sm">
        No tienes permiso para acceder a esta sección. Contacta con el administrador si crees que es un error.
      </p>
      <Button asChild variant="outline">
        <Link href="/admin/dashboard">Volver al inicio</Link>
      </Button>
    </div>
  )
}
