import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ClientSidebar } from '@/components/client/client-sidebar'
import { WebHeader } from '@/components/web/header'
import { WebFooter } from '@/components/web/footer'
import { CartProvider } from '@/components/providers/cart-provider'

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?mode=client&redirectTo=/mi-cuenta')
  }

  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col">
        <WebHeader />
        <main className="flex-1 bg-gray-50/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid gap-8 lg:grid-cols-4">
              <div className="lg:col-span-1">
                <ClientSidebar />
              </div>
              <div className="lg:col-span-3">{children}</div>
            </div>
          </div>
        </main>
        <WebFooter />
      </div>
    </CartProvider>
  )
}
