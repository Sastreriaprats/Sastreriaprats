import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Proceso de Cobro',
}

export default function PosCobroPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <h1 className="text-2xl font-bold">Proceso de Cobro</h1>
      <p className="text-muted-foreground">Próximamente</p>
    </div>
  )
}
