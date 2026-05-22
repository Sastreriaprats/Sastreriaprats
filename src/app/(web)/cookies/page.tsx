import { buildMetadata } from '@/lib/seo/metadata'
import { CookieSettingsButton } from '@/components/legal/cookie-settings-button'

export const revalidate = 86400

export const metadata = buildMetadata({
  title: 'Política de Cookies — Sastrería Prats',
  description: 'Información detallada sobre las cookies que utiliza el sitio web de Sastrería Prats y cómo puedes gestionarlas.',
  path: '/cookies',
  noindex: true,
})

export default function CookiesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Política de Cookies</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy prose-a:text-prats-gold">
        <p><strong>Última actualización:</strong> Mayo 2026</p>

        <p>
          La presente Política de Cookies forma parte integrante del{' '}
          <a href="/aviso-legal">Aviso Legal</a> y de la{' '}
          <a href="/privacidad">Política de Privacidad</a> del sitio web
          <a href="https://sastreriaprats.com"> sastreriaprats.com</a>, titularidad de
          PRATS EUGERCIOS Y GONZÁLEZ, S.L. (CIF B-88391834), con domicilio en Calle Hermanos
          Pinzón, 4 — 28036 Madrid, y correo electrónico{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>.
        </p>

        <h2>1. ¿Qué son las cookies?</h2>
        <p>
          Las cookies son pequeños archivos de texto que los sitios web instalan en el navegador
          o dispositivo del usuario cuando este los visita. Permiten al sitio recordar información
          sobre la visita (idioma, preferencias, productos en el carrito, sesión iniciada…) y
          mejorar la experiencia de uso, así como obtener información estadística sobre cómo se
          utiliza el sitio.
        </p>

        <h2>2. Base legal para el uso de cookies</h2>
        <p>
          De conformidad con el artículo 22.2 de la Ley 34/2002 (LSSI-CE), el Reglamento (UE)
          2016/679 (RGPD) y las directrices de la Agencia Española de Protección de Datos (AEPD),
          Sastrería Prats solicita tu consentimiento previo, expreso e informado para el uso de
          cookies no estrictamente necesarias. Las cookies técnicas o esenciales no requieren
          consentimiento.
        </p>

        <h2>3. Tipos de cookies que utilizamos</h2>

        <h3>3.1. Cookies técnicas o necesarias</h3>
        <p>
          Imprescindibles para el funcionamiento del sitio: inicio de sesión, carrito de la
          compra, token de seguridad, almacenamiento de las preferencias de consentimiento.
          No requieren consentimiento del usuario.
        </p>
        <table>
          <thead>
            <tr><th>Cookie</th><th>Propósito</th><th>Duración</th><th>Titular</th></tr>
          </thead>
          <tbody>
            <tr><td>sb-*-auth-token</td><td>Mantener la sesión del usuario autenticado</td><td>Sesión</td><td>Supabase</td></tr>
            <tr><td>prats_cart</td><td>Almacenar los productos del carrito</td><td>Persistente</td><td>Sastrería Prats</td></tr>
            <tr><td>prats_cookie_consent</td><td>Recordar tus preferencias de consentimiento</td><td>12 meses</td><td>Sastrería Prats</td></tr>
            <tr><td>__stripe_mid / __stripe_sid</td><td>Prevención de fraude en pasarela de pago</td><td>1 año / 30 min</td><td>Stripe</td></tr>
          </tbody>
        </table>

        <h3>3.2. Cookies analíticas o de medición</h3>
        <p>
          Permiten obtener información estadística sobre el uso del sitio (páginas visitadas,
          tiempo de permanencia, dispositivo, origen del tráfico) para mejorar nuestros
          servicios. Solo se instalan si das tu consentimiento.
        </p>
        <table>
          <thead>
            <tr><th>Cookie</th><th>Propósito</th><th>Duración</th><th>Titular</th></tr>
          </thead>
          <tbody>
            <tr><td>_ga</td><td>Identificador único de usuario para Google Analytics 4</td><td>2 años</td><td>Google</td></tr>
            <tr><td>_ga_*</td><td>Estado de la sesión analítica</td><td>2 años</td><td>Google</td></tr>
          </tbody>
        </table>

        <h3>3.3. Cookies de marketing y publicidad</h3>
        <p>
          Sirven para mostrarte contenido o anuncios personalizados, tanto en nuestro sitio como
          en plataformas de terceros (Google Ads, Meta), y para medir la efectividad de las
          campañas. Solo se activan si das tu consentimiento.
        </p>
        <table>
          <thead>
            <tr><th>Cookie</th><th>Propósito</th><th>Duración</th><th>Titular</th></tr>
          </thead>
          <tbody>
            <tr><td>_gcl_au</td><td>Atribución de conversiones de Google Ads</td><td>90 días</td><td>Google</td></tr>
            <tr><td>_fbp</td><td>Identificación para campañas de Meta (Facebook/Instagram)</td><td>90 días</td><td>Meta</td></tr>
          </tbody>
        </table>

        <h3>3.4. Cookies de preferencias o personalización</h3>
        <p>
          Recuerdan elecciones del usuario (idioma, divisa, productos vistos recientemente) para
          mostrar el sitio con la configuración preferida. Se activan con tu consentimiento.
        </p>

        <h2>4. Gestión y revocación del consentimiento</h2>
        <p>
          Al acceder por primera vez al sitio aparece un banner que te permite{' '}
          <strong>aceptar todas las cookies</strong>, <strong>rechazar las no esenciales</strong>{' '}
          o <strong>configurar tus preferencias</strong> por categorías. Puedes modificar tu
          decisión en cualquier momento haciendo clic en el botón{' '}
          <CookieSettingsButton />{' '}
          que encontrarás en el pie de página, o accediendo directamente a esta página.
        </p>
        <p>
          Adicionalmente, puedes bloquear o eliminar las cookies desde la configuración de tu
          navegador. Te dejamos los enlaces a los principales:
        </p>
        <ul>
          <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
          <li><a href="https://support.mozilla.org/es/kb/proteccion-antirastreo-mejorada-firefox-escritorio" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
          <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
          <li><a href="https://support.microsoft.com/es-es/microsoft-edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
        </ul>
        <p>
          Ten en cuenta que la desactivación de las cookies técnicas puede impedir el correcto
          funcionamiento del sitio (acceso a tu cuenta, carrito, proceso de compra).
        </p>

        <h2>5. Transferencias internacionales</h2>
        <p>
          Algunas cookies de terceros (Google, Meta, Stripe) pueden implicar la transferencia de
          datos a países fuera del Espacio Económico Europeo. Estas transferencias se realizan
          con las garantías adecuadas previstas en el RGPD (decisiones de adecuación o
          Cláusulas Contractuales Tipo).
        </p>

        <h2>6. Actualizaciones</h2>
        <p>
          Esta Política de Cookies puede modificarse para adaptarse a cambios normativos o a la
          incorporación de nuevas herramientas. Te recomendamos revisarla periódicamente. La
          fecha de la última actualización figura al inicio del documento.
        </p>
      </div>
    </div>
  )
}
