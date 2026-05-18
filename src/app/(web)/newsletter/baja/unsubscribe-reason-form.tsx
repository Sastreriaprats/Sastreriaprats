'use client'

import { useState } from 'react'

export function UnsubscribeReasonForm({ token }: { token: string }) {
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/newsletter/baja-motivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason: trimmed }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setStatus('error')
        setErrorMsg(data.error || 'No se pudo guardar')
        return
      }
      setStatus('sent')
    } catch {
      setStatus('error')
      setErrorMsg('Error de conexión')
    }
  }

  if (status === 'sent') {
    return (
      <p className="text-xs text-gray-500 italic">Gracias por el comentario.</p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      <label htmlFor="unsub-reason" className="block text-xs tracking-[0.15em] uppercase text-gray-500">
        ¿Por qué te das de baja? (opcional)
      </label>
      <textarea
        id="unsub-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Tu opinión nos ayuda a mejorar"
        disabled={status === 'sending'}
        className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-prats-navy resize-none"
      />
      <button
        type="submit"
        disabled={status === 'sending' || !reason.trim()}
        className="text-xs tracking-[0.15em] uppercase px-5 py-2 bg-prats-navy text-white hover:bg-prats-navy/90 disabled:opacity-40 rounded"
      >
        {status === 'sending' ? 'Guardando…' : 'Guardar motivo'}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </form>
  )
}
