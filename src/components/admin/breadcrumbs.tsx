'use client'
import { ReactNode } from 'react'
export function Breadcrumbs({ children }: { children?: ReactNode }) {
  return <nav className="flex items-center gap-2 text-sm text-muted-foreground">{children}</nav>
}
