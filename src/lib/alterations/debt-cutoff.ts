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
 * Se pone el día SIGUIENTE al despliegue (4-sep-2026 a las 22:00), no el mismo
 * día: los arreglos creados durante la jornada del despliegue se cobraron sin
 * que el personal tuviera todavía la pantalla para marcarlos, así que contarlos
 * como deuda sería inventar deuda. Cuentan desde el primer día completo con la
 * función disponible.
 *
 * AJUSTAR SI EL DESPLIEGUE SE MUEVE DE FECHA.
 */
export const ALTERATION_DEBT_SINCE = '2026-09-05'
