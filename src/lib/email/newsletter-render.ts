/**
 * Renderizado server-side de bloques HTML para emails de newsletter.
 * Compone el HTML final tomando la plantilla (con placeholders `{{var}}`)
 * y rellenando las variables especiales `products_grid_html` y `cta_html`
 * con HTML ya montado, porque el motor `renderTemplate` (src/lib/email/send.ts)
 * es replace plano y no soporta {{#if}} ni {{#each}}.
 *
 * Todo el HTML es email-safe: tablas anidadas, estilos inline, sin flexbox,
 * sin grid, sin pseudoclases, sin @media (que Gmail descarta).
 */
import { renderTemplate } from '@/lib/email/send'

/* ── Tipos ──────────────────────────────────────────────────────────────── */

export interface NewsletterProduct {
  id: string
  name: string
  image_url: string
  public_url: string
}

export interface NewsletterContent {
  hero_image_url?: string
  hero_image_alt?: string
  /** Línea pequeña en bold encima del subtítulo (estilo NEWS_1: "Colección Otoño-Invierno"). */
  title_kicker?: string
  title?: string
  subtitle?: string
  description?: string
  products?: NewsletterProduct[]
  cta_text?: string
  cta_url?: string
}

export interface NewsletterRecipient {
  first_name?: string | null
  full_name?: string | null
  email?: string | null
}

export interface NewsletterTemplate {
  code?: string | null
  body_html_es?: string | null
  /** Defaults editables sin código por plantilla (mig 152/153). */
  editable_fields?: Record<string, string> | null
}

export interface NewsletterUrls {
  /** Para campañas no-optin: enlace de baja con token. */
  unsubscribeUrl?: string
  /** Para campañas optin_invitation: enlace de confirmación con token. */
  confirmationUrl?: string
  publicSiteUrl: string
}

/* ── Helpers de escape ──────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape para usar dentro de atributos href / src. Mantiene caracteres
 *  legítimos de URLs pero escapa los problemáticos para HTML. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/* ── Renderers ──────────────────────────────────────────────────────────── */

/**
 * Grid de productos al estilo NEWS_1.
 *   0 productos → '' (placeholder vacío)
 *   1 producto  → 1 columna centrada, imagen 200×200
 *   2 productos → 2 columnas 48%, imagen 160×160
 *   3 productos → 3 columnas 33%, imagen 160×160
 * Cada celda: imagen cuadrada cover + nombre debajo. Sin precio (NEWS_1 no
 * lo muestra). Enlace target=_blank al public_url.
 */
export function renderProductGrid(products: NewsletterProduct[] | undefined | null): string {
  if (!products || products.length === 0) return ''
  const items = products.slice(0, 3)
  const n = items.length

  const colWidth = n === 1 ? '100%' : n === 2 ? '48%' : '33%'
  const imgSize = n === 1 ? 200 : 160

  const cells = items.map((p) => {
    const href = escapeAttr(p.public_url || '#')
    const src = escapeAttr(p.image_url || '')
    const name = escapeHtml(p.name || '')
    return `<td width="${colWidth}" valign="top" align="center" style="padding:0 6px;">
  <a href="${href}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;">
    <img src="${src}" alt="${name}" width="${imgSize}" height="${imgSize}" style="display:block;width:100%;max-width:${imgSize}px;height:auto;object-fit:cover;margin:0 auto;border:0;outline:none;text-decoration:none;">
    <p style="margin:8px 0 0;font-size:12px;color:#333333;text-align:center;line-height:1.4;">${name}</p>
  </a>
</td>`
  }).join('')

  return `<tr><td align="center" style="padding:8px 24px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr>${cells}</tr>
  </table>
</td></tr>`
}

/**
 * Botón CTA estilo NEWS_1: borde fino #333, padding 14px 32px, texto en
 * mayúsculas con letter-spacing. Si text o url están vacíos → ''.
 */
export function renderCtaButton(text: string | undefined | null, url: string | undefined | null): string {
  const t = (text || '').trim()
  const u = (url || '').trim()
  if (!t || !u) return ''
  const safeText = escapeHtml(t)
  const safeUrl = escapeAttr(u)
  return `<tr><td align="center" style="padding:8px 16px 32px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
      <a href="${safeUrl}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">${safeText}</a>
    </td></tr>
  </table>
</td></tr>`
}

/* ── Resolución de nombre del destinatario ──────────────────────────────── */

