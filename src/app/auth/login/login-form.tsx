'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

interface LoginFormProps {
  redirectTo?: string
  mode: string
}

export function LoginForm({ redirectTo, mode }: LoginFormProps) {
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [lastEmailNotConfirmed, setLastEmailNotConfirmed] = useState(false)

  async function handleResendConfirmation() {
    if (!email?.trim()) return
    setResendLoading(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    setResendLoading(false)
    if (error) {
      toast.error(error.message || 'No se pudo reenviar el correo')
      return
    }
    toast.success('Correo de confirmación reenviado. Revisa tu bandeja de entrada.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)

    const timeoutMs = 15000
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs)
    )

    try {
      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        timeoutPromise,
      ]) as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>

      if (error) {
        const msg = error.message || ''
        const isEmailNotConfirmed =
          msg.toLowerCase().includes('email') &&
          (msg.toLowerCase().includes('confirm') ||
            msg.toLowerCase().includes('verified') ||
            msg.toLowerCase().includes('validat'))
        setLastEmailNotConfirmed(!!isEmailNotConfirmed)
        if (isEmailNotConfirmed) {
          toast.error(
            'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada y la carpeta de spam.'
          )
        } else {
          toast.error(msg || 'Credenciales incorrectas')
        }
        setIsLoading(false)
        return
      }
      setLastEmailNotConfirmed(false)

      // Redirigir según el modo
      let destination: string
      if (mode === 'pos') {
        destination = '/pos/caja'
      } else if (mode === 'client') {
        destination = redirectTo || '/mi-cuenta'
      } else {
        destination = '/admin/dashboard'
      }
      window.location.href = destination
    } catch (err: any) {
      if (err?.message === 'timeout') {
        toast.error('El servidor tarda demasiado. Comprueba tu conexión y la URL de Supabase.')
      } else {
        toast.error('Error al iniciar sesión')
      }
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {redirectTo && (
        <input type="hidden" name="redirectTo" value={redirectTo} />
      )}

      <Button
        type="submit"
        className="w-full bg-prats-navy hover:bg-prats-navy/90"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Entrando...
          </>
        ) : (
          'Iniciar sesión'
        )}
      </Button>

      {lastEmailNotConfirmed && email && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-xs text-amber-800 mb-2">¿No recibiste el correo?</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-amber-300 text-amber-800 hover:bg-amber-100"
            onClick={handleResendConfirmation}
            disabled={resendLoading}
          >
            {resendLoading ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Reenviar correo de confirmación'}
          </Button>
        </div>
      )}

      {mode === 'client' && (
        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{' '}
          <Link href="/auth/registro" className="text-prats-navy hover:underline">
            Regístrate
          </Link>
        </p>
      )}
    </form>
  )
}
