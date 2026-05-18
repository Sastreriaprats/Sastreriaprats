/**
 * Genera miniaturas PNG para las plantillas de newsletter y las sube al
 * bucket de Supabase Storage. Ejecutable localmente:
 *
 *   npx playwright install chromium      # solo la primera vez
 *   npx tsx scripts/generate-newsletter-thumbnails.ts
 *
 * Requiere `playwright` instalado como devDependency. Si no está, el script
 * falla con un mensaje claro indicando el comando de instalación.
 *
 * Recorre todas las plantillas con code en NEWSLETTER_CODES, compone el HTML
 * con datos de ejemplo realistas, captura screenshot con viewport 600x800
 * y sube el PNG a `web-content/newsletter-thumbnails/{code}.png`. Después
 * actualiza email_templates.thumbnail_url.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { composeNewsletterEmail, type NewsletterContent } from '../src/lib/email/newsletter-render'

const NEWSLETTER_CODES = ['newsletter_default', 'newsletter_optin'] as const
const BUCKET = 'web-content'
const FOLDER = 'newsletter-thumbnails'
const VIEWPORT = { width: 600, height: 800 }

/** Placeholders externos (placehold.co). PENDIENTE: sustituir por imágenes
 *  neutras alojadas en /public/ o en el bucket para no depender de un
 *  tercero. Mientras tanto sirven para la miniatura. */
const PLACEHOLDER_HERO = 'https://placehold.co/600x400/eeeeee/333333.png?text=Hero+Image'
const PLACEHOLDER_PRODUCT_1 = 'https://placehold.co/300x300/dddddd/333333.png?text=Americana'
const PLACEHOLDER_PRODUCT_2 = 'https://placehold.co/300x300/dddddd/333333.png?text=Pantalon'
const PLACEHOLDER_PRODUCT_3 = 'https://placehold.co/300x300/dddddd/333333.png?text=Camisa'

const SAMPLE_CONTENT_DEFAULT: NewsletterContent = {
  hero_image_url: PLACEHOLDER_HERO,
  hero_image_alt: 'Modelo con traje',
  title_kicker: 'Colección Otoño-Invierno',
  title: 'Explora nuestra colección Otoño-Invierno',
  subtitle: 'Enfoque: Denim',
  description:
    'Texturas elegantes y cortes atemporales. Descubre las piezas más representativas de la temporada, confeccionadas a medida en nuestros talleres de Madrid.',
  products: [
    { id: '1', name: 'Americana de raya diplomática', image_url: PLACEHOLDER_PRODUCT_1, public_url: 'https://sastreriaprats.com/boutique/americana' },
    { id: '2', name: 'Pantalón de franela',           image_url: PLACEHOLDER_PRODUCT_2, public_url: 'https://sastreriaprats.com/boutique/pantalon' },
    { id: '3', name: 'Camisa Oxford blanca',          image_url: PLACEHOLDER_PRODUCT_3, public_url: 'https://sastreriaprats.com/boutique/camisa' },
  ],
  cta_text: 'VER TODOS LOS ARTÍCULOS',
  cta_url: 'https://sastreriaprats.com/boutique',
}

const SAMPLE_CONTENT_OPTIN: NewsletterContent = {
  hero_image_url: PLACEHOLDER_HERO,
}

const PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com'
const SAMPLE_URLS = {
  unsubscribeUrl: `${PUBLIC_URL}/newsletter/baja?token=preview`,
  confirmationUrl: `${PUBLIC_URL}/newsletter/confirmar?token=preview`,
  publicSiteUrl: PUBLIC_URL,
}
const SAMPLE_RECIPIENT = { first_name: 'Carlos', full_name: 'Carlos Ejemplo', email: 'preview@sastreriaprats.com' }

interface ChromiumLike {
  launch(): Promise<{
    newContext(opts: { viewport: { width: number; height: number } }): Promise<{
      newPage(): Promise<{
        setContent(html: string, opts: { waitUntil: string; timeout: number }): Promise<void>
        screenshot(opts: { type: 'png'; fullPage: boolean }): Promise<Buffer>
        close(): Promise<void>
      }>
    }>
    close(): Promise<void>
  }>
}

async function main() {
  let chromium: ChromiumLike
  try {
    // Import dinámico: playwright es devDep opcional. Si no está, fallamos
    // con mensaje claro de instalación. Usamos @ts-ignore (no expect-error)
    // para tolerar tanto el caso de que esté instalado (sin error) como el
    // de que no lo esté (con error).
    // @ts-ignore - módulo opcional, puede no estar instalado
    const mod = await import('playwright')
    chromium = mod.chromium as ChromiumLike
  } catch {
    console.error('\n❌ Falta la dependencia `playwright`.')
    console.error('   Instala con:  npm install -D playwright')
    console.error('   Y los binarios: npx playwright install chromium\n')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }
  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

  // Verificación: la columna thumbnail_url existe (mig 149 aplicada).
  const { error: probeError } = await sb.from('email_templates').select('thumbnail_url').limit(1)
  if (probeError?.message?.toLowerCase().includes('thumbnail_url')) {
    console.error('❌ La columna email_templates.thumbnail_url no existe.')
    console.error('   Aplica primero la migración 149_email_templates_thumbnail.sql en Supabase Dashboard.')
    process.exit(1)
  }

  console.log('Lanzando Chromium headless…')
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: VIEWPORT })

  for (const code of NEWSLETTER_CODES) {
    console.log(`\n=== ${code} ===`)
    const { data: template, error } = await sb
      .from('email_templates')
      .select('code, body_html_es')
      .eq('code', code)
      .maybeSingle()

    if (error || !template) {
      console.warn(`  ⚠️  Plantilla no encontrada en BBDD. Salto.`)
      continue
    }

    const isOptin = code === 'newsletter_optin'
    const content = isOptin ? SAMPLE_CONTENT_OPTIN : SAMPLE_CONTENT_DEFAULT

    let html: string
    try {
      html = composeNewsletterEmail({
        template: { code: template.code, body_html_es: template.body_html_es },
        content,
        recipient: SAMPLE_RECIPIENT,
        urls: SAMPLE_URLS,
        subject: 'Vista previa de plantilla',
      })
    } catch (e) {
      console.warn(`  ⚠️  composeNewsletterEmail falló:`, e)
      continue
    }

    let pngBuffer: Buffer
    try {
      const page = await context.newPage()
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 15_000 })
      pngBuffer = await page.screenshot({ type: 'png', fullPage: false })
      await page.close()
    } catch (e) {
      console.warn(`  ⚠️  Screenshot falló:`, e)
      continue
    }

    const path = `${FOLDER}/${code}.png`
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, pngBuffer, {
      contentType: 'image/png',
      upsert: true,
    })
    if (uploadError) {
      console.warn(`  ⚠️  Upload falló:`, uploadError.message)
      continue
    }

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
    const thumbnailUrl = pub.publicUrl

    const { error: updateError } = await sb
      .from('email_templates')
      .update({ thumbnail_url: thumbnailUrl, updated_at: new Date().toISOString() })
      .eq('code', code)

    if (updateError) {
      console.warn(`  ⚠️  Update de thumbnail_url falló:`, updateError.message)
      continue
    }

    console.log(`  ✓ ${pngBuffer.length} bytes  →  ${thumbnailUrl}`)
  }

  await browser.close()
  console.log('\n✓ Hecho.')
}

main().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
