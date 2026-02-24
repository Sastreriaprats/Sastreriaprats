'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Save, Loader2, Shield, Store, Key } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'

export function ProfileContent() {
  const { profile, stores } = useAuth()
  const supabase = createClient()
  const [isSaving, setIsSaving] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [passwords, setPasswords] = useState({ current: '', new_password: '', confirm: '' })

  const handleChangePassword = async () => {
    if (passwords.new_password !== passwords.confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (passwords.new_password.length < 8) {
      toast.error('Mínimo 8 caracteres')
      return
    }
    setIsSaving(true)
    const { error } = await supabase.auth.updateUser({ password: passwords.new_password })
    if (error) toast.error(error.message)
    else {
      toast.success('Contraseña actualizada')
      setShowChangePassword(false)
      setPasswords({ current: '', new_password: '', confirm: '' })
    }
    setIsSaving(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Mi perfil</h1>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-prats-navy text-white text-xl">{getInitials(profile?.fullName ?? '')}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold">{profile?.fullName}</h2>
              <p className="text-muted-foreground">{profile?.email}</p>
              {profile?.phone && <p className="text-sm text-muted-foreground">{profile.phone}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Roles y permisos</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {profile?.roles?.map((r: { roleId: string; roleName: string; displayName: string | null; color: string | null }) => (
              <Badge
                key={r.roleId}
                style={{ backgroundColor: (r.color ?? '#666') + '20', color: r.color ?? '#333', borderColor: r.color ?? '#666' }}
                className="border"
              >
                {r.displayName ?? r.roleName}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Tiendas asignadas</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stores?.map((s) => (
              <div key={s.storeId} className="flex items-center justify-between p-2 rounded-lg border">
                <span className="text-sm font-medium">{s.storeName}</span>
                {s.isPrimary && <Badge variant="outline" className="text-xs">Principal</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> Contraseña</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowChangePassword(!showChangePassword)}>
              {showChangePassword ? 'Cancelar' : 'Cambiar contraseña'}
            </Button>
          </div>
        </CardHeader>
        {showChangePassword && (
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Nueva contraseña</Label>
              <Input type="password" value={passwords.new_password} onChange={(e) => setPasswords(p => ({ ...p, new_password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="space-y-2"><Label>Confirmar contraseña</Label>
              <Input type="password" value={passwords.confirm} onChange={(e) => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
            </div>
            <Button onClick={handleChangePassword} disabled={isSaving} className="bg-prats-navy hover:bg-prats-navy-light">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
