import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
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
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-prats-navy mb-6 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Volver a la web
            </Link>
            <p className="text-sm text-muted-foreground">
              Crea tu cuenta para comprar online, consultar tus pedidos y reservar citas.
            </p>
          </div>
          <RegisterForm redirectTo={params.redirect} />
        </div>
      </div>

      <div className="hidden bg-prats-navy lg:flex lg:flex-1 lg:flex-col lg:items-center lg:justify-center">
        <Image
          src="/images/logo-prats-hd.webp"
          alt="Sastrería Prats"
          width={500}
          height={500}
          className="object-contain max-w-[80%]"
          style={{ filter: 'invert(1)', mixBlendMode: 'screen' }}
        />
        <p className="mt-6 text-sm tracking-[0.3em] text-white/50">
          SASTRERÍA A MEDIDA · MADRID
        </p>
      </div>
    </div>
  )
}
