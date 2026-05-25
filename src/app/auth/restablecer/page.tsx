import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { ResetForm } from './reset-form'

export const metadata: Metadata = {
  title: 'Restablecer contraseña',
  robots: { index: false, follow: false, nocache: true },
}

export default function RestablecerPage() {
  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col justify-center px-8 py-12 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8">
            <Link href="/auth/login?mode=client" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-prats-navy mb-6 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio de sesión
            </Link>
            <h1 className="text-2xl font-bold text-prats-navy">Nueva contraseña</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Elige una contraseña nueva para tu cuenta.
            </p>
          </div>
          <ResetForm />
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
