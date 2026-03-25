'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, Plus, Pencil, Trash2, Star, Loader2, Save, X } from 'lucide-react'
import { toast } from 'sonner'

interface Company {
  id: string
  client_id: string
  company_name: string
  nif: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  province: string | null
  country: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  is_default: boolean
  created_at: string
}

const EMPTY_FORM = {
  company_name: '',
  nif: '',
  address: '',
  city: '',
  postal_code: '',
  province: '',
  country: 'España',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  notes: '',
  is_default: false,
}

export function ClientCompaniesTab({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [companies, setCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const fetchCompanies = useCallback(async () => {
    const { data } = await supabase
      .from('client_companies')
      .select('*')
      .eq('client_id', clientId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    if (data) setCompanies(data)
  }, [supabase, clientId])

  useEffect(() => {
    fetchCompanies().finally(() => setIsLoading(false))
  }, [fetchCompanies])

  const openNew = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, is_default: companies.length === 0 })
    setShowForm(true)
  }

  const openEdit = (c: Company) => {
    setEditingId(c.id)
    setForm({
      company_name: c.company_name || '',
      nif: c.nif || '',
      address: c.address || '',
      city: c.city || '',
      postal_code: c.postal_code || '',
      province: c.province || '',
      country: c.country || 'España',
      contact_name: c.contact_name || '',
      contact_email: c.contact_email || '',
      contact_phone: c.contact_phone || '',
      notes: c.notes || '',
      is_default: c.is_default,
    })
    setShowForm(true)
  }

  const cancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleSave = async () => {
    if (!form.company_name.trim()) {
      toast.error('El nombre de la empresa es obligatorio')
      return
    }
    setSaving(true)
    try {
      // If marking as default, unset others first
      if (form.is_default) {
        await supabase
          .from('client_companies')
          .update({ is_default: false })
          .eq('client_id', clientId)
      }

      const payload = {
        client_id: clientId,
        company_name: form.company_name.trim(),
        nif: form.nif.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        postal_code: form.postal_code.trim() || null,
        province: form.province.trim() || null,
        country: form.country.trim() || null,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        notes: form.notes.trim() || null,
        is_default: form.is_default,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        const { error } = await supabase.from('client_companies').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success('Empresa actualizada')
      } else {
        const { error } = await supabase.from('client_companies').insert(payload)
        if (error) throw error
        toast.success('Empresa añadida')
      }

      cancel()
      await fetchCompanies()
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta empresa?')) return
    const { error } = await supabase.from('client_companies').delete().eq('id', id)
    if (error) {
      toast.error('Error al eliminar')
    } else {
      toast.success('Empresa eliminada')
      await fetchCompanies()
    }
  }

  const handleSetDefault = async (id: string) => {
    await supabase.from('client_companies').update({ is_default: false }).eq('client_id', clientId)
    await supabase.from('client_companies').update({ is_default: true }).eq('id', id)
    await fetchCompanies()
    toast.success('Empresa predeterminada actualizada')
  }

  const updateField = (field: string, value: string | boolean) => setForm((prev) => ({ ...prev, [field]: value }))

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Empresas de facturación</h3>
        {!showForm && (
          <Button size="sm" onClick={openNew} className="gap-1">
            <Plus className="h-4 w-4" /> Añadir empresa
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nombre empresa *</Label>
                <Input value={form.company_name} onChange={(e) => updateField('company_name', e.target.value)} placeholder="Razón social" />
              </div>
              <div>
                <Label>NIF / CIF</Label>
                <Input value={form.nif} onChange={(e) => updateField('nif', e.target.value)} placeholder="B12345678" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Dirección</Label>
                <Input value={form.address} onChange={(e) => updateField('address', e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Ciudad</Label>
                  <Input value={form.city} onChange={(e) => updateField('city', e.target.value)} />
                </div>
                <div>
                  <Label>CP</Label>
                  <Input value={form.postal_code} onChange={(e) => updateField('postal_code', e.target.value)} />
                </div>
                <div>
                  <Label>Provincia</Label>
                  <Input value={form.province} onChange={(e) => updateField('province', e.target.value)} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Persona de contacto</Label>
                <Input value={form.contact_name} onChange={(e) => updateField('contact_name', e.target.value)} />
              </div>
              <div>
                <Label>Email contacto</Label>
                <Input type="email" value={form.contact_email} onChange={(e) => updateField('contact_email', e.target.value)} />
              </div>
              <div>
                <Label>Teléfono contacto</Label>
                <Input value={form.contact_phone} onChange={(e) => updateField('contact_phone', e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={form.is_default}
                onChange={(e) => updateField('is_default', e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="is_default" className="cursor-pointer">Empresa predeterminada para facturación</Label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={cancel} disabled={saving}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {editingId ? 'Guardar cambios' : 'Añadir empresa'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {companies.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p>No hay empresas registradas.</p>
          <p className="text-sm mt-1">Añade una empresa para facturación.</p>
        </div>
      )}

      {companies.map((c) => (
        <Card key={c.id}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{c.company_name}</span>
                  {c.is_default && <Badge variant="secondary" className="text-xs">Predeterminada</Badge>}
                </div>
                {c.nif && <p className="text-sm text-muted-foreground">NIF/CIF: {c.nif}</p>}
                {(c.address || c.city || c.postal_code || c.province) && (
                  <p className="text-sm text-muted-foreground">
                    {[c.address, [c.postal_code, c.city].filter(Boolean).join(' '), c.province].filter(Boolean).join(', ')}
                  </p>
                )}
                {c.contact_name && <p className="text-sm">Contacto: {c.contact_name}{c.contact_phone ? ` · ${c.contact_phone}` : ''}{c.contact_email ? ` · ${c.contact_email}` : ''}</p>}
                {c.notes && <p className="text-sm text-muted-foreground italic">{c.notes}</p>}
              </div>
              <div className="flex gap-1">
                {!c.is_default && (
                  <Button variant="ghost" size="icon" title="Marcar como predeterminada" onClick={() => handleSetDefault(c.id)}>
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
