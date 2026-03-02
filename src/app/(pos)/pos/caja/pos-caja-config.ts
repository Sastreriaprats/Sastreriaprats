/**
 * Flujo de entrada a la caja:
 * - true:  Al entrar en /pos/caja primero se elige tienda ("¿En qué tienda quieres trabajar la caja?").
 *          Luego se abre caja o se entra si ya está abierta.
 * - false: Comportamiento anterior: se usa la tienda activa (localStorage/perfil) y se va directo
 *          a abrir caja o a la pantalla de ventas.
 *
 * Para volver al comportamiento anterior, cambiar a false.
 */
export const POS_CHOOSE_STORE_FIRST = true
