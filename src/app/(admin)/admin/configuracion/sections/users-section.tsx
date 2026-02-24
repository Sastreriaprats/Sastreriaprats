'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Loader2, UserPlus, KeyRound, Pencil, Copy, Check } from 'lucide-react'
import { listAdminUsers, createAdminUser, updateAdminUser, listRoles, listStores, type UserRow } from '@/actions/users'
import { formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'

const ROLE_COLORS: Record<string, string> = {
  administrador:    'bg-red-100 text-red-700',
  sastre:           'bg-purple-100 text-purple-700',
  sastre_plus:      'bg-violet-100 text-violet-700',
  vendedor_basico:  'bg-amber-100 text-amber-700',
  vendedor_avanzado:'bg-orange-100 text-orange-700',
}

export function UsersSection() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<{ id: string; name: string; display_name: string | null }[]>([])
  const [stores, setStores] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    setLoading(true)
    const [u, r, s] = await Promise.all([listAdminUsers(), listRoles(), listStores()])
    if (u.data) setUsers(u.data)
    if (r.data) setRoles(r.data.filter(role => role.name?.toLowerCase() !== 'client'))
    if (s.data) setStores(s.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Usuarios de la empresa</h2>
          <p className="text-sm text-muted-foreground">Usuarios del panel de administración (sastres, vendedores, administradores). Los clientes se gestionan en Clientes.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 bg-prats-navy hover:bg-prats-navy/90">
              <UserPlus className="h-4 w-4" /> Nuevo usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Crear usuario</DialogTitle>
              <DialogDescription>Se generará una contraseña temporal que deberás comunicar manualmente.</DialogDescription>
            </DialogHeader>
            <CreateUserForm
              roles={roles}
              stores={stores}
              onSuccess={async (pwd) => {
                setTempPassword(pwd)
                setCreateOpen(false)
                await load()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Dialog contraseña temporal */}
      {tempPassword && (
        <Dialog open={!!tempPassword} onOpenChange={() => { setTempPassword(null); setCopied(false) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Usuario creado</DialogTitle>
              <DialogDescription>Comparte esta contraseña temporal con el usuario. Solo se muestra una vez.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
              <span className="flex-1">{tempPassword}</span>
              <Button variant="ghost" size="icon" onClick={() => {
                navigator.clipboard.writeText(tempPassword)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={() => { setTempPassword(null); setCopied(false) }}>Entendido</Button>
          </DialogContent>
        </Dialog>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-5 w-32 animate-pulse rounded bg-muted" /></TableCell>
                    <TableCell><div className="h-5 w-40 animate-pulse rounded bg-muted" /></TableCell>
                    <TableCell><div className="h-5 w-24 animate-pulse rounded bg-muted" /></TableCell>
                    <TableCell><div className="h-5 w-16 animate-pulse rounded bg-muted" /></TableCell>
                    <TableCell><div className="h-5 w-20 animate-pulse rounded bg-muted" /></TableCell>
                    <TableCell><div className="h-8 w-8 animate-pulse rounded bg-muted" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin usuarios</TableCell></TableRow>
                )}
                {users.map(u => {
                  const role = u.roles[0]
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        {role ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role.name] ?? 'bg-gray-100 text-gray-700'}`}>
                            {role.display_name ?? role.name}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">Sin rol</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? 'default' : 'secondary'} className="text-xs">
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.last_login_at ? formatDateTime(u.last_login_at) : 'Nunca'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditUser(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      {editUser && (
        <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar usuario</DialogTitle>
              <DialogDescription>{editUser.email}</DialogDescription>
            </DialogHeader>
            <EditUserForm
              user={editUser}
              roles={roles}
              stores={stores}
              onSuccess={async (pwd) => {
                setEditUser(null)
                if (pwd) setTempPassword(pwd)
                await load()
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function CreateUserForm({ roles, stores, onSuccess }: {
  roles: { id: string; name: string; display_name: string | null }[]
  stores: { id: string; name: string }[]
  onSuccess: (tempPassword: string) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const res = await createAdminUser({ firstName, lastName, email, roleId, storeId })
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Usuario creado')
    onSuccess(res.data!.tempPassword)
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Nombre *</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} required /></div>
        <div className="space-y-1"><Label>Apellidos *</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} required /></div>
      </div>
      <div className="space-y-1"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
      <div className="space-y-1">
        <Label>Rol *</Label>
        <Select value={roleId} onValueChange={setRoleId} required>
          <SelectTrigger><SelectValue placeholder="Seleccionar rol..." /></SelectTrigger>
          <SelectContent>
            {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.display_name ?? r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Tienda asignada *</Label>
        <Select value={storeId} onValueChange={setStoreId} required>
          <SelectTrigger><SelectValue placeholder="Seleccionar tienda..." /></SelectTrigger>
          <SelectContent>
            {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full bg-prats-navy hover:bg-prats-navy/90" disabled={loading || !roleId || !storeId}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando...</> : 'Crear usuario'}
      </Button>
    </form>
  )
}

function EditUserForm({ user, roles, stores, onSuccess }: {
  user: UserRow
  roles: { id: string; name: string; display_name: string | null }[]
  stores: { id: string; name: string }[]
  onSuccess: (tempPassword?: string) => void
}) {
  const [firstName, setFirstName] = useState(user.first_name ?? '')
  const [lastName, setLastName] = useState(user.last_name ?? '')
  const [roleId, setRoleId] = useState(user.roles[0]?.id ?? '')
  const [storeId, setStoreId] = useState('')
  const [isActive, setIsActive] = useState(user.is_active)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const res = await updateAdminUser({ userId: user.id, firstName, lastName, roleId: roleId || undefined, storeId: storeId || undefined, isActive })
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Usuario actualizado')
    onSuccess()
  }

  const handleReset = async () => {
    setResetting(true)
    const res = await updateAdminUser({ userId: user.id, resetPassword: true })
    setResetting(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Contraseña reseteada')
    onSuccess(res.data?.tempPassword)
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Nombre</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div className="space-y-1"><Label>Apellidos</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
      </div>
      <div className="space-y-1">
        <Label>Rol</Label>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.display_name ?? r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Cambiar tienda</Label>
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger><SelectValue placeholder="Sin cambios" /></SelectTrigger>
          <SelectContent>
            {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between border rounded-lg p-3">
        <div><p className="text-sm font-medium">Estado de la cuenta</p><p className="text-xs text-muted-foreground">Desactivar impide el acceso</p></div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 bg-prats-navy hover:bg-prats-navy/90" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar cambios'}
        </Button>
        <Button type="button" variant="outline" className="gap-2" onClick={handleReset} disabled={resetting}>
          <KeyRound className="h-4 w-4" />
          {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resetear pwd'}
        </Button>
      </div>
    </form>
  )
}
