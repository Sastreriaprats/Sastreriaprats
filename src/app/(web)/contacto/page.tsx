import type { Metadata } from 'next'
import { ContactContent } from './contact-content'

export const metadata: Metadata = {
  title: 'Contacto',
  description:
    'Contacta con Sastrería Prats. Reserva tu cita para trajes a medida, camisas a medida o consulta en nuestra boutique en Madrid.',
}

export default function ContactoPage() {
  return <ContactContent />
}
