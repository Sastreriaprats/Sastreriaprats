import { buildMetadata } from '@/lib/seo/metadata'

export const revalidate = 86400

export const metadata = buildMetadata({
  title: 'Política de Envíos — Sastrería Prats',
  description: 'Plazos, tarifas y zonas de envío de Sastrería Prats. Recogida en boutiques, envío a domicilio en España y plazos especiales para prendas a medida.',
  path: '/envios',
  noindex: true,
})

export default function ShippingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Política de Envíos</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy prose-a:text-prats-gold">
        <p><strong>Última actualización:</strong> Mayo 2026</p>

        <p>
          La presente Política de Envíos regula las condiciones en las que Sastrería Prats —
          PRATS EUGERCIOS Y GONZÁLEZ, S.L. (CIF B-88391834), con domicilio en Calle Hermanos
          Pinzón, 4 — 28036 Madrid — entrega los pedidos realizados a través del sitio web{' '}
          <a href="https://sastreriaprats.com">sastreriaprats.com</a> o gestionados desde
          nuestras boutiques.
        </p>

        <h2>1. Zonas de envío</h2>
        <p>Actualmente realizamos envíos a:</p>
        <ul>
          <li><strong>Península ibérica</strong> (España peninsular y Portugal continental).</li>
          <li><strong>Islas Baleares.</strong></li>
          <li><strong>Islas Canarias, Ceuta y Melilla</strong> (con condiciones fiscales y de plazo específicas, ver apartado 4).</li>
          <li><strong>Unión Europea</strong> (consulta tarifa al finalizar el pedido).</li>
          <li><strong>Resto del mundo:</strong> envíos internacionales bajo solicitud previa; escríbenos a <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a> para presupuesto personalizado.</li>
        </ul>

        <h2>2. Plazos de entrega</h2>
        <p>
          Los plazos comienzan a contar desde la confirmación del pago, no desde la fecha del
          pedido. Son orientativos y pueden variar por causas ajenas a Sastrería Prats
          (festividades, incidencias del transportista, condiciones meteorológicas, aduanas).
        </p>
        <table>
          <thead>
            <tr><th>Destino</th><th>Plazo estimado</th></tr>
          </thead>
          <tbody>
            <tr><td>Madrid capital (mensajería urgente)</td><td>24 h laborables</td></tr>
            <tr><td>Península ibérica (España)</td><td>24 – 48 h laborables</td></tr>
            <tr><td>Portugal continental</td><td>2 – 4 días laborables</td></tr>
            <tr><td>Islas Baleares</td><td>2 – 5 días laborables</td></tr>
            <tr><td>Islas Canarias, Ceuta y Melilla</td><td>3 – 7 días laborables</td></tr>
            <tr><td>Resto Unión Europea</td><td>3 – 6 días laborables</td></tr>
          </tbody>
        </table>
        <p>
          Los pedidos confirmados antes de las <strong>14:00 h (hora peninsular)</strong> en día
          laborable se preparan ese mismo día. Los recibidos después o en fin de semana se
          procesan el siguiente día hábil.
        </p>

        <h2>3. Plazos especiales para prendas a medida</h2>
        <p>
          Las prendas confeccionadas a medida (sastrería artesanal o semi-medida industrial) no
          siguen los plazos del envío estándar, ya que requieren proceso de confección, pruebas
          y ajustes. Los plazos orientativos son:
        </p>
        <ul>
          <li><strong>Camisería a medida:</strong> 3 – 5 semanas.</li>
          <li><strong>Sastrería semi-medida industrial:</strong> 6 – 8 semanas.</li>
          <li><strong>Sastrería artesanal completa (full bespoke):</strong> 8 – 16 semanas, según pruebas necesarias y complejidad.</li>
          <li><strong>Chaqué y smoking ceremonial:</strong> consulta con tu asesor; te recomendamos iniciar el encargo con al menos 3 meses de antelación.</li>
        </ul>
        <p>
          Cuando la prenda esté terminada, te avisaremos para concertar la prueba final o el
          envío. Si lo prefieres, podemos enviarla a domicilio una vez aprobada la última prueba.
        </p>

        <h2>4. Tarifas de envío</h2>
        <p>
          El coste exacto del envío se calcula automáticamente en el carrito en función del
          destino, el peso y el método elegido. Como referencia orientativa:
        </p>
        <table>
          <thead>
            <tr><th>Destino</th><th>Tarifa estándar</th><th>Envío gratuito a partir de</th></tr>
          </thead>
          <tbody>
            <tr><td>Madrid capital</td><td>6,90 €</td><td>150 €</td></tr>
            <tr><td>Península y Portugal</td><td>7,90 €</td><td>150 €</td></tr>
            <tr><td>Baleares</td><td>14,90 €</td><td>250 €</td></tr>
            <tr><td>Canarias, Ceuta y Melilla</td><td>19,90 €*</td><td>—</td></tr>
            <tr><td>Resto Unión Europea</td><td>desde 19,90 €</td><td>—</td></tr>
          </tbody>
        </table>
        <p>
          <strong>*Canarias, Ceuta y Melilla:</strong> los pedidos a estas zonas están exentos
          de IVA peninsular pero pueden estar sujetos al pago de IGIC, IPSI o aranceles aduaneros
          en destino, que correrán por cuenta del cliente. Sastrería Prats facilita la
          documentación necesaria.
        </p>

        <h2>5. Recogida en boutique</h2>
        <p>
          Puedes elegir la opción de <strong>recogida gratuita</strong> en cualquiera de nuestras
          dos boutiques de Madrid al finalizar la compra:
        </p>
        <ul>
          <li><strong>Boutique Hermanos Pinzón:</strong> Calle Hermanos Pinzón, 4 — 28036 Madrid. Lunes a viernes 10:00 – 20:00, sábados 10:00 – 14:00.</li>
          <li><strong>Boutique Wellington (Wellington Hotel &amp; Spa):</strong> Calle Velázquez, 8 — 28001 Madrid. Lunes a viernes 10:00 – 14:00 y 16:30 – 20:30, sábados 10:00 – 14:00.</li>
        </ul>
        <p>
          Te avisaremos por correo electrónico cuando el pedido esté listo. Dispondrás de{' '}
          <strong>14 días naturales</strong> desde el aviso para retirarlo. Para recogerlo deberás
          presentar el número de pedido y un documento de identidad.
        </p>

        <h2>6. Transportistas y seguimiento</h2>
        <p>
          Trabajamos con operadores logísticos de primer nivel (SEUR, MRW, GLS y Correos Express,
          entre otros) que cuentan con seguros y sistemas de seguimiento. Al expedir el pedido
          recibirás un correo con el número de seguimiento y el enlace al portal del
          transportista.
        </p>
        <p>
          En caso de ausencia en la dirección de entrega, el transportista realizará un segundo
          intento o dejará aviso para concertar nueva entrega o recogida en oficina, según el
          operador.
        </p>

        <h2>7. Verificación del pedido en la entrega</h2>
        <p>
          Te recomendamos comprobar el estado del paquete en el momento de la recepción. Si
          observas daños externos, golpes evidentes o que el paquete no cuadra con tu pedido,
          indícalo en el albarán del transportista y comunícanoslo en un plazo máximo de{' '}
          <strong>24 horas</strong> escribiendo a{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>,
          adjuntando fotografías. Esto agiliza la reclamación con el operador logístico y la
          sustitución o reparación del producto.
        </p>

        <h2>8. Incidencias y entregas fallidas</h2>
        <p>
          Si tras dos intentos de entrega o el plazo de espera en oficina el paquete vuelve a
          nuestras instalaciones, contactaremos contigo para acordar un reenvío. Los gastos del
          segundo envío correrán por cuenta del cliente. Si transcurridos 30 días no podemos
          completar la entrega, podremos cancelar el pedido y reembolsar el importe descontando
          los gastos efectivamente soportados.
        </p>

        <h2>9. Embalaje y sostenibilidad</h2>
        <p>
          Cuidamos cada detalle del embalaje: las prendas viajan en bolsa portatrajes, perchas
          adecuadas y cajas reforzadas. Trabajamos para reducir progresivamente el uso de
          plásticos y emplear materiales reciclables siempre que sea posible.
        </p>

        <h2>10. Contacto</h2>
        <p>
          Para cualquier duda sobre tu envío, plazos o tarifas, contáctanos en{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>{' '}
          o llamando al +34 912 401 845. Estaremos encantados de ayudarte.
        </p>
      </div>
    </div>
  )
}
