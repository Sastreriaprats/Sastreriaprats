'use client'

import { useState } from 'react'
import Link from 'next/link'
import { registerClientAction } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function RegisterForm({ redirectTo }: { redirectTo?: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [acceptsPrivacy, setAcceptsPrivacy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!acceptsPrivacy) {
      toast.error('Debes aceptar la política de privacidad')
      return
    }

    setIsLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.set('fullName', `${formData.get('firstName')} ${formData.get('lastName')}`.toString().trim())

    let result: { error?: string; success?: boolean } | undefined
    try {
      result = await registerClientAction(formData)
    } catch (err) {
      toast.error('Error de conexión. Inténtalo de nuevo.')
      setIsLoading(false)
      return
    }

    if (result?.error) {
      toast.error(result.error)
      setIsLoading(false)
      return
    }

    toast.success('Cuenta creada correctamente. Ahora inicia sesión.')
    setDone(true)
    // Redirigir al login con redirect URL para continuar donde estaba
    const loginUrl = redirectTo
      ? `/auth/login?mode=client&redirectTo=${encodeURIComponent(redirectTo)}`
      : '/auth/login?mode=client'
    setTimeout(() => { window.location.href = loginUrl }, 1500)
  }

  if (done) {
    return (
      <div className="text-center space-y-2 py-4">
        <p className="text-sm font-medium text-green-700">¡Cuenta creada!</p>
        <p className="text-xs text-muted-foreground">Redirigiendo al inicio de sesión...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nombre *</Label>
          <Input id="firstName" name="firstName" required disabled={isLoading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Apellidos *</Label>
          <Input id="lastName" name="lastName" required disabled={isLoading} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email *</Label>
        <Input id="email" name="email" type="email" required disabled={isLoading} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" type="tel" disabled={isLoading} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña *</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          disabled={isLoading}
          placeholder="Mínimo 8 caracteres"
        />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="privacy"
          checked={acceptsPrivacy}
          onCheckedChange={(checked) => setAcceptsPrivacy(checked === true)}
        />
        <label htmlFor="privacy" className="text-xs leading-tight text-muted-foreground">
          He leído y acepto la{' '}
          <Link href="/privacidad" className="text-prats-navy hover:underline">
            política de privacidad
          </Link>{' '}
          y las{' '}
          <Link href="/condiciones" className="text-prats-navy hover:underline">
            condiciones de venta
          </Link>
          .
        </label>
      </div>

      <Button
        type="submit"
        className="w-full bg-prats-navy hover:bg-prats-navy/90"
        disabled={isLoading || !acceptsPrivacy}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creando cuenta...
          </>
        ) : (
          'Crear cuenta'
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link
          href={redirectTo ? `/auth/login?mode=client&redirectTo=${encodeURIComponent(redirectTo)}` : '/auth/login?mode=client'}
          className="text-prats-navy hover:underline"
        >
          Inicia sesión
        </Link>
      </p>
    </form>
  )
}
