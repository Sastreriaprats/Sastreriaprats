'use client'

import { useState } from 'react'
import { MapPin, Phone, Mail, Clock, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

  return (
    <div className="container mx-auto px-4 py-16 sm:py-20">
      <h1 className="mb-12 font-display text-4xl font-light text-prats-navy">
        Contacto
      </h1>

      <div className="grid gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Tu nombre"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="tu@email.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+34 600 000 000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service">Servicio de interés</Label>
              <Select
                value={formData.service}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, service: value }))
                }
              >
                <SelectTrigger id="service">
                  <SelectValue placeholder="Selecciona un servicio" />
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
              <Label htmlFor="preferredDate">Fecha preferida</Label>
              <Input
                id="preferredDate"
                name="preferredDate"
                type="text"
                value={formData.preferredDate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    preferredDate: e.target.value,
                  }))
                }
                placeholder="Ej: Semana del 15 de marzo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Mensaje</Label>
              <Textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder="Cuéntanos en qué podemos ayudarte..."
                rows={5}
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-prats-navy hover:bg-prats-navy/90"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar mensaje'}
            </Button>
          </form>
        </div>

        <aside className="space-y-8 rounded-lg border border-border bg-prats-cream/30 p-6">
          <div>
            <h3 className="font-display text-lg font-medium text-prats-navy">
              Información de contacto
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex gap-3">
              <MapPin className="h-5 w-5 shrink-0 text-prats-gold" />
              <div>
                <p className="font-medium text-prats-navy">Dirección</p>
                <p className="text-sm text-muted-foreground">
                  Calle de la Sastrería, 1
                  <br />
                  28001 Madrid
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="h-5 w-5 shrink-0 text-prats-gold" />
              <div>
                <p className="font-medium text-prats-navy">Teléfono</p>
                <p className="text-sm text-muted-foreground">+34 911 000 000</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Mail className="h-5 w-5 shrink-0 text-prats-gold" />
              <div>
                <p className="font-medium text-prats-navy">Email</p>
                <p className="text-sm text-muted-foreground">
                  info@sastreriaprats.es
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Clock className="h-5 w-5 shrink-0 text-prats-gold" />
              <div>
                <p className="font-medium text-prats-navy">Horario</p>
                <p className="text-sm text-muted-foreground">
                  Lunes a Viernes: 10:00 - 20:00
                  <br />
                  Sábados: 10:00 - 14:00
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
