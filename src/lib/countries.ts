// Lista ISO 3166-1 alpha-2 de países (códigos oficiales asignados).
// Los nombres se resuelven en runtime con Intl.DisplayNames (locale del visitante),
// así no mantenemos un diccionario de nombres a mano.
export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AR', 'AT', 'AU', 'AW', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BM', 'BN', 'BO', 'BR',
  'BS', 'BT', 'BW', 'BY', 'BZ', 'CA', 'CD', 'CF', 'CG', 'CH', 'CI', 'CL', 'CM',
  'CN', 'CO', 'CR', 'CU', 'CV', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FM', 'FR', 'GA', 'GB', 'GD',
  'GE', 'GH', 'GI', 'GM', 'GN', 'GQ', 'GR', 'GT', 'GW', 'GY', 'HK', 'HN', 'HR',
  'HT', 'HU', 'ID', 'IE', 'IL', 'IN', 'IQ', 'IR', 'IS', 'IT', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB',
  'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME',
  'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MR', 'MT', 'MU', 'MV', 'MW', 'MX',
  'MY', 'MZ', 'NA', 'NE', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NZ', 'OM', 'PA',
  'PE', 'PG', 'PH', 'PK', 'PL', 'PR', 'PT', 'PW', 'PY', 'QA', 'RO', 'RS', 'RU',
  'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SI', 'SK', 'SL', 'SM', 'SN', 'SO',
  'SR', 'SS', 'ST', 'SV', 'SY', 'SZ', 'TD', 'TG', 'TH', 'TJ', 'TL', 'TM', 'TN',
  'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'US', 'UY', 'UZ', 'VA', 'VC',
  'VE', 'VN', 'VU', 'WS', 'YE', 'ZA', 'ZM', 'ZW',
]

export function countryName(code: string, locale = 'es'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

const strip = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

let nameIndex: Map<string, string> | null = null

/**
 * Normaliza a ISO-2 un valor de país que puede venir en texto libre
 * (clients.country guarda cosas como "España", "VENEZUELA", " SUIZA").
 * Acepta el código ISO o el nombre en español/inglés (sin acentos, sin
 * mayúsculas). Devuelve null si no se reconoce.
 */
export function toCountryCode(value: string | null | undefined): string | null {
  if (!value) return null
  const upper = value.trim().toUpperCase()
  if (COUNTRY_CODES.includes(upper)) return upper
  if (!nameIndex) {
    nameIndex = new Map()
    for (const locale of ['es', 'en']) {
      for (const code of COUNTRY_CODES) {
        nameIndex.set(strip(countryName(code, locale)), code)
      }
    }
  }
  return nameIndex.get(strip(value)) ?? null
}

/** Ordena códigos por nombre localizado (para selectores). */
export function sortByCountryName(codes: string[], locale = 'es'): string[] {
  const collator = new Intl.Collator(locale)
  return [...codes].sort((a, b) => collator.compare(countryName(a, locale), countryName(b, locale)))
}
