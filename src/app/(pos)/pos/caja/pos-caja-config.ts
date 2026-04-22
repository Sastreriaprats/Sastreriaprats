/**
 * Desde la introducción del StoreGate global en el layout POS, la tienda ya
 * viene confirmada al entrar aquí. El flujo "elegir tienda primero" dentro
 * de /pos/caja queda desactivado. La constante se mantiene para compatibilidad
 * con código que la consulte, pero no debe ponerse a true.
 */
export const POS_CHOOSE_STORE_FIRST = false