function resolveFirstName(r: NewsletterRecipient): string {
  const first = (r.first_name || '').trim()
  if (first) return first
  const full = (r.full_name || '').trim()
  if (full) {
    const part = full.split(/\s+/)[0]
    if (part) return part
  }
  return 'cliente'
}

/* ── Composición principal ──────────────────────────────────────────────── */

export interface ComposeOpts {
  template: NewsletterTemplate
  content?: NewsletterContent | null
  recipient: NewsletterRecipient
  urls: NewsletterUrls
  /** Asunto de la campaña (se interpola por si la plantilla usa {{subject}}). */
  subject?: string
}

/**
 * Compone el HTML final del email. Lógica según `template.code`:
 *  - 'newsletter_default': interpola todas las variables (hero, texto,
 *    products_grid_html precompilado, cta_html precompilado, unsubscribe_url).
 *  - 'newsletter_optin':   interpola hero + confirmation_url + first_name.
 *  - cualquier otro code:  fallback que interpola las variables básicas
 *    (client_name, client_email, first_name, last_name) sobre body_html_es,
 *    igual que el envío legacy. No rompe para plantillas pre-existentes.
 */
export function composeNewsletterEmail(opts: ComposeOpts): string {
  const { template, content, recipient, urls, subject } = opts
  const body = template.body_html_es || ''
  const code = template.code || ''
  const firstName = resolveFirstName(recipient)
  const clientEmail = (recipient.email || '').trim()

  const logoUrl = `${(urls.publicSiteUrl || '').replace(/\/+$/, '')}/logo-prats.png`

  if (code === 'newsletter_default') {
    const c: NewsletterContent = content || {}
    const productsHtml = renderProductGrid(c.products)
    const ctaHtml = renderCtaButton(c.cta_text, c.cta_url)
    return renderTemplate(body, {
      subject: subject || '',
      logo_url: logoUrl,
      hero_image_url: c.hero_image_url || '',
      hero_image_alt: c.hero_image_alt || '',
      title_kicker: c.title_kicker || '',
      title: c.title || '',
      subtitle: c.subtitle || '',
      description: c.description || '',
      products_grid_html: productsHtml,
      cta_html: ctaHtml,
      cta_text: c.cta_text || '',
      cta_url: c.cta_url || '',
      first_name: firstName,
      client_email: clientEmail,
      unsubscribe_url: urls.unsubscribeUrl || '',
    })
  }

  if (code === 'newsletter_optin') {
    const c: NewsletterContent = content || {}
    const ef = (template.editable_fields || {}) as Record<string, string>

    // Pre-resolver {{first_name}} dentro del cuerpo del opt-in (única
    // variable dinámica que el admin puede mencionar dentro del texto).
    // El nombre se sustituye SIN escapar aquí: el escape se aplica más
    // abajo al construir cada <p> sobre el bloque entero, así evitamos
    // doble escape.
    const optinBodyRaw = String(ef.optin_body ?? '')
    const optinBodyWithName = optinBodyRaw.replace(/\{\{first_name\}\}/g, firstName)

    // Convertir saltos de línea a párrafos HTML (cada bloque separado por
    // línea en blanco doble queda como un <p>). Los \n simples dentro de
    // un mismo párrafo se convierten en <br>.
    const optinBodyHtml = optinBodyWithName
      .split(/\n{2,}/)
      .map(block => block.trim())
      .filter(Boolean)
      .map(block => `<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#555555;">${
        escapeHtml(block).replace(/\n/g, '<br>')
      }</p>`)
      .join('')

    return renderTemplate(body, {
      logo_url: logoUrl,
      hero_image_url: c.hero_image_url || '',
      first_name: firstName,
      confirmation_url: urls.confirmationUrl || '',
      client_email: clientEmail,
      optin_title_kicker: ef.optin_title_kicker ?? '',
      optin_title: ef.optin_title ?? '',
      optin_body: optinBodyWithName,
      optin_body_html: optinBodyHtml,
      optin_cta_text: ef.optin_cta_text ?? 'SÍ, QUIERO SUSCRIBIRME',
      optin_footer_note: ef.optin_footer_note ?? '',
    })
  }

  // Fallback legacy: misma sustitución básica que hacía sendCampaign antes.
  return renderTemplate(body, {
    client_name: (recipient.full_name as string) || firstName || 'Cliente',
    client_email: clientEmail,
    first_name: firstName,
    last_name: '',
  })
}
