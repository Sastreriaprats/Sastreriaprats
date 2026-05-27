// ==========================================
// SASTRERÍA PRATS — Constants
// ==========================================

export const STORES = {
  PINZON: { code: 'PIN', name: 'Hermanos Pinzón' },
  WELLINGTON: { code: 'WEL', name: 'Wellington' },
  CENTRAL: { code: 'CEN', name: 'Almacén Central' },
  ONLINE: { code: 'WEB', name: 'Tienda Online' },
} as const

export const ORDER_TYPES = {
  ARTESANAL: 'artesanal',
  INDUSTRIAL: 'industrial',
} as const

export const TAILORING_ORDER_STATES = [
  { key: 'created', label: 'Creado', color: '#94A3B8' },
  { key: 'fabric_ordered', label: 'Tejido pedido a fabricante', color: '#3B82F6' },
  { key: 'fabric_received_store', label: 'Tejido recibido en tienda', color: '#0EA5E9' },
  { key: 'fabric_received_factory', label: 'Tejido recibido en fábrica', color: '#06B6D4' },
  { key: 'cut', label: 'Cortado', color: '#EAB308' },
  { key: 'in_production', label: 'En confección', color: '#F59E0B' },
  { key: 'in_fitting', label: 'En prueba', color: '#A855F7' },
  { key: 'received_in_store', label: 'Recibido en tienda', color: '#14B8A6' },
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
  { key: 'chaque', label: 'Chaqué' },
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
  legalName: 'Prats Eugercios y González, S.L.',
  cif: 'B88391834',
  fiscalAddress: 'Calle Hermanos Pinzón, 4 - 28036 Madrid',
  adminEmail: 'administracion@sastreriaprats.com',
  domain: 'sastreriaprats.com',
  email: 'info@sastreriaprats.com',
  phone: '+34 669 98 55 47',
  colors: {
    navy: '#1B2A4A',
    orange: '#C4854C',
    beige: '#F5EFE7',
    gold: '#B8944F',
    white: '#FFFFFF',
  },
} as const

/**
 * Configuración del popup de newsletter — editar aquí para cambiar el contenido.
 * Para hacerlo editable desde el admin, mover a cms_sections (sección "newsletter_popup").
 */
export const NEWSLETTER_POPUP = {
  enabled: true,
  delaySeconds: 8,
  imageUrl: '/images/logo-prats-hd.webp', // Imagen lateral (logo o foto)
  title: 'Únete a la familia Prats',
  subtitle: 'Sé el primero en conocer nuestras nuevas colecciones, eventos exclusivos y consejos de estilo.',
  buttonText: 'Suscribirse',
  disclaimer: 'Puedes darte de baja en cualquier momento. Sin spam, lo prometemos.',
} as const

export const STORE_LOCATIONS = {
  pinzon: {
    name: 'Hermanos Pinzón',
    address: 'Calle Hermanos Pinzón, 4',
    postalCode: '28036',
    city: 'Madrid',
    fullAddress: 'Calle Hermanos Pinzón, 4 - 28036 Madrid',
    phones: ['+34 912 401 845', '+34 669 98 55 47'],
    hours: { weekdays: '10:00 – 20:00', saturday: '10:00 – 14:00', sunday: 'Cerrado' },
    mapsUrl: 'https://maps.app.goo.gl/Vf8puqTToyqvTirq5',
  },
  wellington: {
    name: 'Wellington',
    subtitle: 'Wellington Hotel & Spa',
    address: 'Calle Velázquez, 8',
    postalCode: '28001',
    city: 'Madrid',
    fullAddress: 'Calle Velázquez, 8 - 28001 Madrid',
    phones: ['+34 671 35 34 65'],
    hours: { weekdays: '10:00 – 14:00 | 16:30 – 20:30', saturday: '10:00 – 14:00', sunday: 'Cerrado' },
    mapsUrl: 'https://maps.app.goo.gl/Cd36bN32ctpTmtub8',
  },
} as const

export const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/sastreriaprats/',
  facebook: 'https://www.facebook.com/sastreriafprats/',
  tiktok: 'https://www.tiktok.com/@sastreriaprats',
  linkedin: 'https://www.linkedin.com/company/sastreria-prats/',
  youtube: 'https://www.youtube.com/@Sastrer%C3%ADaPrats',
  email: 'mailto:info@sastreriaprats.com',
} as const
