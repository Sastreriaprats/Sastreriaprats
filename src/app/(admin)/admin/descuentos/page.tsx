'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  listDiscountCodes,
  createDiscountCode,
  toggleDiscountCodeActive,
  deleteDiscountCode,
} from '@/actions/discounts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Loader2, Copy, Power, Trash2, Tag } from 'lucide-react'
import { toast } from 'sonner'

interface DiscountCode {
  id: string
  code: string
  description: string | null
  discount_type: string
  discount_value: string
  min_purchase: string | null
  max_uses: number | null
  current_uses: number
  valid_from: string | null
  valid_until: string | null
  applies_to: string
  is_active: boolean
  created_at: string
}

const EMPTY_FORM = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  min_purchase: '',
  max_uses: '',
  valid_from: '',
  valid_until: '',
  applies_to: 'all',
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function DescuentosPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const fetchCodes = useCallback(async () => {
    const res = await listDiscountCodes()
    if (res.success) setCodes(res.data as DiscountCode[])
    else toast.error(res.error || 'Error al cargar los códigos')
  }, [])

  useEffect(() => {
    fetchCodes().finally(() => setLoading(false))
  }, [fetchCodes])

  const openNew = () => {
    setForm({ ...EMPTY_FORM, code: generateCode() })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error('El código es obligatorio'); return }
    if (!form.discount_value || parseFloat(form.discount_value) <= 0) { toast.error('El valor del descuento es obligatorio'); return }

    setSaving(true)
    try {
      const res = await createDiscountCode({
        code: form.code,
        description: form.description.trim() || null,
        discount_type: form.discount_type as 'percentage' | 'fixed',
        discount_value: parseFloat(form.discount_value),
        min_purchase: form.min_purchase ? parseFloat(form.min_purchase) : null,
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        applies_to: form.applies_to as 'all' | 'online' | 'boutique',
      })
      if (!res.success) {
        toast.error(res.error || 'Error al crear')
        return
      }
      toast.success('Código de descuento creado')
      setDialogOpen(false)
      setForm(EMPTY_FORM)
      await fetchCodes()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (id: string, current: boolean) => {
    const res = await toggleDiscountCodeActive({ id, is_active: !current })
    if (!res.success) {
      toast.error(res.error || 'Error al actualizar')
    } else {
      toast.success(current ? 'Código desactivado' : 'Código activado')
      await fetchCodes()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este código de descuento?')) return
    const res = await deleteDiscountCode({ id })
    if (!res.success) {
      toast.error(res.error || 'Error al eliminar')
    } else {
      toast.success('Código eliminado')
      await fetchCodes()
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success(`Código ${code} copiado`)
  }

  const updateField = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Códigos de descuento</h1>
          <p className="text-sm text-muted-foreground">Gestiona los códigos promocionales para la tienda online y el POS.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-1">
              <Plus className="h-4 w-4" /> Crear código
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuevo código de descuento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código *</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.code}
                      onChange={e => updateField('code', e.target.value.toUpperCase())}
                      placeholder="VERANO2025"
                      className="uppercase"
                    />
                    <Button variant="outline" size="icon" type="button" onClick={() => updateField('code', generateCode())} title="Generar código">
                      <Tag className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Aplica a</Label>
                  <Select value={form.applies_to} onValueChange={v => updateField('applies_to', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los canales</SelectItem>
                      <SelectItem value="online">Solo online</SelectItem>
                      <SelectItem value="boutique">Solo boutique/POS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Descripción</Label>
                <Input value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Campaña verano 2025" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de descuento *</Label>
                  <Select value={form.discount_type} onValueChange={v => updateField('discount_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                      <SelectItem value="fixed">Cantidad fija (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor * {form.discount_type === 'percentage' ? '(%)' : '(€)'}</Label>
                  <Input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => updateField('discount_value', e.target.value)} placeholder={form.discount_type === 'percentage' ? '10' : '25.00'} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Compra mínima (€)</Label>
                  <Input type="number" min="0" step="0.01" value={form.min_purchase} onChange={e => updateField('min_purchase', e.target.value)} placeholder="Opcional" />
                </div>
                <div>
                  <Label>Límite de usos</Label>
                  <Input type="number" min="0" value={form.max_uses} onChange={e => updateField('max_uses', e.target.value)} placeholder="Sin límite" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Válido desde</Label>
                  <Input type="date" value={form.valid_from} onChange={e => updateField('valid_from', e.target.value)} />
                </div>
                <div>
                  <Label>Válido hasta</Label>
                  <Input type="date" value={form.valid_until} onChange={e => updateField('valid_until', e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Crear código
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {codes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Tag className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No hay códigos de descuento creados.</p>
            <p className="text-sm mt-1">Crea el primero para empezar.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead>Válido</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map(dc => {
                  const isExpired = dc.valid_until && dc.valid_until < new Date().toISOString().split('T')[0]
                  const isMaxed = dc.max_uses && dc.current_uses >= dc.max_uses
                  return (
                    <TableRow key={dc.id} className={!dc.is_active ? 'opacity-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm">{dc.code}</span>
                          <button onClick={() => copyCode(dc.code)} className="text-muted-foreground hover:text-foreground">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {dc.description && <p className="text-xs text-muted-foreground mt-0.5">{dc.description}</p>}
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">
                          {dc.discount_type === 'percentage'
                            ? `${parseFloat(dc.discount_value)}%`
                            : `${parseFloat(dc.discount_value).toFixed(2)}€`}
                        </span>
                        {dc.min_purchase && (
                          <span className="text-xs text-muted-foreground ml-1">(min {parseFloat(dc.min_purchase).toFixed(0)}€)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {dc.valid_from && dc.valid_until
                          ? `${dc.valid_from} — ${dc.valid_until}`
                          : dc.valid_until
                            ? `Hasta ${dc.valid_until}`
                            : 'Sin fecha'}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{dc.current_uses}{dc.max_uses ? ` / ${dc.max_uses}` : ''}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {dc.applies_to === 'all' ? 'Todos' : dc.applies_to === 'online' ? 'Online' : 'Boutique'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!dc.is_active ? (
                          <Badge variant="secondary">Inactivo</Badge>
                        ) : isExpired ? (
                          <Badge variant="destructive">Expirado</Badge>
                        ) : isMaxed ? (
                          <Badge variant="secondary">Agotado</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Activo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title={dc.is_active ? 'Desactivar' : 'Activar'} onClick={() => toggleActive(dc.id, dc.is_active)}>
                            <Power className={`h-4 w-4 ${dc.is_active ? 'text-green-600' : 'text-muted-foreground'}`} />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(dc.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
