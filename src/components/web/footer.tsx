import Link from 'next/link'
import Image from 'next/image'
import { Phone, Mail, MapPin, Instagram, Facebook } from 'lucide-react'
import { CookieSettingsButton } from '@/components/legal/cookie-settings-button'

export function WebFooter() {
  return (
    <footer className="bg-prats-navy text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-1">
            <div className="mb-4">
              <Image
                src="/logo-prats.png"
                alt="Prats"
                width={100}
                height={50}
                style={{ objectFit: 'contain', height: 50, width: 'auto', filter: 'invert(1) brightness(2)' }}
              />
              <p className="text-[9px] tracking-[0.3em] uppercase text-prats-gold mt-1">
                Madrid · Est. 1985
              </p>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              Sastrería de lujo en Madrid desde 1985. Trajes a medida, camisería y boutique de caballero.
            </p>
            <div className="flex gap-3 mt-6">
              <a href="https://instagram.com/sastreriaprats" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-prats-gold transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://facebook.com/sastreriaprats" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-prats-gold transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase text-prats-gold mb-4">Navegación</h4>
            <ul className="space-y-2">
              <li><Link href="/sastreria" className="text-sm text-white/60 hover:text-white transition-colors">Sastrería a medida</Link></li>
              <li><Link href="/boutique" className="text-sm text-white/60 hover:text-white transition-colors">Boutique</Link></li>
              <li><Link href="/boutique" className="text-sm text-white/60 hover:text-white transition-colors">Boutique</Link></li>
              <li><Link href="/reservar" className="text-sm text-white/60 hover:text-white transition-colors">Reservar cita</Link></li>
              <li><Link href="/sobre-nosotros" className="text-sm text-white/60 hover:text-white transition-colors">Nosotros</Link></li>
              <li><Link href="/blog" className="text-sm text-white/60 hover:text-white transition-colors">Blog</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase text-prats-gold mb-4">Contacto</h4>
            <ul className="space-y-3 text-sm text-white/60">
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-prats-gold" />
                Calle de Serrano 82, 28006 Madrid
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 flex-shrink-0 text-prats-gold" />
                <a href="tel:+34914356789" className="hover:text-white transition-colors">+34 91 435 6789</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 flex-shrink-0 text-prats-gold" />
                <a href="mailto:info@sastreriaprats.com" className="hover:text-white transition-colors">info@sastreriaprats.com</a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase text-prats-gold mb-4">Horario</h4>
            <div className="text-sm text-white/60 space-y-1">
              <p>Lunes a Viernes: 10:00 – 20:00</p>
              <p>Sábados: 10:00 – 14:00</p>
              <p>Domingos: Cerrado</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 mt-12 pt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Sastrería Prats. Todos los derechos reservados.
          </p>
          <div className="flex gap-6 text-xs text-white/40">
            <Link href="/privacidad" className="hover:text-white transition-colors">Política de privacidad</Link>
            <Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link>
            <Link href="/aviso-legal" className="hover:text-white transition-colors">Aviso legal</Link>
            <CookieSettingsButton />
          </div>
        </div>
      </div>
    </footer>
  )
}
