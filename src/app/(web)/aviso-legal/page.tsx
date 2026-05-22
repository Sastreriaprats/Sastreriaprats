import { buildMetadata } from '@/lib/seo/metadata'

export const revalidate = 86400

export const metadata = buildMetadata({
  title: 'Aviso Legal — Sastrería Prats',
  description: 'Aviso legal y condiciones de uso del sitio web de Sastrería Prats (Prats Eugercios y González, S.L.).',
  path: '/aviso-legal',
  noindex: true,
})

export default function LegalNoticePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Aviso Legal</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy prose-a:text-prats-gold">
        <p><strong>Última actualización:</strong> Mayo 2026</p>

        <h2>1. Datos identificativos del prestador</h2>
        <p>
          En cumplimiento del deber de información recogido en el artículo 10 de la Ley 34/2002,
          de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico
          (LSSI-CE), se ponen a disposición del usuario los siguientes datos:
        </p>
        <ul>
          <li><strong>Denominación social:</strong> PRATS EUGERCIOS Y GONZÁLEZ, S.L. (en adelante, &quot;Sastrería Prats&quot; o &quot;el prestador&quot;)</li>
          <li><strong>CIF:</strong> B-88391834</li>
          <li><strong>Domicilio social:</strong> Calle Hermanos Pinzón, 4 — 28036 Madrid (España)</li>
          <li><strong>Correo electrónico:</strong> <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a></li>
          <li><strong>Teléfono:</strong> +34 912 401 845</li>
          <li><strong>Sitio web:</strong> <a href="https://sastreriaprats.com">sastreriaprats.com</a></li>
        </ul>
        <p>
          Sastrería Prats es una casa de sastrería con sede en Madrid, dedicada a la confección de
          prendas a medida (sastrería artesanal y semi-medida industrial), a la venta de prendas
          y complementos de caballero y señora, y a la realización de arreglos y modificaciones.
        </p>

        <h2>2. Objeto y ámbito de aplicación</h2>
        <p>
          El presente aviso legal regula el acceso, navegación y uso del sitio web
          <a href="https://sastreriaprats.com"> sastreriaprats.com</a> (en adelante, &quot;el sitio web&quot;),
          así como las responsabilidades derivadas de la utilización de sus contenidos. El acceso
          al sitio web implica la aceptación plena y sin reservas de todas las disposiciones
          incluidas en este aviso legal en su versión vigente en cada momento.
        </p>
        <p>
          El sitio web tiene como finalidad la presentación de los servicios de sastrería de Prats,
          la comercialización online de prendas, complementos y servicios, y la gestión de citas
          presenciales en las boutiques de Madrid (Hermanos Pinzón y Wellington Hotel &amp; Spa).
        </p>

        <h2>3. Condiciones de uso del sitio web</h2>
        <p>El usuario se compromete a hacer un uso adecuado y lícito del sitio web, abstenéndose de:</p>
        <ul>
          <li>Utilizarlo con fines o efectos contrarios a la ley, la moral o el orden público.</li>
          <li>Reproducir, copiar, distribuir o transformar los contenidos sin autorización expresa.</li>
          <li>Introducir o difundir virus informáticos o cualquier otro elemento que pueda dañar
            los sistemas de Sastrería Prats o de terceros.</li>
          <li>Suplantar la identidad de terceros o utilizar datos falsos en formularios o pedidos.</li>
        </ul>

        <h2>4. Propiedad intelectual e industrial</h2>
        <p>
          Todos los contenidos del sitio web —incluyendo, a título enunciativo, textos, fotografías,
          gráficos, imágenes, diseños, vídeos, marcas, logotipos, código fuente y bases de datos—
          son titularidad de Prats Eugercios y González, S.L. o de sus licenciantes, y se
          encuentran protegidos por la normativa española e internacional sobre propiedad
          intelectual e industrial.
        </p>
        <p>
          La marca &quot;Sastrería Prats&quot; y el lema &quot;Auténtico e Imperfecto&quot;, así como cualquier otro
          signo distintivo asociado, son propiedad del prestador. Queda expresamente prohibida su
          reproducción o uso sin autorización previa y por escrito.
        </p>

        <h2>5. Enlaces a terceros</h2>
        <p>
          El sitio web puede contener enlaces a sitios de terceros (redes sociales, proveedores de
          pago, plataformas de mapas). Sastrería Prats no se hace responsable del contenido, las
          políticas de privacidad ni las prácticas de dichos sitios externos.
        </p>

        <h2>6. Exclusión de responsabilidad</h2>
        <p>
          Sastrería Prats no garantiza la disponibilidad continuada del sitio web y se reserva el
          derecho a suspender temporalmente el acceso por motivos técnicos, de mantenimiento o de
          seguridad. No será responsable de los daños o perjuicios derivados de interrupciones,
          errores, omisiones, virus informáticos o de la indisponibilidad del servicio, salvo en los
          casos previstos por la ley.
        </p>

        <h2>7. Protección de datos</h2>
        <p>
          El tratamiento de los datos personales facilitados a través del sitio web se rige por
          nuestra <a href="/privacidad">Política de Privacidad</a> y por nuestra
          <a href="/cookies"> Política de Cookies</a>, en cumplimiento del Reglamento (UE) 2016/679
          (RGPD) y de la Ley Orgánica 3/2018 (LOPDGDD).
        </p>

        <h2>8. Modificaciones</h2>
        <p>
          Sastrería Prats se reserva el derecho a modificar, en cualquier momento y sin previo
          aviso, el contenido del sitio web, así como las condiciones de uso, con el fin de
          adaptarlas a la legislación vigente o a la evolución del negocio.
        </p>

        <h2>9. Legislación aplicable y jurisdicción</h2>
        <p>
          El presente aviso legal se rige por la legislación española. Para la resolución de
          cualquier controversia derivada del acceso o uso del sitio web, las partes se someten,
          con renuncia expresa a cualquier otro fuero que pudiera corresponderles, a los Juzgados
          y Tribunales de la ciudad de Madrid, salvo cuando la normativa de consumidores y
          usuarios establezca otro fuero imperativo.
        </p>

        <h2>10. Resolución de litigios en línea</h2>
        <p>
          Conforme al artículo 14.1 del Reglamento (UE) 524/2013, la Comisión Europea facilita
          una plataforma de resolución de litigios en línea, accesible en{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
            https://ec.europa.eu/consumers/odr
          </a>.
        </p>
      </div>
    </div>
  )
}
