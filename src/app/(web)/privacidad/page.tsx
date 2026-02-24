import { buildMetadata } from '@/lib/seo/metadata'

export const metadata = buildMetadata({
  title: 'Política de Privacidad — Sastrería Prats',
  description: 'Política de privacidad de Sastrería Prats.',
  path: '/privacidad',
  noindex: true,
})

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-prats-navy mb-8">Política de Privacidad</h1>
      <div className="prose prose-gray max-w-none prose-headings:text-prats-navy prose-a:text-prats-gold">
        <p><strong>Última actualización:</strong> Febrero 2026</p>

        <h2>1. Responsable del tratamiento</h2>
        <p>
          Sastrería Prats, S.L. (en adelante, &quot;Prats&quot;), con CIF B-12345678 y domicilio en
          Calle de Serrano 82, 28006 Madrid, es el responsable del tratamiento de los datos personales del usuario.
        </p>
        <p>Email de contacto: <a href="mailto:privacidad@sastreriaprats.com">privacidad@sastreriaprats.com</a></p>

        <h2>2. Datos que recogemos</h2>
        <p>Recogemos los siguientes datos personales:</p>
        <ul>
          <li>Datos de identificación (nombre, apellidos, email, teléfono)</li>
          <li>Datos de navegación (IP, cookies, dispositivo)</li>
          <li>Datos de compra (historial de pedidos, dirección de envío, datos de pago — procesados por Stripe/Redsys, nunca almacenamos datos de tarjeta)</li>
          <li>Medidas corporales (tomadas presencialmente con consentimiento explícito)</li>
          <li>Preferencias de estilo</li>
        </ul>

        <h2>3. Finalidad del tratamiento</h2>
        <p>Tratamos los datos para:</p>
        <ul>
          <li>Gestión de pedidos y entregas</li>
          <li>Prestación del servicio de sastrería a medida</li>
          <li>Comunicaciones comerciales (con consentimiento)</li>
          <li>Mejora del servicio mediante análisis agregado</li>
          <li>Cumplimiento de obligaciones legales y fiscales</li>
        </ul>

        <h2>4. Base legal</h2>
        <p>El tratamiento se basa en:</p>
        <ul>
          <li>Ejecución del contrato (pedidos y servicios)</li>
          <li>Consentimiento (comunicaciones comerciales y cookies)</li>
          <li>Interés legítimo (análisis y mejora del servicio)</li>
          <li>Obligación legal (facturas y contabilidad)</li>
        </ul>

        <h2>5. Destinatarios</h2>
        <p>
          Compartimos datos con: proveedores de pago (Stripe, Redsys), empresas de transporte (para envíos),
          proveedores tecnológicos (Supabase, Vercel, Resend), asesores fiscales y legales.
          No vendemos ni cedemos datos a terceros con fines comerciales.
        </p>

        <h2>6. Derechos del usuario</h2>
        <p>
          Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, portabilidad
          y oposición enviando un email a{' '}
          <a href="mailto:privacidad@sastreriaprats.com">privacidad@sastreriaprats.com</a>.
          También tiene derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD).
        </p>

        <h2>7. Conservación</h2>
        <p>
          Conservamos los datos durante la relación comercial y los plazos legales aplicables
          (facturas: 6 años según Código de Comercio). Los datos de medidas se conservan mientras el cliente sea activo.
        </p>

        <h2>8. Seguridad</h2>
        <p>Implementamos medidas técnicas y organizativas adecuadas:</p>
        <ul>
          <li>Cifrado TLS en tránsito</li>
          <li>Cifrado en reposo</li>
          <li>Control de acceso basado en roles</li>
          <li>Auditoría de accesos</li>
          <li>Copias de seguridad diarias</li>
        </ul>

        <h2>9. Transferencias internacionales</h2>
        <p>
          Algunos proveedores pueden procesar datos fuera del EEE. En esos casos, se garantizan
          las salvaguardas adecuadas mediante cláusulas contractuales tipo o decisiones de adecuación
          de la Comisión Europea.
        </p>
      </div>
    </div>
  )
}
