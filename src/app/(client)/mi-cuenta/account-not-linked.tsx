import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserX, Mail, Phone } from 'lucide-react'

/**
 * Cuenta autenticada que todavia no tiene ficha de cliente asociada.
 *
 * Antes esta situacion redirigia a /auth/login, pero el middleware devuelve a
 * /mi-cuenta a cualquier usuario ya autenticado sin rol de staff: el resultado
 * era un bucle infinito de redirecciones y la cuenta quedaba inservible. Ahora
 * se explica que pasa y se ofrece una via de contacto.
 */
export function AccountNotLinked({ email }: { email: string | null }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <UserX className="h-6 w-6 text-amber-700" />
          </div>
          <CardTitle>Tu cuenta aún no está vinculada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Has iniciado sesión correctamente{email ? <> como <span className="font-medium text-foreground">{email}</span></> : null},
            pero todavía no hay una ficha de cliente asociada a este correo, así que no podemos
            mostrarte tus pedidos ni tus medidas.
          </p>
          <p>
            Suele ocurrir cuando el correo con el que te has registrado no es el mismo que consta
            en la tienda. Escríbenos y lo vinculamos en un momento.
          </p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <Button asChild variant="outline" className="flex-1 gap-2">
              <a href="mailto:info@sastreriaprats.com">
                <Mail className="h-4 w-4" /> Escribir a la tienda
              </a>
            </Button>
            <Button asChild variant="outline" className="flex-1 gap-2">
              <Link href="/contacto">
                <Phone className="h-4 w-4" /> Formulario de contacto
              </Link>
            </Button>
          </div>
          <div className="pt-2 text-center">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Volver a la tienda</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
