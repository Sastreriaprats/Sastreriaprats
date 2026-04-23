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
import {
  Loader2, Plus, Pencil, Trash2, Ruler, Search, FolderTree, X, GripVertical,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  listSizeGuidesAdmin,
  createSizeGuide,
  updateSizeGuide,
  deleteSizeGuide,
  listCategoriesForSizeGuide,
  setSizeGuideCategories,
  type SizeGuideItem,
  type SizeGuideColumn,
  type SizeGuideRow,
} from '@/actions/size-guides'

// Columnas por defecto al crear una guía nueva
const DEFAULT_COLUMNS: SizeGuideColumn[] = [
  { key: 'size', label: 'Talla ES' },
  { key: 'chest', label: 'Pecho (cm)' },
  { key: 'waist', label: 'Cintura (cm)' },
]

export function SizeGuidesSection() {
  const [items, setItems] = useState<SizeGuideItem[]>([])
  const [loading, setLoading] = useState(true)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SizeGuideItem | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<SizeGuideItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [assignOpen, setAssignOpen] = useState<SizeGuideItem | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const res = await listSizeGuidesAdmin()
    setLoading(false)
    if (res.success) setItems(res.data)
    else toast.error(res.error)
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const openEdit = (item: SizeGuideItem) => {
    setEditing(item)
    setEditorOpen(true)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const res = await deleteSizeGuide(confirmDelete.id)
    setDeleting(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success('Guía eliminada')
    setConfirmDelete(null)
    loadItems()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Guías de tallas</h3>
          <p className="text-sm text-muted-foreground">
            Define una guía distinta para cada tipo de prenda (americanas, camisas, pantalones…)
            y asígnala a las categorías correspondientes. Los productos sin guía propia heredarán
            la de su categoría.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nueva guía
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
            <Ruler className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Aún no hay guías de tallas. Crea la primera para asignarla a tus categorías.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id} className={!item.is_active ? 'opacity-60' : ''}>
              <CardContent className="flex items-center gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{item.name}</span>
                    {!item.is_active && <Badge variant="secondary" className="text-xs">Inactiva</Badge>}
                    <Badge variant="outline" className="text-[10px]">
                      {item.columns.length} col · {item.rows.length} fil
                    </Badge>
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="gap-1" title="Categorías asignadas">
                  <FolderTree className="h-3 w-3" />
                  {item.category_count} cat.
                </Badge>
                {item.product_count > 0 && (
                  <Badge variant="outline" className="gap-1" title="Productos con override directo">
                    {item.product_count} prod.
                  </Badge>
                )}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setAssignOpen(item)} title="Asignar a categorías">
                    <FolderTree className="h-4 w-4" />
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

      {editorOpen && (
        <SizeGuideEditor
          item={editing}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); loadItems() }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar guía de tallas</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar &quot;{confirmDelete?.name}&quot;? Las categorías y productos
              que la tengan asignada quedarán sin guía.
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

      {assignOpen && (
        <AssignCategoriesDialog
          open={!!assignOpen}
          item={assignOpen}
          onClose={() => setAssignOpen(null)}
          onSaved={() => { setAssignOpen(null); loadItems() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor de guía de tallas (columnas + filas)
// ---------------------------------------------------------------------------

function SizeGuideEditor({
  item, onClose, onSaved,
}: {
  item: SizeGuideItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [footerNote, setFooterNote] = useState(
    item?.footer_note ?? 'Las medidas son orientativas. Si tienes dudas, visítanos en cualquiera de nuestras boutiques.',
  )
  const [active, setActive] = useState(item?.is_active ?? true)
  const [columns, setColumns] = useState<SizeGuideColumn[]>(
    item?.columns && item.columns.length > 0 ? item.columns : DEFAULT_COLUMNS,
  )
  const [rows, setRows] = useState<SizeGuideRow[]>(item?.rows ?? [])
  const [saving, setSaving] = useState(false)

  const addColumn = () => {
    const i = columns.length + 1
    setColumns([...columns, { key: `col_${i}`, label: `Columna ${i}` }])
    setRows(rs => rs.map(r => ({ ...r, [`col_${i}`]: '' })))
  }

  const updateColumnLabel = (idx: number, label: string) => {
    setColumns(cs => cs.map((c, i) => i === idx ? { ...c, label } : c))
  }

  const removeColumn = (idx: number) => {
    const key = columns[idx]?.key
    setColumns(cs => cs.filter((_, i) => i !== idx))
    if (key) {
      setRows(rs => rs.map(r => {
        const copy = { ...r }
        delete copy[key]
        return copy
      }))
    }
  }

  const addRow = () => {
    const empty: SizeGuideRow = {}
    for (const c of columns) empty[c.key] = ''
    setRows([...rows, empty])
  }

  const updateCell = (rowIdx: number, key: string, value: string) => {
    setRows(rs => rs.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r))
  }

  const removeRow = (idx: number) => {
    setRows(rs => rs.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    if (columns.length === 0) { toast.error('Añade al menos una columna'); return }
    setSaving(true)
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      footer_note: footerNote.trim() || null,
      columns,
      rows,
    }
    const res = isEdit
      ? await updateSizeGuide({ id: item!.id, ...payload, is_active: active })
      : await createSizeGuide(payload)
    setSaving(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success(isEdit ? 'Guía actualizada' : 'Guía creada')
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar guía de tallas' : 'Nueva guía de tallas'}</DialogTitle>
          <DialogDescription>
            Define las columnas (Pecho, Cintura, Cuello, Largo…) y las filas (una por talla) que
            se mostrarán al cliente en la ficha del producto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Americanas, Camisas, Pantalones"
                autoFocus
              />
            </div>
            {isEdit && (
              <div className="flex items-center gap-3 self-end pb-1">
                <Switch id="sg-active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="sg-active">Activa</Label>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Descripción interna (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Uso interno — no se muestra al cliente"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Columnas</Label>
              <Button type="button" variant="outline" size="sm" onClick={addColumn}>
                <Plus className="h-3 w-3 mr-1" /> Añadir columna
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {columns.map((c, idx) => (
                <div key={c.key} className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    value={c.label}
                    onChange={(e) => updateColumnLabel(idx, e.target.value)}
                    placeholder="Nombre de la columna"
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeColumn(idx)}
                    disabled={columns.length <= 1}
                    title="Eliminar columna"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Filas (tallas)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-3 w-3 mr-1" /> Añadir fila
              </Button>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {columns.map(c => (
                      <th key={c.key} className="py-2 px-3 text-left font-medium text-xs uppercase tracking-wide">
                        {c.label || '—'}
                      </th>
                    ))}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="py-6 px-3 text-center text-muted-foreground text-xs">
                        No hay filas. Haz clic en &quot;Añadir fila&quot; para empezar.
                      </td>
                    </tr>
                  ) : rows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-t">
                      {columns.map(c => (
                        <td key={c.key} className="p-1">
                          <Input
                            value={row[c.key] ?? ''}
                            onChange={(e) => updateCell(rIdx, c.key, e.target.value)}
                            className="h-8 text-sm"
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="p-1 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(rIdx)}
                          title="Eliminar fila"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nota al pie (opcional)</Label>
            <Textarea
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              rows={2}
              placeholder="Texto que aparecerá bajo la tabla en la ficha del producto"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear guía'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Diálogo: asignar la guía a categorías
// ---------------------------------------------------------------------------

type CategoryRow = {
  id: string
  name: string
  slug: string
  assigned: boolean
  current_guide_id: string | null
}

function AssignCategoriesDialog({
  open, item, onClose, onSaved,
}: {
  open: boolean
  item: SizeGuideItem
  onClose: () => void
  onSaved: () => void
}) {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listCategoriesForSizeGuide(item.id)
      .then(res => {
        if (cancelled) return
        if (!res.success) { toast.error(res.error); return }
        setCategories(res.data)
        setSelectedIds(new Set(res.data.filter(c => c.assigned).map(c => c.id)))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [item.id])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return categories
    return categories.filter(c =>
      c.name.toLowerCase().includes(s) || c.slug.toLowerCase().includes(s),
    )
  }, [categories, search])

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await setSizeGuideCategories({ id: item.id, categoryIds: Array.from(selectedIds) })
    setSaving(false)
    if (!res.success) { toast.error(res.error); return }
    const { assigned, unassigned } = res.data
    toast.success(`${assigned} asignadas · ${unassigned} desasignadas`)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Asignar &quot;{item.name}&quot; a categorías</DialogTitle>
          <DialogDescription>
            Las categorías seleccionadas usarán esta guía de tallas por defecto. Si una categoría ya
            tenía otra guía, se reemplazará.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar categoría..."
              className="pl-8 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{filtered.length} categorías</span>
            <Badge variant="secondary">{selectedIds.size} seleccionadas</Badge>
          </div>

          <ScrollArea className="h-[320px] rounded-md border">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Cargando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No hay categorías que coincidan.
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map(c => {
                  const otherGuide = c.current_guide_id && c.current_guide_id !== item.id
                  return (
                    <li key={c.id}>
                      <label className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={() => toggle(c.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.slug}{otherGuide ? ' · ya tiene otra guía' : ''}
                          </div>
                        </div>
                        {otherGuide && !selectedIds.has(c.id) && (
                          <Badge variant="outline" className="text-[10px]">otra guía</Badge>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
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
