import { WebHeader } from '@/components/web/header'
import { WebFooter } from '@/components/web/footer'
import { LocalBusinessSchema } from '@/components/public/structured-data'
import { CartProvider } from '@/components/providers/cart-provider'
import { ConsentProvider } from '@/components/providers/consent-provider'
import { CookieBanner } from '@/components/legal/cookie-banner'
import { GoogleAnalytics } from '@/components/analytics/google-analytics'
import { OrganizationSchema, WebSiteSchema } from '@/components/seo/schema-org'

export default function WebLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ConsentProvider>
      <GoogleAnalytics />
      <OrganizationSchema />
      <WebSiteSchema />
      <CartProvider>
        <div className="flex min-h-screen flex-col">
          <LocalBusinessSchema />
          <WebHeader />
          <main className="flex-1">
            {children}
          </main>
          <WebFooter />
          <CookieBanner />
        </div>
      </CartProvider>
    </ConsentProvider>
  )
}
