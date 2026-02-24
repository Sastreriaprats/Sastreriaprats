import { buildMetadata } from '@/lib/seo/metadata'

export const metadata = buildMetadata({
  title: 'Aviso Legal — Sastrería Prats',
  description: 'Aviso legal y condiciones de uso de Sastrería Prats.',
  path: '/aviso-legal',
  noindex: true,
})

export default function LegalNoticePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Aviso Legal</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy">
        <h2>1. Datos identificativos</h2>
        <p>
          En cumplimiento de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la
          Información y de Comercio Electrónico (LSSI-CE):
        </p>
        <ul>
          <li>Denominación social: Sastrería Prats, S.L.</li>
          <li>CIF: B-12345678</li>
          <li>Domicilio: Calle de Serrano 82, 28006 Madrid</li>
          <li>Inscrita en el Registro Mercantil de Madrid, Tomo XXXX, Folio XXX, Hoja M-XXXXXX</li>
          <li>Email: <a href="mailto:info@sastreriaprats.com">info@sastreriaprats.com</a></li>
          <li>Teléfono: +34 91 435 6789</li>
        </ul>

        <h2>2. Objeto</h2>
        <p>
          El presente sitio web tiene como objeto la comercialización de servicios de sastrería a medida,
          arreglos y venta de prendas y complementos de lujo.
        </p>

        <h2>3. Propiedad intelectual</h2>
        <p>
          Todos los contenidos del sitio web (textos, imágenes, diseños, logotipos, código fuente)
          son propiedad de Sastrería Prats o de sus licenciantes y están protegidos por las leyes
          de propiedad intelectual e industrial.
        </p>

        <h2>4. Responsabilidad</h2>
        <p>
          Prats no garantiza la disponibilidad continua del sitio web y no será responsable de daños
          derivados de interrupciones, errores o virus informáticos.
        </p>

        <h2>5. Legislación aplicable</h2>
        <p>
          Las presentes condiciones se rigen por la legislación española. Para cualquier controversia,
          las partes se someten a los Juzgados y Tribunales de Madrid.
        </p>

        <h2>6. Condiciones generales de contratación</h2>
        <p>
          La compra de productos a través de la tienda online implica la aceptación de las siguientes condiciones:
        </p>
        <ul>
          <li>Los precios incluyen IVA salvo indicación contraria</li>
          <li>Los plazos de entrega son orientativos y pueden variar según disponibilidad</li>
          <li>El derecho de desistimiento podrá ejercerse en un plazo de 14 días naturales desde la recepción del pedido, salvo en productos personalizados o a medida</li>
          <li>Las prendas a medida y las modificaciones no admiten devolución</li>
        </ul>

        <h2>7. Resolución de litigios en línea</h2>
        <p>
          Conforme al Art. 14.1 del Reglamento (UE) 524/2013, la Comisión Europea facilita una
          plataforma de resolución de litigios en línea disponible en{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
            https://ec.europa.eu/consumers/odr
          </a>.
        </p>
      </div>
    </div>
  )
}
