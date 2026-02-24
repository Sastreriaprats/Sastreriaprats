'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save } from 'lucide-react'
import { useAction } from '@/hooks/use-action'
import { updateClientAction } from '@/actions/clients'
import { usePermissions } from '@/hooks/use-permissions'

export function ClientDataTab({ client }: { client: any }) {
  const { can } = usePermissions()
  const canEdit = can('clients.edit')
  const [form, setForm] = useState({ ...client })

  const { execute, isLoading } = useAction(updateClientAction, {
    successMessage: 'Datos actualizados',
  })

  const set = (field: string, value: any) => setForm((prev: any) => ({ ...prev, [field]: value }))

  const handleSave = () => execute({ id: client.id, data: form })

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nombre</Label><Input value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} disabled={!canEdit} /></div>
              <div className="space-y-2"><Label>Apellidos</Label><Input value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} disabled={!canEdit} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} disabled={!canEdit} /></div>
              <div className="space-y-2"><Label>Teléfono</Label><Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} disabled={!canEdit} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Nacimiento</Label><Input type="date" value={form.date_of_birth || ''} onChange={(e) => set('date_of_birth', e.target.value)} disabled={!canEdit} /></div>
              <div className="space-y-2"><Label>Documento</Label>
                <Select value={form.document_type || 'DNI'} onValueChange={(v) => set('document_type', v)} disabled={!canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNI">DNI</SelectItem><SelectItem value="NIE">NIE</SelectItem>
                    <SelectItem value="passport">Pasaporte</SelectItem><SelectItem value="CIF">CIF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Nº documento</Label><Input value={form.document_number || ''} onChange={(e) => set('document_number', e.target.value)} disabled={!canEdit} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Categoría</Label>
                <Select value={form.category} onValueChange={(v) => set('category', v)} disabled={!canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Estándar</SelectItem><SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem><SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="ambassador">Embajador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Descuento fijo (%)</Label><Input type="number" min={0} max={100} value={form.discount_percentage || 0} onChange={(e) => set('discount_percentage', parseFloat(e.target.value) || 0)} disabled={!canEdit} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dirección</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Dirección</Label><Input value={form.address || ''} onChange={(e) => set('address', e.target.value)} disabled={!canEdit} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Ciudad</Label><Input value={form.city || ''} onChange={(e) => set('city', e.target.value)} disabled={!canEdit} /></div>
              <div className="space-y-2"><Label>CP</Label><Input value={form.postal_code || ''} onChange={(e) => set('postal_code', e.target.value)} disabled={!canEdit} /></div>
              <div className="space-y-2"><Label>Provincia</Label><Input value={form.province || ''} onChange={(e) => set('province', e.target.value)} disabled={!canEdit} /></div>
            </div>
            <div className="space-y-2"><Label>País</Label><Input value={form.country || 'España'} onChange={(e) => set('country', e.target.value)} disabled={!canEdit} /></div>
            <div className="space-y-2"><Label>Notas internas</Label>
              <Textarea value={form.internal_notes || ''} onChange={(e) => set('internal_notes', e.target.value)} rows={4} disabled={!canEdit} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
