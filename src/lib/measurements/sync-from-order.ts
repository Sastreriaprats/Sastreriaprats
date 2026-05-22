/**
 * Sincroniza las medidas/configuración de una línea de pedido sastrería
 * (tailoring_order_lines.configuration) hacia client_measurements del cliente,
 * creando una nueva versión si cambian las claves del subset del garment.
 *
 * Mapeo de destino:
 *  - garment_type 'camiseria' → registro propio (garment_type=camiseria),
 *    claves SIN prefijo (cuello, largo_manga, frente_pecho, pecho, …).
 *  - garment_type 'americana' / 'pantalon' / 'chaleco' / 'frac' / 'abrigo' /
 *    'levita' → registro 'body' (garment_type=body), claves con prefijo
 *    `<code>_` (americana_pecho, pantalon_largo, americana_confF, …).
 *
 * Para resolver el valor de cada measurement_field dentro de configuration
 * se prueban en orden:
 *   1) match exacto por field.code
 *   2) versión camelCase del field.code (largo_manga → largoManga)
 *   3) fallbacks legacy conocidos (manga, frenPecho, contPecho, largo, …)
 *
 * Las claves de OTRAS prendas en el registro 'body' se preservan (merge):
 * solo se actualiza el subset con prefijo de esta prenda.
 */

import type { AdminClient } from '@/lib/server/action-wrapper'

const BODY_PREFIXED_CODES = new Set([
  'americana', 'pantalon', 'chaleco', 'frac', 'abrigo', 'levita',
])

/** Códigos de garment_type que sincronizamos. El resto (complemento, boutique…) se ignora. */
const SUPPORTED_CODES = new Set<string>([...BODY_PREFIXED_CODES, 'camiseria'])

/** Convierte snake_case a camelCase. 'largo_manga' → 'largoManga'. */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())
}

/**
 * Fallbacks legacy: claves antiguas que el dialog del pedido aún pudiera escribir
 * (o que existieron antes de la mig.072 de camisería).
 * Indexado por measurement_field.code → posibles claves en configuration.
 */
const FALLBACKS: Record<string, string[]> = {
  // Camisería: renombrados en mig.072
  largo_manga:      ['manga'],
  frente_pecho:     ['frenPecho', 'fren_pecho'],
  pecho:            ['contPecho', 'cont_pecho'],
  largo_cuerpo:     ['largo'],
  // En el dialog el texto de iniciales está en inicialesTexto, no en iniciales (que es el bool)
  iniciales:        ['inicialesTexto'],
  // Características de camisería (camelCase ya cubierto por snakeToCamel, pero los listamos por claridad)
  hombro_caido:     ['hombroCaido'],
  hombros_altos:    ['hombrosAltos'],
  hombros_bajos:    ['hombrosBajos'],
  espalda_lisa:     ['espaldaLisa'],
  esp_pliegues:     ['espPliegues'],
  esp_tablon_centr: ['espTablonCentr'],
  esp_pinzas:       ['espPinzas'],
  mod_cuello:       ['modCuello'],
}

interface MeasurementField {
  code: string
  field_type: string
}

/** Devuelve el primer valor no vacío de configuration entre las claves candidatas. */
function pickValue(config: Record<string, unknown>, field: MeasurementField): unknown {
  const candidates = [
    field.code,
    snakeToCamel(field.code),
    ...(FALLBACKS[field.code] ?? []),
  ]
  for (const k of candidates) {
    if (!(k in config)) continue
    const v = config[k]
    if (v === undefined || v === null) continue
    // Booleano: solo nos interesa si está marcado a true (los false los tratamos como ausencia)
    // De este modo no pisamos valores existentes del cliente con un "false" implícito del dialog.
    if (typeof v === 'boolean') {
      if (v) return v
      continue
    }
    if (typeof v === 'string' && v.trim() === '') continue
    return v
  }
  return undefined
}

interface SyncInput {
  clientId: string
  lineGarmentTypeId: string
  configuration: Record<string, unknown> | null | undefined
  userId: string | null
}

/**
 * Sincroniza una línea hacia client_measurements. No lanza: errores se loguean.
 * Idempotente: si los valores extraídos coinciden con la versión actual, no crea
 * una nueva versión.
 */
