'use client'

import { useState } from 'react'

interface Props {
  variant?: 'inline' | 'stacked'
  dark?: boolean
}

/** Formulario compacto de suscripción a newsletter — para uso en footer, homepage, popup, etc. */
export function NewsletterForm({ variant = 'inline', dark = false }: Props) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setStatus('loading')
    try {
      const res = await fetch('/api/public/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Error al suscribirte')
      } else {
        setStatus('success')
        setMessage(data.message || '¡Gracias por suscribirte!')
        setEmail('')
      }
    } catch {
      setStatus('error')
      setMessage('Error de conexión. Inténtalo de nuevo.')
    }
  }

  if (status === 'success') {
    return (
      <p className={`text-sm rounded px-4 py-3 ${dark ? 'text-green-300 bg-green-900/30 border border-green-700' : 'text-green-700 bg-green-50 border border-green-200'}`}>
        {message}
      </p>
    )
  }

  const isStacked = variant === 'stacked'

  return (
    <form onSubmit={handleSubmit} className={isStacked ? 'space-y-3' : ''}>
      <div className={isStacked ? 'space-y-3' : 'flex gap-2'}>
        <label htmlFor="newsletter-email" className="sr-only">Email</label>
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle') }}
          placeholder="Tu email"
          className={`text-sm px-4 py-2.5 rounded focus:outline-none transition-colors ${
            dark
              ? 'bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:border-white/50'
              : 'bg-transparent border border-gray-300 text-black placeholder:text-gray-400 focus:border-black'
          } ${isStacked ? 'w-full' : 'flex-1 min-w-0'}`}
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className={`text-xs font-medium tracking-[0.15em] uppercase px-6 py-2.5 rounded transition-colors disabled:opacity-50 ${
            dark
              ? 'bg-white text-prats-navy hover:bg-white/90'
              : 'bg-prats-navy text-white hover:bg-prats-navy/90'
          } ${isStacked ? 'w-full' : 'shrink-0'}`}
        >
          {status === 'loading' ? 'Enviando...' : 'Suscribirse'}
        </button>
      </div>
      {status === 'error' && (
        <p className={`text-xs mt-1.5 ${dark ? 'text-red-300' : 'text-red-600'}`}>{message}</p>
      )}
    </form>
  )
}
