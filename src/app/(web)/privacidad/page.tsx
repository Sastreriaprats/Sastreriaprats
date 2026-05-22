import { buildMetadata } from '@/lib/seo/metadata'

export const revalidate = 86400

export const metadata = buildMetadata({
  title: 'Política de Privacidad — Sastrería Prats',
  description: 'Política de privacidad de Sastrería Prats (Prats Eugercios y González, S.L.). Información sobre el tratamiento de datos personales conforme al RGPD y la LOPDGDD.',
  path: '/privacidad',
  noindex: true,
})

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Política de Privacidad</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy prose-a:text-prats-gold">
        <p><strong>Última actualización:</strong> Mayo 2026</p>

        <p>
          En Sastrería Prats nos tomamos muy en serio la protección de tus datos personales.
          Esta Política de Privacidad explica qué información recogemos, con qué finalidad la
          tratamos, en qué base legal nos apoyamos y cuáles son tus derechos, en cumplimiento
          del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018, de Protección de
          Datos Personales y garantía de los derechos digitales (LOPDGDD).
        </p>

        <h2>1. Responsable del tratamiento</h2>
        <ul>
          <li><strong>Identidad:</strong> PRATS EUGERCIOS Y GONZÁLEZ, S.L. (en adelante, &quot;Sastrería Prats&quot;)</li>
          <li><strong>CIF:</strong> B-88391834</li>
          <li><strong>Domicilio:</strong> Calle Hermanos Pinzón, 4 — 28036 Madrid (España)</li>
          <li><strong>Correo electrónico:</strong> <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a></li>
          <li><strong>Teléfono:</strong> +34 912 401 845</li>
        </ul>

        <h2>2. Datos personales que tratamos</h2>
        <p>En función del servicio que solicites, podemos tratar las siguientes categorías de datos:</p>
        <ul>
          <li><strong>Datos identificativos y de contacto:</strong> nombre, apellidos, DNI/NIF (cuando es necesario para facturación), dirección postal, teléfono y correo electrónico.</li>
          <li><strong>Datos de la cuenta de cliente:</strong> credenciales de acceso, historial de pedidos, preferencias y favoritos.</li>
          <li><strong>Datos de compra y facturación:</strong> productos adquiridos, importes, datos fiscales y dirección de envío. Los <strong>datos de tarjeta no son almacenados</strong> por Sastrería Prats; los gestionan directamente los proveedores de pago (Stripe y Redsys) bajo estándares PCI-DSS.</li>
          <li><strong>Datos del servicio de sastrería a medida:</strong> medidas corporales, fichas de prueba, preferencias de estilo, tejidos y forros elegidos, fotografías de pruebas (con tu consentimiento explícito).</li>
          <li><strong>Datos de navegación:</strong> dirección IP, identificador de dispositivo, páginas visitadas, cookies y datos analíticos. Más detalle en nuestra <a href="/cookies">Política de Cookies</a>.</li>
          <li><strong>Datos de comunicaciones:</strong> contenido de los mensajes que nos envíes por formulario, correo, WhatsApp o redes sociales.</li>
        </ul>

        <h2>3. Finalidades del tratamiento</h2>
        <p>Tratamos tus datos para las siguientes finalidades:</p>
        <ul>
          <li>Gestionar la compra de productos y la prestación de servicios de sastrería (a medida, semi-medida o industrial) y arreglos.</li>
          <li>Gestionar tu cuenta de cliente, pedidos, citas presenciales y comunicaciones derivadas.</li>
          <li>Cumplir con obligaciones legales, fiscales y contables (emisión de facturas, libros contables, etc.).</li>
          <li>Atender consultas, reclamaciones y solicitudes de devolución o garantía.</li>
          <li>Enviar comunicaciones comerciales y newsletter sobre nuevas colecciones, eventos y promociones, siempre que hayas dado tu consentimiento.</li>
          <li>Analizar el uso del sitio web y mejorar la experiencia del usuario (con base en tu consentimiento para cookies analíticas).</li>
          <li>Prevenir el fraude y garantizar la seguridad de la web y los sistemas de pago.</li>
        </ul>

        <h2>4. Base legal del tratamiento</h2>
        <ul>
          <li><strong>Ejecución de un contrato:</strong> para gestionar pedidos, prestaciones de sastrería y servicio postventa.</li>
          <li><strong>Cumplimiento de una obligación legal:</strong> para la facturación, contabilidad y normativa fiscal.</li>
          <li><strong>Consentimiento del interesado:</strong> para el envío de comunicaciones comerciales, newsletter, cookies no esenciales y para la conservación de fotografías de pruebas.</li>
          <li><strong>Interés legítimo:</strong> para la prevención del fraude, la mejora de nuestros servicios y la atención al cliente fuera del estricto marco contractual.</li>
        </ul>

        <h2>5. Plazos de conservación</h2>
        <p>Conservamos tus datos durante los plazos que se indican a continuación:</p>
        <ul>
          <li><strong>Datos de cliente y pedidos:</strong> mientras se mantenga la relación comercial y, posteriormente, durante los plazos de prescripción legal aplicables.</li>
          <li><strong>Facturación y datos contables:</strong> 6 años, conforme al artículo 30 del Código de Comercio, y 4 años a efectos fiscales conforme a la Ley General Tributaria.</li>
          <li><strong>Medidas corporales y fichas de sastrería:</strong> mientras seas cliente activo, salvo que solicites su supresión, para permitir nuevos encargos sin tener que repetir el proceso de toma de medidas.</li>
          <li><strong>Datos de marketing:</strong> hasta que retires tu consentimiento.</li>
          <li><strong>Datos de navegación y cookies:</strong> según los plazos detallados en la <a href="/cookies">Política de Cookies</a>.</li>
        </ul>

        <h2>6. Destinatarios de los datos</h2>
        <p>
          Tus datos podrán ser comunicados a las siguientes categorías de destinatarios, siempre
          con las garantías contractuales y técnicas exigidas por la normativa:
        </p>
        <ul>
          <li><strong>Proveedores de pago:</strong> Stripe Payments Europe, Ltd. y Redsys Servicios de Procesamiento, S.L.</li>
          <li><strong>Empresas de transporte y mensajería</strong> para la entrega de pedidos.</li>
          <li><strong>Proveedores tecnológicos:</strong> Supabase (alojamiento de base de datos), Vercel (alojamiento web), Resend (envío de correos transaccionales) y Google (analítica y publicidad, si has dado tu consentimiento).</li>
          <li><strong>Asesores fiscales, contables y jurídicos</strong> sujetos a deber de secreto profesional.</li>
          <li><strong>Administraciones Públicas y Tribunales</strong> cuando exista obligación legal.</li>
          <li><strong>Talleres y oficiales colaboradores</strong> que intervienen en la confección de prendas a medida, limitadamente a los datos imprescindibles para la ejecución del encargo.</li>
        </ul>
        <p>No vendemos ni cedemos tus datos a terceros con fines publicitarios.</p>

        <h2>7. Transferencias internacionales</h2>
        <p>
          Algunos de nuestros proveedores tecnológicos pueden tratar datos fuera del Espacio
          Económico Europeo (por ejemplo, Stripe o Google). En esos casos, las transferencias se
          realizan al amparo de decisiones de adecuación de la Comisión Europea o mediante
          Cláusulas Contractuales Tipo que ofrecen un nivel de protección equivalente al exigido
          por el RGPD.
        </p>

        <h2>8. Derechos del usuario</h2>
        <p>Como titular de los datos, puedes ejercer en cualquier momento los siguientes derechos:</p>
        <ul>
          <li><strong>Acceso</strong> a los datos personales que tratamos sobre ti.</li>
          <li><strong>Rectificación</strong> de datos inexactos o incompletos.</li>
          <li><strong>Supresión</strong> de los datos cuando ya no sean necesarios.</li>
          <li><strong>Oposición</strong> al tratamiento por motivos relacionados con tu situación particular.</li>
          <li><strong>Limitación</strong> del tratamiento en los supuestos previstos por la ley.</li>
          <li><strong>Portabilidad</strong> de los datos en un formato estructurado y de uso común.</li>
          <li><strong>Retirada del consentimiento</strong> en cualquier momento, sin que ello afecte a la licitud del tratamiento previo.</li>
        </ul>
        <p>
          Puedes ejercer estos derechos enviando una solicitud, junto con copia de tu documento
          de identidad, al correo{' '}
          <a href="mailto:administracion@sastreriaprats.com">administracion@sastreriaprats.com</a>{' '}
          o por correo postal a la dirección indicada en el apartado 1.
        </p>
        <p>
          Si consideras que el tratamiento de tus datos no se ajusta a la normativa vigente,
          tienes derecho a presentar una reclamación ante la Agencia Española de Protección de
          Datos (AEPD), C/ Jorge Juan 6, 28001 Madrid —{' '}
          <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>.
        </p>

        <h2>9. Medidas de seguridad</h2>
        <p>
          Hemos implantado las medidas técnicas y organizativas adecuadas para garantizar la
          confidencialidad, integridad y disponibilidad de los datos, entre ellas:
        </p>
        <ul>
          <li>Cifrado en tránsito mediante TLS y cifrado en reposo de las bases de datos.</li>
          <li>Control de accesos basado en roles y autenticación reforzada para el personal.</li>
          <li>Registro y auditoría de accesos a datos sensibles.</li>
          <li>Copias de seguridad cifradas y plan de continuidad de negocio.</li>
          <li>Acuerdos de tratamiento con todos los encargados de tratamiento.</li>
        </ul>

        <h2>10. Menores de edad</h2>
        <p>
          El sitio web está dirigido a mayores de edad. No recogemos conscientemente datos de
          menores de 14 años sin el consentimiento de sus padres o tutores. Si detectas que se
          han facilitado datos de un menor sin autorización, contáctanos para proceder a su
          supresión.
        </p>

        <h2>11. Cambios en la política de privacidad</h2>
        <p>
          Sastrería Prats podrá actualizar esta política en cualquier momento para adaptarla a
          cambios normativos o a la evolución de nuestros servicios. La versión vigente será
          siempre la publicada en esta página, indicando la fecha de la última actualización.
        </p>
      </div>
    </div>
  )
}
