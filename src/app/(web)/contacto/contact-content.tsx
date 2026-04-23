'use client'

import { useState } from 'react'
import { CheckCircle, MapPin, Mail, Phone, Clock } from 'lucide-react'
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

        <aside className="space-y-8 text-prats-navy lg:pt-4">
          <section className="rounded-lg border border-prats-gold/20 bg-prats-cream/30 p-6 transition-colors hover:border-prats-gold/40">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-prats-gold/10">
                <MapPin className="h-5 w-5 text-prats-gold" strokeWidth={1.5} />
              </span>
              <h3 className="font-display text-lg font-light tracking-wide">Nuestras boutiques</h3>
            </div>
            <div className="mt-4 space-y-2 pl-[52px]">
              <a
                href={STORE_LOCATIONS.pinzon.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-base transition-colors hover:text-prats-gold"
              >
                {STORE_LOCATIONS.pinzon.address}
              </a>
              <a
                href={STORE_LOCATIONS.wellington.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-base transition-colors hover:text-prats-gold"
              >
                {STORE_LOCATIONS.wellington.address} - {STORE_LOCATIONS.wellington.subtitle}
              </a>
            </div>
          </section>

          <section className="rounded-lg border border-prats-gold/20 bg-prats-cream/30 p-6 transition-colors hover:border-prats-gold/40">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-prats-gold/10">
                <Mail className="h-5 w-5 text-prats-gold" strokeWidth={1.5} />
              </span>
              <h3 className="font-display text-lg font-light tracking-wide">Consultas generales</h3>
            </div>
            <div className="mt-4 pl-[52px]">
              <a
                href={`mailto:${BRAND.email}`}
                className="inline-block text-base transition-colors hover:text-prats-gold"
              >
                {BRAND.email}
              </a>
            </div>
          </section>

          <section className="rounded-lg border border-prats-gold/20 bg-prats-cream/30 p-6 transition-colors hover:border-prats-gold/40">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-prats-gold/10">
                <Phone className="h-5 w-5 text-prats-gold" strokeWidth={1.5} />
              </span>
              <h3 className="font-display text-lg font-light tracking-wide">Teléfonos</h3>
            </div>
            <div className="mt-4 space-y-1.5 pl-[52px]">
              <a
                href={brandPhoneHref}
                className="block text-base transition-colors hover:text-prats-gold"
              >
                {BRAND.phone}
              </a>
              <a
                href={pinzonPhoneHref}
                className="block text-base transition-colors hover:text-prats-gold"
              >
                {STORE_LOCATIONS.pinzon.phones[0]}
              </a>
              <a
                href={wellingtonPhoneHref}
                className="block text-base transition-colors hover:text-prats-gold"
              >
                {STORE_LOCATIONS.wellington.phones[0]}
              </a>
            </div>
          </section>

          <section className="rounded-lg border border-prats-gold/20 bg-prats-cream/30 p-6 transition-colors hover:border-prats-gold/40">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-prats-gold/10">
                <Clock className="h-5 w-5 text-prats-gold" strokeWidth={1.5} />
              </span>
              <h3 className="font-display text-lg font-light tracking-wide">Nuestros horarios</h3>
            </div>
            <div className="mt-4 space-y-4 pl-[52px] text-base">
              <div>
                <p className="font-medium text-prats-navy">{STORE_LOCATIONS.pinzon.name}</p>
                <p className="text-prats-navy/80">Lunes – Viernes: {STORE_LOCATIONS.pinzon.hours.weekdays}</p>
                <p className="text-prats-navy/80">Sábado: {STORE_LOCATIONS.pinzon.hours.saturday}</p>
              </div>
              <div>
                <p className="font-medium text-prats-navy">{STORE_LOCATIONS.wellington.name}</p>
                <p className="text-prats-navy/80">Lunes – Viernes: {STORE_LOCATIONS.wellington.hours.weekdays}</p>
                <p className="text-prats-navy/80">Sábado: {STORE_LOCATIONS.wellington.hours.saturday}</p>
              </div>
              <p className="text-prats-navy/80">Domingos: Cerrado</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
