'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

type Stage = 'loading' | 'ready' | 'invalid' | 'success'

export function ResetForm() {
  const supabase = useMemo(() => createClient(), [])
  const [stage, setStage] = useState<Stage>('loading')
  const [tokenHash, setTokenHash] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Flujo actual: el email trae ?token_hash=… y se canjea con verifyOtp al
    // ENVIAR el formulario (token de un solo uso: canjearlo en submit evita
    // que un escáner de email lo funda al abrir el link). Se lee de
    // window.location para no necesitar Suspense por useSearchParams.
    const th = new URLSearchParams(window.location.search).get('token_hash')
    if (th) {
      setTokenHash(th)
      setStage('ready')
      return
    }

    // Flujo legacy (links antiguos vía /verify de Supabase): tokens en el
    // hash → supabase-js crea sesión "recovery"; comprobamos que existe.
    let cancelled = false
    async function checkSession() {
      // Pequeño delay para dar tiempo a Supabase JS a procesar el hash.
      await new Promise((r) => setTimeout(r, 200))
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) {
        setStage('ready')
      } else {
        setStage('invalid')
      }
    }
    checkSession()
    return () => { cancelled = true }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setIsSaving(true)
    if (tokenHash) {
      // Si un intento anterior ya canjeó el token, hay sesión: no repetir
      // verifyOtp (fallaría por token consumido).
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        })
        if (otpError) {
          setIsSaving(false)
          setStage('invalid')
          return
        }
      }
    }
    const { error } = await supabase.auth.updateUser({ password })
    setIsSaving(false)
    if (error) {
      toast.error(error.message || 'No se pudo actualizar la contraseña')
      return
    }
    setStage('success')
    // Cerramos sesión "recovery" para forzar nuevo login y redirigimos.
    await supabase.auth.signOut()
    setTimeout(() => {
      window.location.href = '/auth/login?mode=client'
    }, 2000)
  }

  if (stage === 'loading') {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (stage === 'invalid') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
        <p className="text-sm font-medium text-amber-900">
          Este link ha caducado o no es válido.
        </p>
        <p className="text-xs text-amber-800">
          Solicita un nuevo link de restablecimiento.
        </p>
        <Link
          href="/auth/recuperar"
          className="inline-block text-sm text-prats-navy hover:underline pt-2"
        >
          Volver a recuperar contraseña
        </Link>
      </div>
    )
  }

  if (stage === 'success') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center space-y-3">
        <p className="text-sm font-medium text-green-800">
          Contraseña actualizada
        </p>
        <p className="text-xs text-green-700">
          Te llevamos a iniciar sesión…
        </p>
        <Button asChild className="w-full bg-prats-navy hover:bg-prats-navy/90 mt-2">
          <Link href="/auth/login?mode=client">Ir a iniciar sesión</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            disabled={isSaving}
            autoComplete="new-password"
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

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <Input
          id="confirm"
          type={showPassword ? 'text' : 'password'}
          placeholder="Repite la contraseña"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
          disabled={isSaving}
          autoComplete="new-password"
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-prats-navy hover:bg-prats-navy/90"
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Guardando…
          </>
        ) : (
          'Actualizar contraseña'
        )}
      </Button>
    </form>
  )
}
