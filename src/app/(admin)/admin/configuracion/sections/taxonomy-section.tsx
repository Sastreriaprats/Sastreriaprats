'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Plus, Pencil, Trash2, Users, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { ActionResult } from '@/lib/errors'
import {
  listProductsForTaxonomy,
  setTaxonomyProducts,
  type TaxonomyItem,
} from '@/actions/product-taxonomies'

type ProductRow = {
  id: string
  name: string
  sku: string
  brand: string | null
  assigned: boolean
}

interface TaxonomySectionProps {
  label: string           // "Colección" | "Temporada"
  labelPlural: string     // "Colecciones" | "Temporadas"
  taxonomy: 'collection' | 'season'
  icon: React.ReactNode
  listAction: () => Promise<ActionResult<TaxonomyItem[]>>
  createAction: (i: { name: string; description?: string | null }) => Promise<ActionResult<any>>
  updateAction: (i: { id: string; name?: string; description?: string | null; is_active?: boolean }) => Promise<ActionResult<any>>
  deleteAction: (id: string) => Promise<ActionResult<any>>
}

export function TaxonomySection({
  label, labelPlural, taxonomy, icon,
  listAction, createAction, updateAction, deleteAction,
}: TaxonomySectionProps) {
  const [items, setItems] = useState<TaxonomyItem[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TaxonomyItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState<TaxonomyItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [assignOpen, setAssignOpen] = useState<TaxonomyItem | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const res = await listAction()
    setLoading(false)
    if (res.success) setItems(res.data)
    else toast.error(res.error)
  }, [listAction])

  useEffect(() => { loadItems() }, [loadItems])

  const openCreate = () => {
    setEditing(null)
    setFormName('')
    setFormDescription('')
    setFormActive(true)
    setShowForm(true)
  }

  const openEdit = (item: TaxonomyItem) => {
    setEditing(item)
    setFormName(item.name)
    setFormDescription(item.description ?? '')
    setFormActive(item.is_active)
    setShowForm(true)
  }

  const handleSave = async () => {
    const name = formName.trim()
    if (!name) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    const res = editing
      ? await updateAction({
          id: editing.id, name,
          description: formDescription.trim() || null,
          is_active: formActive,
        })
      : await createAction({ name, description: formDescription.trim() || null })
    setSaving(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success(editing ? `${label} actualizada` : `${label} creada`)
    setShowForm(false)
    loadItems()
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const res = await deleteAction(confirmDelete.id)
    setDeleting(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success(`${label} eliminada`)
    setConfirmDelete(null)
    loadItems()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{labelPlural}</h3>
          <p className="text-sm text-muted-foreground">
            Define las {labelPlural.toLowerCase()} disponibles y asigna productos a cada una.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nueva {label.toLowerCase()}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-lg border bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {icon}
          </div>
          <p className="text-sm text-muted-foreground">
            Aún no hay {labelPlural.toLowerCase()}. Crea la primera para poder asignarla a productos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id} className={!item.is_active ? 'opacity-60' : ''}>
              <CardContent className="flex items-center gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{item.name}</span>
                    {!item.is_active && <Badge variant="secondary" className="text-xs">Inactiva</Badge>}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="gap-1">
                  <Users className="h-3 w-3" />
                  {item.product_count} {item.product_count === 1 ? 'producto' : 'productos'}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setAssignOpen(item)} title="Asignar productos">
                    <Users className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(item)} title="Eliminar">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form crear/editar */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar ${label.toLowerCase()}` : `Nueva ${label.toLowerCase()}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={taxonomy === 'collection' ? 'Ej. Colección Primavera 2026' : 'Ej. SS26'}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                placeholder="Opcional"
              />
            </div>
            {editing && (
              <div className="flex items-center gap-3">
                <Switch id="active" checked={formActive} onCheckedChange={setFormActive} />
                <Label htmlFor="active">Activa (visible en selector de productos)</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {label.toLowerCase()}</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar &quot;{confirmDelete?.name}&quot;? Los productos que la tengan asignada
              quedarán sin {label.toLowerCase()}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de asignación de productos */}
      {assignOpen && (
        <AssignProductsDialog
          open={!!assignOpen}
          onClose={() => setAssignOpen(null)}
          item={assignOpen}
          taxonomy={taxonomy}
          label={label}
          onSaved={() => { setAssignOpen(null); loadItems() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diálogo: asignar productos a colección/temporada
// ---------------------------------------------------------------------------

function AssignProductsDialog({
  open, onClose, item, taxonomy, label, onSaved,
}: {
  open: boolean
  onClose: () => void
  item: TaxonomyItem
  taxonomy: 'collection' | 'season'
  label: string
  onSaved: () => void
}) {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listProductsForTaxonomy({ taxonomy, id: item.id })
      .then((res) => {
        if (cancelled) return
        if (!res.success) { toast.error(res.error); return }
        setProducts(res.data)
        setSelectedIds(new Set(res.data.filter(p => p.assigned).map(p => p.id)))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [item.id, taxonomy])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(s) ||
      p.sku.toLowerCase().includes(s) ||
      (p.brand || '').toLowerCase().includes(s)
    )
  }, [products, search])

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleVisible = () => {
    const visibleIds = filtered.map(p => p.id)
    const allSelected = visibleIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await setTaxonomyProducts({
      taxonomy, id: item.id, productIds: Array.from(selectedIds),
    })
    setSaving(false)
    if (!res.success) { toast.error(res.error); return }
    const { assigned, unassigned } = res.data
    toast.success(`${assigned} asignados · ${unassigned} desasignados`)
    onSaved()
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[85vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Asignar productos a {label.toLowerCase()}: {item.name}</DialogTitle>
          <DialogDescription>
            Marca los productos que pertenecen a esta {label.toLowerCase()}. Los desmarcados se
            desasignarán.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-3 px-6 py-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, SKU o marca..."
              className="pl-8 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={toggleVisible}
                disabled={filtered.length === 0 || loading}
              />
              <span className="text-muted-foreground">
                Seleccionar todos {search ? '(filtrados)' : ''}
              </span>
            </div>
            <Badge variant="secondary">{selectedIds.size} seleccionados</Badge>
          </div>

          <ScrollArea className="flex-1 min-h-0 rounded-md border">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Cargando productos...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No hay productos que coincidan.
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map(p => (
                  <li key={p.id}>
                    <label className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={() => toggle(p.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.sku}{p.brand ? ` · ${p.brand}` : ''}
                        </div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Guardar asignación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
