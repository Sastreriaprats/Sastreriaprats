/**
 * Saludo formal de email según el tratamiento del cliente (clients.salutation).
 *
 * Con tratamiento devuelve prefijo personalizado + apellido
 * ("Estimado Sr." / "García"); sin él, greeting null para que la plantilla
 * use su saludo por defecto ("Estimado/a", "Hola"…) con el nombre completo.
 * El resultado alimenta las variables {{greeting}} y {{client_name}} de las
 * plantillas transaccionales.
 */
export function formalGreeting(client: {
  salutation?: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
}): { greeting: string | null; name: string } {
  const last = (client.last_name ?? '').trim()
  const full = (client.full_name ?? '').trim()
    || [client.first_name, client.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
  if (client.salutation === 'sr' && (last || full)) {
    return { greeting: 'Estimado Sr.', name: last || full }
  }
  if (client.salutation === 'sra' && (last || full)) {
    return { greeting: 'Estimada Sra.', name: last || full }
  }
  return { greeting: null, name: full || 'cliente' }
}
