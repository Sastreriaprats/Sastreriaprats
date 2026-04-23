'use client'

import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { BRAND, STORE_LOCATIONS } from '@/lib/constants'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const SERVICES = [
  'Traje a medida',
  'Camisa a medida',
  'Arreglos',
  'Consulta boutique',
  'Otro',
] as const

export function ContactContent() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    service: '',
    preferredDate: '',
    message: '',
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setSuccess(false)

    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Error al enviar el mensaje')
        return
      }

      setSuccess(true)
      toast.success('Mensaje enviado correctamente')
      setFormData({
        name: '',
        email: '',
        phone: '',
        service: '',
        preferredDate: '',
        message: '',
      })
    } catch {
      toast.error('Error al enviar el mensaje')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="container mx-auto px-4 py-20 sm:py-24">
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-lg border border-border bg-prats-cream/30 p-12 text-center">
          <CheckCircle className="h-16 w-16 text-prats-gold" />
          <h2 className="mt-6 font-display text-2xl font-light text-prats-navy">
            Mensaje enviado
          </h2>
          <p className="mt-2 text-muted-foreground">
            Gracias por contactar con Sastrería Prats. Nos pondremos en contacto
            contigo lo antes posible.
          </p>
        </div>
      </div>
    )
  }

  const pinzonPhoneHref = `tel:${STORE_LOCATIONS.pinzon.phones[0].replace(/\s/g, '')}`
  const wellingtonPhoneHref = `tel:${STORE_LOCATIONS.wellington.phones[0].replace(/\s/g, '')}`
  const brandPhoneHref = `tel:${BRAND.phone.replace(/\s/g, '')}`

  return (
    <div className="container mx-auto px-4 py-16 sm:py-24 lg:py-28">
      <div className="grid gap-16 lg:grid-cols-2 lg:gap-20">
        <div>
          <h1 className="font-display text-5xl font-light leading-tight text-prats-navy sm:text-6xl">
            ¿Necesitas ayuda?
          </h1>
          <div className="mt-6 h-px w-16 bg-prats-navy" />

          <form onSubmit={handleSubmit} className="mt-16 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="sr-only">
                Nombre
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Nombre"
                required
                className="h-12 rounded-none border-x-0 border-t-0 border-b border-prats-navy/20 bg-transparent px-0 text-base placeholder:text-prats-navy/50 focus-visible:border-prats-navy focus-visible:ring-0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="sr-only">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="Email"
                required
                className="h-12 rounded-none border-x-0 border-t-0 border-b border-prats-navy/20 bg-transparent px-0 text-base placeholder:text-prats-navy/50 focus-visible:border-prats-navy focus-visible:ring-0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="sr-only">
                Teléfono
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="Teléfono"
                className="h-12 rounded-none border-x-0 border-t-0 border-b border-prats-navy/20 bg-transparent px-0 text-base placeholder:text-prats-navy/50 focus-visible:border-prats-navy focus-visible:ring-0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service" className="sr-only">
                Servicio de interés
              </Label>
              <Select
                value={formData.service}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, service: value }))
                }
              >
                <SelectTrigger
                  id="service"
                  className="h-12 rounded-none border-x-0 border-t-0 border-b border-prats-navy/20 bg-transparent px-0 text-base text-prats-navy data-[placeholder]:text-prats-navy/50 focus:ring-0 focus-visible:border-prats-navy focus-visible:ring-0"
                >
                  <SelectValue placeholder="Servicio de interés" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredDate" className="sr-only">
                Fecha preferida
              </Label>
              <DatePickerPopover
                id="preferredDate"
                value={formData.preferredDate}
                onChange={(date) =>
                  setFormData((prev) => ({ ...prev, preferredDate: date }))
                }
                min={new Date().toISOString().split('T')[0]}
                placeholder="Fecha preferida"
                containerClassName="h-12 rounded-none border-x-0 border-t-0 border-b border-prats-navy/20 bg-transparent px-0 text-base shadow-none hover:bg-transparent data-[placeholder]:text-prats-navy/50 focus-visible:border-prats-navy focus-visible:ring-0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message" className="sr-only">
                Mensaje
              </Label>
              <Textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder="Mensaje"
                rows={4}
                className="resize-none rounded-none border-x-0 border-t-0 border-b border-prats-navy/20 bg-transparent px-0 text-base placeholder:text-prats-navy/50 focus-visible:border-prats-navy focus-visible:ring-0"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-12 rounded-none bg-prats-navy px-10 text-sm font-medium uppercase tracking-wider hover:bg-prats-navy/90"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar'}
            </Button>
          </form>
        </div>

        <aside className="space-y-10 text-prats-navy lg:pt-4">
          <section>
            <p className="text-base font-medium">Nuestras boutiques:</p>
            <p className="mt-2 text-base">
              <a
                href={STORE_LOCATIONS.pinzon.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {STORE_LOCATIONS.pinzon.address}
              </a>
            </p>
            <p className="text-base">
              <a
                href={STORE_LOCATIONS.wellington.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {STORE_LOCATIONS.wellington.address} - {STORE_LOCATIONS.wellington.subtitle}
              </a>
            </p>
          </section>

          <section>
            <p className="text-base font-medium">Para consultas generales</p>
            <a
              href={`mailto:${BRAND.email}`}
              className="mt-2 inline-block text-base underline underline-offset-4 hover:text-prats-gold"
            >
              {BRAND.email}
            </a>
          </section>

          <section>
            <p className="text-base font-medium">Teléfonos</p>
            <p className="mt-2">
              <a
                href={brandPhoneHref}
                className="text-base underline underline-offset-4 hover:text-prats-gold"
              >
                {BRAND.phone}
              </a>
            </p>
            <p>
              <a
                href={pinzonPhoneHref}
                className="text-base underline underline-offset-4 hover:text-prats-gold"
              >
                {STORE_LOCATIONS.pinzon.phones[0]}
              </a>
            </p>
            <p>
              <a
                href={wellingtonPhoneHref}
                className="text-base underline underline-offset-4 hover:text-prats-gold"
              >
                {STORE_LOCATIONS.wellington.phones[0]}
              </a>
            </p>
          </section>

          <section>
            <p className="text-base font-medium">Nuestros horarios</p>
            <div className="mt-2 space-y-3 text-base">
              <div>
                <p className="font-medium">{STORE_LOCATIONS.pinzon.name}</p>
                <p>Lunes – Viernes: {STORE_LOCATIONS.pinzon.hours.weekdays}</p>
                <p>Sábado: {STORE_LOCATIONS.pinzon.hours.saturday}</p>
              </div>
              <div>
                <p className="font-medium">{STORE_LOCATIONS.wellington.name}</p>
                <p>Lunes – Viernes: {STORE_LOCATIONS.wellington.hours.weekdays}</p>
                <p>Sábado: {STORE_LOCATIONS.wellington.hours.saturday}</p>
              </div>
              <p>Domingos: Cerrado</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
