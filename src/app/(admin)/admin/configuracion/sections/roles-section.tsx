'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Pencil, Shield, Loader2, Save, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { updateRolePermissionsAction } from '@/actions/config'

interface Role {
  id: string; name: string; display_name: string; description: string | null;
  role_type: string; hierarchy_level: number; is_active: boolean; color: string;
  permissionCount?: number;
}

interface Permission {
  id: string; code: string; module: string; action: string;
  display_name: string; description: string | null;
  category: string; sort_order: number; is_sensitive: boolean;
}

export function RolesSection() {
  const supabase = createClient()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set())
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [rolesRes, permsRes] = await Promise.all([
        supabase.from('roles').select('*').order('hierarchy_level'),
        supabase.from('permissions').select('*').order('category, sort_order'),
      ])

      if (rolesRes.data) {
        const { data: allRP } = await supabase.from('role_permissions').select('role_id')
        const countMap: Record<string, number> = {}
        allRP?.forEach((rp: any) => { countMap[rp.role_id] = (countMap[rp.role_id] || 0) + 1 })
        setRoles(rolesRes.data.map((r: any) => ({ ...r, permissionCount: countMap[r.id] || 0 })))
      }
      if (permsRes.data) setPermissions(permsRes.data as Permission[])
    } catch (err) {
      console.error('[RolesSection] fetchData error:', err)
      toast.error('Error al cargar roles y permisos')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  const grouped = permissions.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<string, Permission[]>)

  const openEditor = async (role: Role) => {
    setSelectedRole(role)
    const { data } = await supabase.from('role_permissions').select('permission_id').eq('role_id', role.id)
    setSelectedPermIds(new Set((data ?? []).map((rp: any) => rp.permission_id)))
    setIsSheetOpen(true)
  }

  const togglePerm = (id: string) => {
    setSelectedPermIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleCategory = (cat: string) => {
    const ids = grouped[cat].map(p => p.id)
    const allSel = ids.every(id => selectedPermIds.has(id))
    setSelectedPermIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => allSel ? next.delete(id) : next.add(id))
      return next
    })
  }

  const savePermissions = async () => {
    if (!selectedRole) return
    setIsSaving(true)
    const result = await updateRolePermissionsAction(selectedRole.id, Array.from(selectedPermIds))
    if (result.error) toast.error(result.error)
    else { toast.success(`Permisos de "${selectedRole.display_name}" actualizados`); setIsSheetOpen(false); fetchData() }
    setIsSaving(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Gestiona los roles del sistema y sus permisos granulares. Haz clic en editar para ver/cambiar los permisos de cada rol.
      </p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rol</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Permisos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-8 w-48 animate-pulse rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-5 w-20 animate-pulse rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-5 w-16 animate-pulse rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-5 w-14 animate-pulse rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-8 w-8 animate-pulse rounded bg-muted" /></TableCell>
                </TableRow>
              ))
            ) : roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded" style={{ backgroundColor: role.color + '20', color: role.color }}>
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{role.display_name}</p>
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge variant={role.role_type === 'system' ? 'secondary' : 'outline'} className="text-xs">{role.role_type === 'system' ? 'Sistema' : 'Custom'}</Badge></TableCell>
                <TableCell><span className="font-medium">{role.permissionCount}</span><span className="text-xs text-muted-foreground"> / {permissions.length}</span></TableCell>
                <TableCell><Badge variant={role.is_active ? 'default' : 'destructive'} className="text-xs">{role.is_active ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditor(role)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" style={{ color: selectedRole?.color }} />
              Permisos: {selectedRole?.display_name}
            </SheetTitle>
            <SheetDescription>Marca los permisos. Los cambios afectan a todos los usuarios con este rol.</SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{selectedPermIds.size} de {permissions.length} seleccionados</span>
            <Button onClick={savePermissions} disabled={isSaving} size="sm" className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
            </Button>
          </div>

          <ScrollArea className="mt-4 h-[calc(100vh-220px)]">
            <div className="space-y-6 pr-4">
              {Object.entries(grouped).map(([cat, perms]) => {
                const ids = perms.map(p => p.id)
                const allSel = ids.every(id => selectedPermIds.has(id))
                const someSel = ids.some(id => selectedPermIds.has(id))
                return (
                  <div key={cat}>
                    <div className="mb-2 flex items-center gap-2">
                      <Checkbox checked={allSel} data-state={someSel && !allSel ? 'indeterminate' : undefined} onCheckedChange={() => toggleCategory(cat)} />
                      <span className="text-sm font-semibold">{cat}</span>
                      <span className="text-xs text-muted-foreground">({ids.filter(id => selectedPermIds.has(id)).length}/{ids.length})</span>
                    </div>
                    <div className="ml-6 space-y-1">
                      {perms.map((p) => (
                        <div key={p.id} className="flex items-start gap-2 py-1">
                          <Checkbox checked={selectedPermIds.has(p.id)} onCheckedChange={() => togglePerm(p.id)} />
                          <div>
                            <span className="flex items-center gap-1 text-sm">{p.display_name} {p.is_sensitive && <Lock className="h-3 w-3 text-amber-500" />}</span>
                            {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator className="mt-3" />
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}
