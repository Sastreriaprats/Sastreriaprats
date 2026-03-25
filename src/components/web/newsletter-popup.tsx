'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import Image from 'next/image'
import { NewsletterForm } from './newsletter-form'

const STORAGE_KEY = 'prats_newsletter_shown'
const DELAY_MS = 30_000

export function NewsletterPopup() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(STORAGE_KEY)) return

    const timer = setTimeout(() => {
      setOpen(true)
      localStorage.setItem(STORAGE_KEY, '1')
    }, DELAY_MS)

    return () => clearTimeout(timer)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-2xl max-w-2xl w-full grid grid-cols-1 md:grid-cols-2 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Imagen lateral */}
        <div className="relative hidden md:block aspect-[3/4] min-h-[400px]">
          <Image
            src="https://www.sastreriaprats.com/cdn/shop/files/bolsa.jpg?v=1738690195&width=640"
            alt="Sastrería Prats"
            fill
            className="object-cover"
            sizes="320px"
          />
        </div>

        {/* Contenido */}
        <div className="p-8 md:p-10 flex flex-col justify-center">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 text-gray-400 hover:text-black transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>

          <p className="text-[10px] tracking-[0.4em] text-gray-400 uppercase mb-3">Newsletter</p>
          <h2 className="text-2xl md:text-3xl font-serif font-light text-prats-navy leading-tight mb-3">
            Únete a la familia Prats
          </h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Sé el primero en conocer nuestras nuevas colecciones, eventos exclusivos y consejos de estilo.
          </p>

          <NewsletterForm variant="stacked" />

          <p className="mt-4 text-[10px] text-gray-400 leading-relaxed">
            Puedes darte de baja en cualquier momento. Sin spam, lo prometemos.
          </p>
        </div>
      </div>
    </div>
  )
}