export async function syncOrderLineMeasurementsToClient(
  admin: AdminClient,
  { clientId, lineGarmentTypeId, configuration, userId }: SyncInput,
): Promise<void> {
  if (!clientId || !lineGarmentTypeId) return
  const config = (configuration ?? {}) as Record<string, unknown>
  if (Object.keys(config).length === 0) return

  try {
    // 1. Cargar info del garment_type de la línea
    const { data: gt } = await admin
      .from('garment_types')
      .select('id, code')
      .eq('id', lineGarmentTypeId)
      .single()
    if (!gt) return
    const code = String((gt as { code?: string | null }).code ?? '').toLowerCase()
    if (!SUPPORTED_CODES.has(code)) return

    // 2. Determinar destino (registro propio o body con prefijo)
    let destGarmentTypeId: string
    let prefix: string
    if (code === 'camiseria') {
      destGarmentTypeId = String((gt as { id: string }).id)
      prefix = ''
    } else {
      const { data: bodyGT } = await admin
        .from('garment_types')
        .select('id')
        .eq('code', 'body')
        .maybeSingle()
      if (!bodyGT) {
        console.warn('[syncOrderLineMeasurementsToClient] garment_type "body" no existe')
        return
      }
      destGarmentTypeId = String((bodyGT as { id: string }).id)
      prefix = `${code}_`
    }

    // 3. Cargar measurement_fields activos del garment_type de la línea
    const { data: fields } = await admin
      .from('measurement_fields')
      .select('code, field_type')
      .eq('garment_type_id', lineGarmentTypeId)
      .eq('is_active', true)
    if (!fields || fields.length === 0) return

    // 4. Extraer valores presentes en configuration
    const subValues: Record<string, string> = {}
    for (const field of fields as MeasurementField[]) {
      const raw = pickValue(config, field)
      if (raw === undefined) continue
      let value: string
      if (field.field_type === 'boolean') {
        value = raw === true || raw === 'true' ? 'true' : ''
        if (value === '') continue
      } else {
        value = String(raw)
        if (value.trim() === '') continue
      }
      subValues[`${prefix}${field.code}`] = value
    }
    if (Object.keys(subValues).length === 0) return

    // 5. Cargar registro current del destino
    const { data: current } = await admin
      .from('client_measurements')
      .select('id, values, version')
      .eq('client_id', clientId)
      .eq('garment_type_id', destGarmentTypeId)
      .eq('is_current', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const currentValues = ((current?.values ?? {}) as Record<string, unknown>) || {}

    // 6. Detectar cambio real respecto a las claves del subset
    let changed = false
    for (const [k, v] of Object.entries(subValues)) {
      if (String(currentValues[k] ?? '') !== String(v ?? '')) {
        changed = true
        break
      }
    }
    if (!changed) return

    // 7. Merge preservando otras prendas del registro body
    const mergedValues = { ...currentValues, ...subValues }

    // 8. Desactivar versión actual y crear una nueva
    const { error: updErr } = await admin
      .from('client_measurements')
      .update({ is_current: false })
      .eq('client_id', clientId)
      .eq('garment_type_id', destGarmentTypeId)
    if (updErr) {
      console.error('[syncOrderLineMeasurementsToClient] update is_current=false:', updErr)
      return
    }

    const { data: last } = await admin
      .from('client_measurements')
      .select('version')
      .eq('client_id', clientId)
      .eq('garment_type_id', destGarmentTypeId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextVersion = ((last as { version?: number } | null)?.version ?? 0) + 1

    const { error: insErr } = await admin
      .from('client_measurements')
      .insert({
        client_id: clientId,
        garment_type_id: destGarmentTypeId,
        measurement_type: 'artesanal',
        values: mergedValues,
        is_current: true,
        version: nextVersion,
        taken_at: new Date().toISOString(),
        taken_by: userId,
      })
    if (insErr) {
      console.error('[syncOrderLineMeasurementsToClient] insert new version:', insErr)
    }
  } catch (err) {
    console.error('[syncOrderLineMeasurementsToClient] unexpected:', err)
  }
}
