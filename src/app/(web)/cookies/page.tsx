import { buildMetadata } from '@/lib/seo/metadata'

export const metadata = buildMetadata({
  title: 'Política de Cookies — Sastrería Prats',
  description: 'Información sobre las cookies que utilizamos en Sastrería Prats.',
  path: '/cookies',
  noindex: true,
})

export default function CookiesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Política de Cookies</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy">
        <p><strong>Última actualización:</strong> Febrero 2026</p>

        <h2>1. ¿Qué son las cookies?</h2>
        <p>
          Las cookies son pequeños archivos de texto que se almacenan en su dispositivo al visitar
          un sitio web. Nos permiten reconocer su navegador y recordar cierta información.
        </p>

        <h2>2. Cookies que utilizamos</h2>

        <h3>2.1 Cookies necesarias</h3>
        <p>
          Esenciales para el funcionamiento del sitio: sesión de usuario, carrito de compra,
          token de seguridad CSRF, preferencia de idioma. Estas cookies no requieren consentimiento.
        </p>
        <table>
          <thead>
            <tr><th>Cookie</th><th>Propósito</th><th>Duración</th></tr>
          </thead>
          <tbody>
            <tr><td>sb-*-auth-token</td><td>Sesión de usuario</td><td>Sesión</td></tr>
            <tr><td>prats_cart</td><td>Carrito de compra</td><td>Persistente</td></tr>
            <tr><td>prats_cookie_consent</td><td>Preferencias de cookies</td><td>1 año</td></tr>
          </tbody>
        </table>

        <h3>2.2 Cookies analíticas</h3>
        <p>
          Google Analytics 4 (_ga, _ga_*): recopilan información anónima sobre cómo usa el sitio
          (páginas visitadas, tiempo, dispositivo). Requieren consentimiento.
        </p>
        <table>
          <thead>
            <tr><th>Cookie</th><th>Propósito</th><th>Duración</th></tr>
          </thead>
          <tbody>
            <tr><td>_ga</td><td>Identificador único de usuario</td><td>2 años</td></tr>
            <tr><td>_ga_*</td><td>Estado de sesión</td><td>2 años</td></tr>
          </tbody>
        </table>

        <h3>2.3 Cookies de marketing</h3>
        <p>
          Google Ads y remarketing: permiten mostrar anuncios personalizados basados en sus visitas.
          Requieren consentimiento. Duración: hasta 1 año.
        </p>

        <h3>2.4 Cookies de preferencias</h3>
        <p>
          Almacenan configuraciones como idioma preferido y tema visual.
          Requieren consentimiento. Duración: 1 año.
        </p>

        <h2>3. Gestión de cookies</h2>
        <p>
          Puede gestionar sus preferencias en cualquier momento haciendo clic en
          &quot;Configurar cookies&quot; en el pie de la página, o configurando su navegador para rechazar cookies.
        </p>

        <h2>4. Más información</h2>
        <p>
          Para más información sobre cookies, visite{' '}
          <a href="https://www.allaboutcookies.org" target="_blank" rel="noopener noreferrer">
            www.allaboutcookies.org
          </a>.
        </p>
      </div>
    </div>
  )
}
