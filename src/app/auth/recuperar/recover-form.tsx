'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { requestPasswordResetAction } from '@/actions/auth'

export function RecoverForm() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      toast.error('Introduce un email válido')
      return
    }
    setIsLoading(true)
    try {
      const result = await requestPasswordResetAction(email.trim())
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setSent(true)
    } catch {
      toast.error('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center space-y-3">
        <p className="text-sm font-medium text-green-800">
          Si existe una cuenta con ese email, te hemos enviado un link para restablecer tu contraseña.
        </p>
        <p className="text-xs text-green-700">
          Revisa tu bandeja de entrada (y la carpeta de spam). El link caduca en 1 hora.
        </p>
        <Link href="/auth/login?mode=client" className="inline-block text-sm text-prats-navy hover:underline pt-2">
          Volver al inicio de sesión
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={isLoading}
          required
        />
      </div>
      <Button
        type="submit"
        className="w-full bg-prats-navy hover:bg-prats-navy/90"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando…
          </>
        ) : (
          'Enviar link de recuperación'
        )}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        ¿Recordaste tu contraseña?{' '}
        <Link href="/auth/login?mode=client" className="text-prats-navy hover:underline">
          Iniciar sesión
        </Link>
      </p>
    </form>
  )
}
