'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Save, Loader2, User, MapPin, Key, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export function ProfileContent({ client, userEmail }: {
  client: Record<string, unknown> | null
  userEmail: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    first_name: (client?.first_name as string) || '',
    last_name: (client?.last_name as string) || '',
    phone: (client?.phone as string) || '',
    address: (client?.address as string) || '',
    city: (client?.city as string) || '',
    postal_code: (client?.postal_code as string) || '',
    province: (client?.province as string) || '',
    shipping_address: (client?.shipping_address as string) || '',
    shipping_city: (client?.shipping_city as string) || '',
    shipping_postal_code: (client?.shipping_postal_code as string) || '',
    shipping_province: (client?.shipping_province as string) || '',
    shipping_country: (client?.shipping_country as string) || 'ES',
  })
  const [passwords, setPasswords] = useState({ new_password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/public/update-client', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client?.id,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          address: form.address,
          city: form.city,
          postal_code: form.postal_code,
          province: form.province,
          shipping_address: form.shipping_address,
          shipping_city: form.shipping_city,
          shipping_postal_code: form.shipping_postal_code,
          shipping_province: form.shipping_province,
          shipping_country: form.shipping_country,
        }),
      })
      if (res.ok) toast.success('Datos actualizados')
      else toast.error('Error al guardar')
    } catch {
      toast.error('Error al guardar')
    }
    setIsSaving(false)
  }

  const handleChangePassword = async () => {
    if (passwords.new_password !== passwords.confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (passwords.new_password.length < 8) {
      toast.error('Mínimo 8 caracteres')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: passwords.new_password })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Contraseña actualizada')
      setShowPassword(false)
      setPasswords({ new_password: '', confirm: '' })
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-prats-navy">Mi perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />Datos personales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={form.first_name}
                onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Apellidos</Label>
              <Input
                value={form.last_name}
                onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
                className="h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={userEmail} disabled className="h-11 bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="h-11"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />Dirección
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Dirección</Label>
            <Input
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              className="h-11"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Ciudad</Label>
              <Input
                value={form.city}
                onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">C.P.</Label>
              <Input
                value={form.postal_code}
                onChange={e => setForm(p => ({ ...p, postal_code: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Provincia</Label>
              <Input
                value={form.province}
                onChange={e => setForm(p => ({ ...p, province: e.target.value }))}
                className="h-11"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" />Dirección de envío
          </CardTitle>
          <p className="text-xs text-gray-500 font-normal">
            Necesaria para recibir pedidos a domicilio. Si está vacía, se usará la dirección anterior.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Dirección</Label>
            <Input
              value={form.shipping_address}
              onChange={e => setForm(p => ({ ...p, shipping_address: e.target.value }))}
              className="h-11"
              placeholder="Ej. Calle Mayor 1"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Ciudad</Label>
              <Input
                value={form.shipping_city}
                onChange={e => setForm(p => ({ ...p, shipping_city: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">C.P.</Label>
              <Input
                value={form.shipping_postal_code}
                onChange={e => setForm(p => ({ ...p, shipping_postal_code: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Provincia</Label>
              <Input
                value={form.shipping_province}
                onChange={e => setForm(p => ({ ...p, shipping_province: e.target.value }))}
                className="h-11"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">País</Label>
            <Input
              value={form.shipping_country}
              onChange={e => setForm(p => ({ ...p, shipping_country: e.target.value }))}
              className="h-11"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isSaving} className="bg-prats-navy hover:bg-prats-navy-light">
        {isSaving
          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          : <Save className="mr-2 h-4 w-4" />}
        {isSaving ? 'Guardando...' : 'Guardar cambios'}
      </Button>

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />Contraseña
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? 'Cancelar' : 'Cambiar'}
            </Button>
          </div>
        </CardHeader>
        {showPassword && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Nueva contraseña</Label>
                <Input
                  type="password"
                  value={passwords.new_password}
                  onChange={e => setPasswords(p => ({ ...p, new_password: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Confirmar</Label>
                <Input
                  type="password"
                  value={passwords.confirm}
                  onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                  className="h-11"
                />
              </div>
            </div>
            <Button onClick={handleChangePassword} className="bg-prats-navy hover:bg-prats-navy-light">
              Actualizar contraseña
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
