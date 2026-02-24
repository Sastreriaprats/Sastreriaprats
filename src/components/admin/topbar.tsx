'use client'

import { Bell, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { User } from '@supabase/supabase-js'
import type { UserWithRoles } from '@/lib/types/auth'
import { logoutAction } from '@/actions/auth'

interface AdminTopbarProps {
  user: User
  profile: UserWithRoles
}

export function AdminTopbar({ user, profile }: AdminTopbarProps) {
  const roleLabel = profile.roles[0]?.displayName ?? profile.roles[0]?.roleName ?? 'Usuario'

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <Button variant="ghost" size="icon" className="lg:hidden">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <kbd className="hidden items-center gap-1 rounded border bg-muted px-2 py-1 text-xs text-muted-foreground sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          Búsqueda rápida
        </span>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{profile.fullName || user.email}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-prats-navy text-sm text-white">
              {(profile.fullName || user.email)?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}
