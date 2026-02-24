import { Metadata } from 'next'
import { RegisterForm } from './register-form'

export const metadata: Metadata = {
  title: 'Crear cuenta',
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const params = await searchParams
  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col justify-center px-8 py-12 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-light tracking-[0.2em] text-prats-navy">
              PRATS
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Crea tu cuenta para comprar online, consultar tus pedidos y reservar citas.
            </p>
          </div>
          <RegisterForm redirectTo={params.redirect} />
        </div>
      </div>
      <div className="hidden bg-prats-navy lg:flex lg:flex-1 lg:items-center lg:justify-center">
        <div className="text-center">
          <h2 className="font-display text-6xl font-light tracking-[0.3em] text-white">
            PRATS
          </h2>
          <p className="mt-4 text-sm tracking-[0.3em] text-white/50">
            SASTRERÍA DE LUJO · MADRID
          </p>
        </div>
      </div>
    </div>
  )
}
