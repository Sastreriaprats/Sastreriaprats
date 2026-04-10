import Link from 'next/link'
import { Facebook, Instagram, Linkedin, Mail } from 'lucide-react'
import { CookieSettingsButton } from '@/components/legal/cookie-settings-button'
import { BRAND, STORE_LOCATIONS, SOCIAL_LINKS } from '@/lib/constants'

export function WebFooter() {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Col 1: Marca */}
          <div>
            <p className="text-lg font-medium text-black">Sastrería Prats.</p>
            <p className="mt-2 text-sm text-gray-600">¡Auténtico e Imperfecto!</p>
            <Link
              href="/reservar"
              className="inline-block mt-4 text-[11px] font-medium tracking-[0.15em] uppercase text-black border border-black px-5 py-2 hover:bg-black hover:text-white transition-colors"
            >
              Reservar cita
            </Link>
          </div>

          {/* Col 2: Boutiques y contacto */}
          <div className="md:col-span-1">
            <p className="text-sm font-medium text-black mb-3">Nuestras boutiques:</p>
            <p className="text-sm text-gray-600">{STORE_LOCATIONS.pinzon.fullAddress}</p>
            <a href="tel:+34912401845" className="text-sm text-gray-600 underline hover:text-black transition-colors block">
              {STORE_LOCATIONS.pinzon.phones[0]}
            </a>
            <p className="text-sm text-gray-600 mt-2">{STORE_LOCATIONS.wellington.fullAddress} (Wellington Hotel &amp; Spa)</p>
            <a href="tel:+34671353465" className="text-sm text-gray-600 underline hover:text-black transition-colors block">
              {STORE_LOCATIONS.wellington.phones[0]}
            </a>

            <p className="text-sm font-medium text-black mt-6 mb-2">Para consultas generales</p>
            <a href={SOCIAL_LINKS.email} className="text-sm text-gray-600 underline hover:text-black transition-colors block">
              {BRAND.email}
            </a>
            <a href="tel:+34669985547" className="text-sm text-gray-600 underline hover:text-black transition-colors block mt-1">
              {BRAND.phone}
            </a>

            <p className="text-sm font-medium text-black mt-6 mb-2">Nuestros horarios</p>
            <p className="text-sm text-gray-600 font-medium">Hermanos Pinzón:</p>
            <p className="text-sm text-gray-600">Lunes a Viernes {STORE_LOCATIONS.pinzon.hours.weekdays} | Sábados {STORE_LOCATIONS.pinzon.hours.saturday}</p>
            <p className="text-sm text-gray-600 font-medium mt-2">Wellington:</p>
            <p className="text-sm text-gray-600">Lunes a Viernes {STORE_LOCATIONS.wellington.hours.weekdays} | Sábados {STORE_LOCATIONS.wellington.hours.saturday}</p>
            <p className="text-sm text-gray-600 font-medium mt-2">Domingos: Cerrado</p>
          </div>

          {/* Col 3: Políticas */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-black mb-4">POLÍTICAS</h4>
            <ul className="space-y-2">
              <li><Link href="/privacidad" className="text-sm text-gray-600 hover:text-black transition-colors">Política de privacidad</Link></li>
              <li><Link href="/aviso-legal" className="text-sm text-gray-600 hover:text-black transition-colors">Política de reembolsos</Link></li>
              <li><Link href="/aviso-legal" className="text-sm text-gray-600 hover:text-black transition-colors">Política de envíos</Link></li>
              <li><Link href="/aviso-legal" className="text-sm text-gray-600 hover:text-black transition-colors">Términos del servicio</Link></li>
            </ul>
          </div>

          {/* Col 4: Síguenos */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-black mb-4">SÍGUENOS</h4>
            <ul className="space-y-2">
              <li>
                <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                  <Facebook className="h-4 w-4" /> Facebook
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.71a8.19 8.19 0 004.76 1.52V6.79a4.85 4.85 0 01-1-.1z"/></svg>
                  TikTok
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                  <Linkedin className="h-4 w-4" /> LinkedIn
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.youtube} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  YouTube
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.email} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                  <Mail className="h-4 w-4" /> Email
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Barra inferior */}
      <div className="border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-gray-500">
            <span className="uppercase text-xs font-medium text-black">PAÍS/REGIÓN</span>
            <span className="ml-2 text-gray-600">España(EUR €)</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Iconos de pago simplificados */}
            {['Visa', 'Mastercard', 'Apple Pay', 'Google Pay'].map((method) => (
              <span key={method} className="px-2 py-1 border border-gray-200 rounded text-[10px] text-gray-500 font-medium">
                {method}
              </span>
            ))}
          </div>

          <p className="text-xs text-gray-500">
            Derechos de autor © {new Date().getFullYear()} Sastrería Prats.
          </p>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
          <div className="flex gap-4 text-xs text-gray-500">
            <Link href="/privacidad" className="hover:text-gray-600 transition-colors">Privacidad</Link>
            <Link href="/cookies" className="hover:text-gray-600 transition-colors">Cookies</Link>
            <Link href="/aviso-legal" className="hover:text-gray-600 transition-colors">Aviso legal</Link>
            <CookieSettingsButton />
          </div>
        </div>
      </div>
    </footer>
  )
}
