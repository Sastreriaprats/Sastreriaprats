import { VendedorLayoutClient } from '@/components/layout/vendedor-layout-client'

export default function VendedorAreaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <VendedorLayoutClient>{children}</VendedorLayoutClient>
}
