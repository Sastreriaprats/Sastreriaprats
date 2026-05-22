import { buildMetadata } from '@/lib/seo/metadata'

export const revalidate = 86400

export const metadata = buildMetadata({
  title: 'Política de Reembolsos y Devoluciones — Sastrería Prats',
  description: 'Condiciones para devoluciones, cambios y reembolsos en Sastrería Prats. Información sobre el derecho de desistimiento y excepciones para productos personalizados o a medida.',
  path: '/reembolsos',
  noindex: true,
})

export default function RefundsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Política de Reembolsos y Devoluciones</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy prose-a:text-prats-gold">
        <p><strong>Última actualización:</strong> Mayo 2026</p>

        <p>
          En Sastrería Prats trabajamos para que cada prenda y cada complemento que sale de
          nuestras boutiques cumpla con tus expectativas. Si por cualquier motivo no estás
          satisfecho con tu compra, en esta política encontrarás las condiciones, los plazos y
          el procedimiento para solicitar una devolución, un cambio o un reembolso, conforme al
          Real Decreto Legislativo 1/2007, de 16 de noviembre, por el que se aprueba el texto
          refundido de la Ley General para la Defensa de los Consumidores y Usuarios.
        </p>

        <h2>1. Titular y datos de contacto</h2>
        <ul>
          <li><strong>Razón social:</strong> PRATS EUGERCIOS Y GONZÁLEZ, S.L.</li>
          <li><strong>CIF:</strong> B-88391834</li>
          <li><strong>Domicilio:</strong> Calle Hermanos Pinzón, 4 — 28036 Madrid</li>
          <li><strong>Correo electrónico:</strong> <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a></li>
          <li><strong>Teléfono:</strong> +34 912 401 845</li>
        </ul>

        <h2>2. Derecho de desistimiento</h2>
        <p>
          Como consumidor, tienes derecho a desistir del contrato en un plazo de{' '}
          <strong>14 días naturales</strong> a contar desde la fecha en que tú o un tercero por ti
          —distinto del transportista— recibió el pedido, sin necesidad de justificar tu decisión
          y sin penalización alguna.
        </p>
        <p>
          Para ejercer el derecho de desistimiento, debes notificarnos tu decisión mediante una
          declaración inequívoca, enviando un correo electrónico a{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>{' '}
          indicando:
        </p>
        <ul>
          <li>Tu nombre y apellidos.</li>
          <li>Número de pedido y fecha de recepción.</li>
          <li>Productos que deseas devolver.</li>
          <li>Motivo (opcional) y cuenta bancaria (si difiere del medio de pago original).</li>
        </ul>

        <h2>3. Excepciones al derecho de desistimiento</h2>
        <p>
          De conformidad con el artículo 103 del Real Decreto Legislativo 1/2007,{' '}
          <strong>no existe derecho de desistimiento</strong> sobre los siguientes productos y
          servicios:
        </p>
        <ul>
          <li>
            <strong>Prendas de sastrería a medida (artesanal o industrial semi-medida):</strong>{' '}
            trajes, americanas, pantalones, chalecos, camisas, abrigos, chaqués, smokings y
            cualquier otra pieza confeccionada o ajustada según las especificaciones del cliente
            (tejido, forro, botones, monogramas, medidas).
          </li>
          <li>
            <strong>Arreglos y modificaciones</strong> realizados sobre prendas propias o
            adquiridas en la tienda (subidas, ajustes de talla, cambios de cremallera, etc.).
          </li>
          <li>Productos personalizados con monograma, bordado o iniciales.</li>
          <li>Tarjetas regalo y vales nominativos ya emitidos a nombre del cliente.</li>
        </ul>
        <p>
          Si una pieza a medida presenta un defecto de confección o no se ajusta a lo encargado,
          Sastrería Prats lo reparará o realizará los ajustes necesarios sin coste, conforme a
          la garantía legal (apartado 7).
        </p>

        <h2>4. Productos elegibles para devolución</h2>
        <p>
          Pueden devolverse las prendas y complementos de venta libre (ready-to-wear, accesorios,
          corbatas, pañuelos, calzado, etc.) siempre que cumplan todas estas condiciones:
        </p>
        <ul>
          <li>Estén en su estado original, sin uso, sin lavar ni planchar.</li>
          <li>Conserven todas las etiquetas, precintos, bolsas protectoras y embalaje original.</li>
          <li>No presenten signos de desgaste, manchas, olores ni alteraciones.</li>
          <li>Se devuelvan con el ticket o número de pedido como justificante de compra.</li>
        </ul>

        <h2>5. Procedimiento de devolución</h2>
        <ol>
          <li>
            <strong>Solicita la devolución</strong> escribiendo a{' '}
            <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>{' '}
            o llamando al +34 912 401 845 dentro del plazo de 14 días naturales.
          </li>
          <li>
            Te confirmaremos por correo la aceptación y te indicaremos cómo proceder: envío por
            mensajería a nuestra dirección o entrega presencial en cualquiera de nuestras
            boutiques de Madrid (Hermanos Pinzón, 4 o Wellington Hotel &amp; Spa, Velázquez 8).
          </li>
          <li>
            Embala el producto cuidadosamente con todos sus accesorios y etiquetas. Te
            recomendamos asegurar el envío, ya que la mercancía viaja bajo tu responsabilidad
            hasta su recepción en nuestras instalaciones.
          </li>
          <li>
            Tras recibir el producto, verificaremos su estado en un plazo máximo de{' '}
            <strong>5 días laborables</strong> y te confirmaremos el resultado.
          </li>
        </ol>

        <h2>6. Plazo y forma de reembolso</h2>
        <p>
          Una vez aceptada la devolución, te reembolsaremos el importe abonado, incluidos los
          gastos de envío de la compra original (cuando proceda según la modalidad de entrega
          estándar elegida), en un plazo máximo de <strong>14 días naturales</strong> desde la
          recepción del producto. El reembolso se realizará por el mismo medio de pago empleado
          en la compra (tarjeta, Bizum, transferencia), salvo que solicites expresamente otra
          modalidad.
        </p>
        <p>
          <strong>Gastos de devolución:</strong> los gastos directos de devolución (transporte de
          retorno) corren por cuenta del cliente, salvo en los casos de producto defectuoso,
          error de envío o falta de conformidad imputable a Sastrería Prats.
        </p>

        <h2>7. Garantía legal de conformidad</h2>
        <p>
          Todos los productos cuentan con la garantía legal prevista en los artículos 114 y
          siguientes del Real Decreto Legislativo 1/2007 frente a las faltas de conformidad
          existentes en el momento de la entrega. El plazo de garantía es de{' '}
          <strong>3 años</strong> para bienes nuevos y de <strong>1 año</strong> para bienes de
          segunda mano, en su caso.
        </p>
        <p>
          Si detectas un defecto de fabricación o una falta de conformidad, contáctanos lo antes
          posible en{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>{' '}
          aportando fotografías y descripción del problema. Procederemos, según el caso, a la
          reparación, sustitución, rebaja del precio o resolución del contrato conforme a la
          legislación aplicable.
        </p>

        <h2>8. Cambios de talla o producto</h2>
        <p>
          En prendas de venta libre admitimos cambios por otra talla, color o referencia dentro
          del plazo de 14 días naturales, sujeto a disponibilidad de stock. Si la nueva prenda
          tiene un precio distinto, se abonará o reembolsará la diferencia. Las prendas a medida
          no admiten cambio; sí se pueden realizar ajustes en taller cuando proceda.
        </p>

        <h2>9. Reclamaciones</h2>
        <p>
          Sastrería Prats dispone de hojas de reclamación oficiales a disposición del cliente
          en sus boutiques. Puedes presentar cualquier reclamación a través de las mismas o por
          correo electrónico a{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>.
        </p>
        <p>
          Además, conforme al artículo 14.1 del Reglamento (UE) 524/2013, la Comisión Europea
          pone a disposición del consumidor una plataforma de resolución de litigios en línea
          accesible en{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
            https://ec.europa.eu/consumers/odr
          </a>.
        </p>
      </div>
    </div>
  )
}
