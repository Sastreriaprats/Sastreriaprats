import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckCircle, ShoppingBag, ArrowRight } from 'lucide-react'
import { ClearCartOnConfirm } from './clear-cart-on-confirm'

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; demo?: string }>
}) {
  const { order: orderNumber, demo: isDemo } = await searchParams

  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      <ClearCartOnConfirm />
      {isDemo === '1' && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Modo prueba</p>
          <p>No se ha realizado ningún cobro. Este pedido es solo para pruebas.</p>
        </div>
      )}
      <CheckCircle className="mx-auto h-20 w-20 text-green-500 mb-6" />
      <h1 className="text-3xl font-bold text-prats-navy mb-4">¡Pedido confirmado!</h1>
      {orderNumber && (
        <p className="text-lg text-gray-500 mb-2">
          Nº de pedido: <span className="font-mono font-bold text-prats-navy">{orderNumber}</span>
        </p>
      )}
      <p className="text-gray-400 mb-8">
        Recibirás un email de confirmación en breve. Te notificaremos cuando se envíe tu pedido.
      </p>
      <div className="flex gap-3 justify-center">
        <Link href="/boutique">
          <Button variant="outline" className="gap-2">
            <ShoppingBag className="h-4 w-4" />Seguir comprando
          </Button>
        </Link>
        <Link href="/">
          <Button className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
            Volver al inicio <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
