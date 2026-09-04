/**
 * Fecha desde la que un arreglo sin cobrar cuenta como deuda del cliente.
 *
 * Un arreglo se considera pendiente cuando no tiene `sale_id` (no se cobró en
 * un ticket) ni `payment_method` (no se saldó a mano). El problema es que esos
 * dos campos NUNCA se han escrito: hasta ahora no existía forma de marcar un
 * arreglo como cobrado, así que TODO el histórico cumple la condición de
 * "pendiente" aunque en realidad se cobrara en su día.
 *
 * Sin este corte aparecían 12 arreglos y 1.060 € de deuda que no existe, en la
 * ficha del cliente, en el aviso del TPV y en Cobros pendientes.
 *
 * Los arreglos anteriores a esta fecha se dan por saldados y no generan deuda.
 * Los posteriores sí, porque ya se crean con la pantalla que permite marcarlos
 * como cobrados.
 *
 * AJUSTAR AL DÍA EN QUE ESTO ENTRE EN PRODUCCIÓN: si se despliega más tarde,
 * los arreglos creados entre esta fecha y el despliegue aparecerían como deuda
 * sin que nadie hubiera podido marcarlos como cobrados.
 */
export const ALTERATION_DEBT_SINCE = '2026-09-04'
