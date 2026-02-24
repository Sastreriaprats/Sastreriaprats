// ==========================================
// SASTRERÍA PRATS — Constants
// ==========================================

export const STORES = {
  PINZON: { code: 'PIN', name: 'Hernán Pinzón' },
  WELLINGTON: { code: 'WEL', name: 'Wellington' },
  CENTRAL: { code: 'CEN', name: 'Almacén Central' },
  ONLINE: { code: 'WEB', name: 'Tienda Online' },
} as const

export const ORDER_TYPES = {
  ARTESANAL: 'artesanal',
  INDUSTRIAL: 'industrial',
} as const

export const TAILORING_ORDER_STATES = [
  { key: 'created', label: 'Pedido Creado', color: '#94A3B8' },
  { key: 'fabric_ordered', label: 'Tejido Pedido', color: '#3B82F6' },
  { key: 'fabric_received', label: 'Tejido Recibido', color: '#8B5CF6' },
  { key: 'factory_ordered', label: 'Pedido a Fábrica/Oficial', color: '#F59E0B' },
  { key: 'in_production', label: 'En Confección', color: '#F97316' },
  { key: 'fitting_1', label: 'Prueba 1', color: '#EC4899' },
  { key: 'fitting_n', label: 'Prueba Adicional', color: '#EC4899' },
  { key: 'adjustments', label: 'Ajustes', color: '#A855F7' },
  { key: 'finished', label: 'Terminado', color: '#22C55E' },
  { key: 'delivered', label: 'Entregado', color: '#10B981' },
  { key: 'incident', label: 'Incidencia', color: '#EF4444' },
] as const

export const ONLINE_ORDER_STATES = [
  { key: 'received', label: 'Recibido', color: '#94A3B8' },
  { key: 'preparing', label: 'En Preparación', color: '#3B82F6' },
  { key: 'ready', label: 'Preparado', color: '#F59E0B' },
  { key: 'shipped', label: 'Enviado', color: '#8B5CF6' },
  { key: 'store_pickup', label: 'Recogida en Tienda', color: '#EC4899' },
  { key: 'delivered', label: 'Entregado', color: '#22C55E' },
  { key: 'returned', label: 'Devuelto', color: '#EF4444' },
] as const

export const PAYMENT_METHODS = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'card', label: 'Tarjeta' },
  { key: 'bizum', label: 'Bizum' },
  { key: 'transfer', label: 'Transferencia' },
  { key: 'voucher', label: 'Vale/Gift Card' },
  { key: 'mixed', label: 'Pago Mixto' },
] as const

export const GARMENT_TYPES = [
  { key: 'americana', label: 'Americana' },
  { key: 'chaleco', label: 'Chaleco' },
  { key: 'pantalon', label: 'Pantalón' },
  { key: 'camisa', label: 'Camisa' },
  { key: 'abrigo', label: 'Abrigo' },
  { key: 'chaquet', label: 'Chaqué' },
  { key: 'smoking', label: 'Smoking' },
  { key: 'bata', label: 'Bata' },
  { key: 'falda', label: 'Falda' },
  { key: 'industrial', label: 'Industrial' },
  { key: 'pijama', label: 'Pijama' },
] as const

export const MEASUREMENT_FIELDS = {
  camisa: ['cuello', 'pecho', 'cintura', 'cadera', 'hombro', 'canesu', 'largo_manga', 'largo_camisa', 'biceps', 'muneca_izquierda', 'muneca_derecha'],
  pantalon: ['cintura', 'cadera', 'largo', 'tiro', 'muslo', 'rodilla', 'bajo', 'vuelta', 'cremallera'],
  americana: ['pecho', 'cintura', 'cadera', 'largo', 'manga', 'hombro', 'espalda', 'encuentro', 'frente'],
  chaleco: ['pecho', 'cintura', 'cadera', 'largo', 'hombro', 'espalda'],
  abrigo: ['pecho', 'cintura', 'cadera', 'largo', 'manga', 'hombro', 'espalda'],
} as const

export const IVA_RATES = {
  GENERAL: 21,
  REDUCED: 10,
  SUPER_REDUCED: 4,
  EXEMPT: 0,
} as const

export const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'de', 'it'] as const
export const DEFAULT_LOCALE = 'es' as const

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export const BRAND = {
  name: 'Sastrería Prats',
  legalName: 'Sastrería Prats S.L.',
  domain: 'sastreriaprats.com',
  email: 'info@sastreriaprats.com',
  phone: '+34 XXX XXX XXX',
  colors: {
    navy: '#1B2A4A',
    orange: '#C4854C',
    beige: '#F5EFE7',
    gold: '#B8944F',
    white: '#FFFFFF',
  },
} as const
