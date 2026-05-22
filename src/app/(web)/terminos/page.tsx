import { buildMetadata } from '@/lib/seo/metadata'

export const revalidate = 86400

export const metadata = buildMetadata({
  title: 'Términos del Servicio — Sastrería Prats',
  description: 'Condiciones generales de contratación y términos del servicio de Sastrería Prats: tienda online, sastrería a medida, citas y arreglos.',
  path: '/terminos',
  noindex: true,
})

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Términos del Servicio</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy prose-a:text-prats-gold">
        <p><strong>Última actualización:</strong> Mayo 2026</p>

        <p>
          Las presentes Condiciones Generales de Contratación regulan la relación entre PRATS
          EUGERCIOS Y GONZÁLEZ, S.L. (en adelante, &quot;Sastrería Prats&quot;) y los usuarios y clientes
          que adquieren productos o contratan servicios a través del sitio web{' '}
          <a href="https://sastreriaprats.com">sastreriaprats.com</a> o presencialmente en
          nuestras boutiques de Madrid.
        </p>

        <h2>1. Identificación del prestador</h2>
        <ul>
          <li><strong>Razón social:</strong> PRATS EUGERCIOS Y GONZÁLEZ, S.L.</li>
          <li><strong>CIF:</strong> B-88391834</li>
          <li><strong>Domicilio social:</strong> Calle Hermanos Pinzón, 4 — 28036 Madrid</li>
          <li><strong>Correo electrónico:</strong> <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a></li>
          <li><strong>Teléfono:</strong> +34 912 401 845</li>
        </ul>

        <h2>2. Objeto</h2>
        <p>
          Estas condiciones tienen por objeto regular la venta de productos y la prestación de
          los servicios ofrecidos por Sastrería Prats, entre los que se incluyen, sin carácter
          limitativo:
        </p>
        <ul>
          <li><strong>Sastrería a medida artesanal:</strong> trajes, chaqués, smokings, levitas, abrigos, chalecos y camisería confeccionados íntegramente a medida del cliente.</li>
          <li><strong>Sastrería semi-medida industrial:</strong> prendas ajustadas y producidas con base estándar y modificaciones personalizadas.</li>
          <li><strong>Prendas y complementos en tienda (ready-to-wear):</strong> americanas, pantalones, camisería, corbatería, calzado, accesorios y regalos.</li>
          <li><strong>Servicio de arreglos y modificaciones</strong> sobre prendas propias o adquiridas.</li>
          <li><strong>Asesoramiento de imagen y estilo</strong> en boutique o a domicilio (con cita previa).</li>
          <li><strong>Servicios para ceremonias, eventos y empresa</strong> (uniformidad, vestuario para bodas, equipos corporativos).</li>
        </ul>

        <h2>3. Aceptación y capacidad</h2>
        <p>
          La realización de un pedido o la contratación de un servicio implica la aceptación
          plena y sin reservas de estas condiciones, así como del{' '}
          <a href="/aviso-legal">Aviso Legal</a>, la{' '}
          <a href="/privacidad">Política de Privacidad</a> y la{' '}
          <a href="/cookies">Política de Cookies</a> en su versión vigente en el momento del
          encargo.
        </p>
        <p>
          Para realizar pedidos en la tienda online es necesario ser mayor de edad (18 años) y
          tener capacidad legal para contratar. Sastrería Prats podrá solicitar acreditación
          documental cuando lo considere necesario.
        </p>

        <h2>4. Productos, precios e IVA</h2>
        <p>
          Las descripciones, fotografías, tejidos, colores y composiciones que figuran en el
          sitio web son meramente orientativas. Trabajamos con tejidos nobles y procesos
          artesanales en los que pueden existir pequeñas variaciones de tono, dibujo o textura.
        </p>
        <p>
          Todos los precios se expresan en <strong>euros (EUR)</strong> e{' '}
          <strong>incluyen el IVA</strong> aplicable salvo indicación expresa en contrario. Los
          gastos de envío, cuando proceda, se calculan en el carrito antes de finalizar el pago.
          Las operaciones a Canarias, Ceuta y Melilla se facturan sin IVA, sin perjuicio de los
          impuestos y aranceles aplicables en destino.
        </p>
        <p>
          Sastrería Prats se reserva el derecho a modificar los precios en cualquier momento,
          aplicándose el precio vigente en el momento de la confirmación del pedido.
        </p>

        <h2>5. Proceso de compra online</h2>
        <ol>
          <li>Selecciona los productos y añádelos al carrito.</li>
          <li>Revisa el contenido del carrito, talla y cantidades.</li>
          <li>Identifícate como cliente o continúa como invitado e introduce los datos de envío y facturación.</li>
          <li>Selecciona método de envío y método de pago.</li>
          <li>Acepta las presentes condiciones y completa el pago.</li>
          <li>Recibirás un correo electrónico con la confirmación del pedido y, posteriormente, otro con el seguimiento del envío.</li>
        </ol>
        <p>
          La confirmación del pedido por parte de Sastrería Prats perfecciona el contrato.
          Sastrería Prats se reserva el derecho a no aceptar un pedido en caso de errores
          tipográficos manifiestos en el precio, falta de stock o sospecha de fraude.
        </p>

        <h2>6. Métodos de pago</h2>
        <p>Aceptamos los siguientes medios de pago:</p>
        <ul>
          <li>Tarjetas de crédito y débito (Visa, Mastercard, American Express) a través de Stripe y Redsys.</li>
          <li>Bizum.</li>
          <li>Apple Pay y Google Pay.</li>
          <li>Transferencia bancaria (para pedidos a medida que requieran señal o pago aplazado, según presupuesto).</li>
          <li>Pago en boutique en efectivo o tarjeta (encargos presenciales).</li>
        </ul>
        <p>
          Los datos de tarjeta se procesan directamente por las pasarelas, bajo estándares
          PCI-DSS. <strong>Sastrería Prats no almacena ni accede a tu información completa de
          tarjeta.</strong>
        </p>

        <h2>7. Pedidos a medida y señales</h2>
        <p>
          La sastrería a medida —artesanal o semi-medida— requiere un proceso específico:
        </p>
        <ol>
          <li><strong>Cita y asesoramiento</strong> en boutique para la toma de medidas y elección de tejidos, forros, botones y detalles.</li>
          <li><strong>Presupuesto y aceptación.</strong> En el momento del encargo se entrega presupuesto detallado.</li>
          <li><strong>Señal o anticipo</strong> equivalente al <strong>50 % del importe total</strong>, salvo pacto distinto por escrito. El resto se abona al finalizar la confección y antes de la entrega.</li>
          <li><strong>Pruebas</strong> en taller. El número de pruebas dependerá de la complejidad del encargo.</li>
          <li><strong>Entrega final</strong> y, en su caso, ajustes posteriores incluidos en garantía.</li>
        </ol>
        <p>
          <strong>Importante:</strong> los encargos a medida no admiten desistimiento ni
          devolución (ver <a href="/reembolsos">Política de Reembolsos</a>), salvo defecto de
          confección. El cliente se compromete a acudir a las pruebas concertadas; en caso de
          incomparecencias reiteradas, Sastrería Prats podrá resolver el contrato con pérdida de
          las cantidades anticipadas.
        </p>

        <h2>8. Cita previa y servicios presenciales</h2>
        <p>
          Las citas para asesoramiento, toma de medidas, pruebas o recogida se pueden reservar a
          través de la página <a href="/reservar">Reservar cita</a> o llamando al teléfono de la
          boutique correspondiente. Te rogamos que avises con al menos <strong>24 horas</strong>{' '}
          de antelación en caso de cancelación o reprogramación, especialmente para citas
          fuera del horario habitual.
        </p>

        <h2>9. Envíos, devoluciones y garantía</h2>
        <p>
          Las condiciones específicas de envíos están detalladas en nuestra{' '}
          <a href="/envios">Política de Envíos</a>, y las relativas a devoluciones, derecho de
          desistimiento y garantía legal en la{' '}
          <a href="/reembolsos">Política de Reembolsos y Devoluciones</a>.
        </p>

        <h2>10. Facturación</h2>
        <p>
          Sastrería Prats emite factura electrónica por todas las operaciones, conforme a la
          normativa fiscal vigente. Si necesitas factura con datos de empresa, indícalo en el
          momento de la compra o solicítala posteriormente en{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>{' '}
          aportando razón social, CIF y domicilio fiscal.
        </p>

        <h2>11. Tarjetas regalo</h2>
        <p>
          Las tarjetas regalo emitidas por Sastrería Prats son nominativas, intransferibles y
          canjeables por cualquier producto o servicio en boutique y, cuando proceda, en la
          tienda online. La vigencia es de <strong>12 meses</strong> desde la fecha de emisión
          salvo indicación distinta en la propia tarjeta. No son reembolsables en metálico.
        </p>

        <h2>12. Propiedad intelectual</h2>
        <p>
          Todos los contenidos del sitio web son propiedad de Sastrería Prats o de sus
          licenciantes y están protegidos por la normativa de propiedad intelectual e
          industrial. Queda prohibida su reproducción o uso sin autorización. Más información en
          el <a href="/aviso-legal">Aviso Legal</a>.
        </p>

        <h2>13. Responsabilidad</h2>
        <p>
          Sastrería Prats responde de la calidad de los productos y servicios conforme a la
          legislación vigente. No será responsable de los daños derivados del uso inadecuado de
          las prendas (lavados no acordes con la etiqueta de cuidados, exposición a productos
          químicos, modificaciones por terceros, etc.) ni de los retrasos imputables a
          transportistas, fabricantes de tejido o causas de fuerza mayor.
        </p>

        <h2>14. Modificación de las condiciones</h2>
        <p>
          Sastrería Prats podrá modificar las presentes condiciones en cualquier momento,
          aplicándose siempre las vigentes en la fecha en que el cliente realice el pedido o
          contrate el servicio.
        </p>

        <h2>15. Legislación aplicable y resolución de conflictos</h2>
        <p>
          Las presentes condiciones se rigen por la legislación española. Para la resolución de
          controversias, las partes se someten a los Juzgados y Tribunales de Madrid, sin
          perjuicio del fuero imperativo que la normativa de consumidores y usuarios reconozca a
          los consumidores.
        </p>
        <p>
          De acuerdo con el artículo 14.1 del Reglamento (UE) 524/2013, los consumidores pueden
          acudir a la plataforma europea de resolución de litigios en línea:{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
            https://ec.europa.eu/consumers/odr
          </a>.
        </p>

        <h2>16. Contacto</h2>
        <p>
          Para cualquier consulta relacionada con estos términos puedes escribirnos a{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>{' '}
          o llamar al +34 912 401 845.
        </p>
      </div>
    </div>
  )
}
