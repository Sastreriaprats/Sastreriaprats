'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Smartphone, Monitor, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { sendCampaignTestEmail } from '@/actions/emails'

type Viewport = 'mobile' | 'desktop'

const VIEWPORT_WIDTH: Record<Viewport, number> = {
  mobile: 375,
  desktop: 640,
}

export function PreviewClient({
  campaignId,
  html,
  subject,
}: {
  campaignId: string
  html: string
  subject: string
}) {
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [sending, setSending] = useState(false)

  const handleSendTest = async () => {
    setSending(true)
    try {
      const res = await sendCampaignTestEmail({ campaignId })
      if (res.success) {
        toast.success(`Prueba enviada a ${res.data?.sentTo}`)
      } else {
        toast.error(res.error || 'No se pudo enviar la prueba')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/emails" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-3 w-3" /> Volver a campañas
          </Link>
          <h1 className="text-xl font-semibold">Vista previa</h1>
          <p className="text-sm text-muted-foreground truncate max-w-xl">{subject}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-background overflow-hidden">
            <button
              onClick={() => setViewport('mobile')}
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${viewport === 'mobile' ? 'bg-prats-navy text-white' : 'hover:bg-accent'}`}
            >
              <Smartphone className="h-3.5 w-3.5" /> Mobile
            </button>
            <button
              onClick={() => setViewport('desktop')}
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${viewport === 'desktop' ? 'bg-prats-navy text-white' : 'hover:bg-accent'}`}
            >
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </button>
          </div>
          <Button
            onClick={handleSendTest}
            disabled={sending}
            className="gap-2 bg-prats-navy hover:bg-prats-navy/90"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Enviando…' : 'Enviar prueba a mi email'}
          </Button>
        </div>
      </div>

      {/* Iframe centrado con frame de "dispositivo" */}
      <div className="flex justify-center bg-muted/40 rounded-md py-8 border">
        <div
          className="bg-white shadow-md rounded-sm overflow-hidden transition-all"
          style={{ width: `${VIEWPORT_WIDTH[viewport]}px` }}
        >
          <iframe
            title="Email preview"
            srcDoc={html}
            className="w-full border-0"
            style={{ height: '80vh' }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Los enlaces de baja / confirmación usan tokens ficticios solo para esta vista previa. No tocan la BBDD.
      </p>
    </div>
  )
}
