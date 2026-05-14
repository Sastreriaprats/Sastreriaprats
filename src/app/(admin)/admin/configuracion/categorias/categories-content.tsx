'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Plus, Search, Pencil, Trash2, ChevronUp, ChevronDown, Loader2, FolderTree, Eye, EyeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  listCategories,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  moveCategorySortOrderAction,
  type ProductCategoryRow,
} from '@/actions/categories'
import { normalizeSearchTerm } from '@/lib/utils'

const PRODUCT_TYPE_OPTIONS = [
  { value: 'boutique', label: 'Boutique' },
  { value: 'tailoring_fabric', label: 'Tejido' },
  { value: 'accessory', label: 'Accesorio' },
  { value: 'service', label: 'Servicio' },
] as const
const PRODUCT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCT_TYPE_OPTIONS.map(o => [o.value, o.label]),
)

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

type FormState = {
  id?: string
  name: string
  slug: string
  parent_id: string
  product_type: string
  is_visible_web: boolean
  description: string
  sort_order: number | ''
}

const emptyForm: FormState = {
  id: undefined,
  name: '',
  slug: '',
  parent_id: '',
  product_type: '',
  is_visible_web: true,
  description: '',
  sort_order: 0,
}

export function CategoriesContent({ initialCategories }: { initialCategories: ProductCategoryRow[] }) {
  const [categories, setCategories] = useState<ProductCategoryRow[]>(initialCategories)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [onlyWebVisible, setOnlyWebVisible] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ProductCategoryRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── carga ──
  const refresh = useCallback(async () => {
    setRefreshing(true)
    const r = await listCategories()
    if (r.success && r.data) setCategories(r.data)
    setRefreshing(false)
  }, [])

  // ── derivados ──
  const rootOptions = useMemo(
    () => categories.filter((c) => c.level === 0).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  )

  // árbol filtrado: aplicamos filtros sobre los hijos pero mantenemos los padres si tienen hijos visibles
  const filteredTree = useMemo(() => {
    const term = normalizeSearchTerm(search)
    const matches = (c: ProductCategoryRow) => {
      if (term && !normalizeSearchTerm(c.name || '').includes(term) && !normalizeSearchTerm(c.slug || '').includes(term)) return false
      if (typeFilter !== 'all' && c.product_type !== typeFilter) return false
      if (onlyWebVisible && !c.is_visible_web) return false
      return true
    }
    const childrenOf = (parentId: string | null) =>
      categories
        .filter((c) => c.parent_id === parentId)
        .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))

    type Node = { cat: ProductCategoryRow; children: Node[] }
    const build = (parentId: string | null): Node[] =>
      childrenOf(parentId)
        .map((cat) => ({ cat, children: build(cat.id) }))
        .filter((node) => matches(node.cat) || node.children.length > 0)

    return build(null)
  }, [categories, search, typeFilter, onlyWebVisible])

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── dialog crear/editar ──
  const openCreate = () => {
    setForm(emptyForm)
    setSlugTouched(false)
    setDialogOpen(true)
  }
  const openEdit = (cat: ProductCategoryRow) => {
    setForm({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parent_id: cat.parent_id ?? '',
      product_type: cat.product_type ?? '',
      is_visible_web: cat.is_visible_web,
      description: cat.description ?? '',
      sort_order: cat.sort_order,
    })
    setSlugTouched(true)
    setDialogOpen(true)
  }

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      slug: slugTouched ? f.slug : slugify(name),
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      parent_id: form.parent_id || null,
      product_type: form.product_type || null,
      is_visible_web: form.is_visible_web,
      sort_order: typeof form.sort_order === 'number' ? form.sort_order : 0,
      description: form.description.trim() || null,
    }
    const res = form.id
      ? await updateCategoryAction({ id: form.id, ...payload })
      : await createCategoryAction(payload)
    setSaving(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al guardar')
      return
    }
    toast.success(form.id ? 'Categoría actualizada' : 'Categoría creada')
    setDialogOpen(false)
    setForm(emptyForm)
    setSlugTouched(false)
    refresh()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await deleteCategoryAction({ id: deleteTarget.id })
    setDeleting(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al eliminar')
      return
    }
    toast.success('Categoría eliminada')
    setDeleteTarget(null)
    refresh()
  }

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    const res = await moveCategorySortOrderAction({ id, direction })
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al mover')
      return
    }
    refresh()
  }

  // ── render del árbol ──
  type Node = { cat: ProductCategoryRow; children: Node[] }
  const renderRow = (node: Node, depth: number, siblingIndex: number, siblingsCount: number): React.ReactNode[] => {
    const { cat } = node
    const isPadre = depth === 0
    const isCollapsed = collapsed.has(cat.id)
    const out: React.ReactNode[] = []
    out.push(
      <TableRow key={cat.id} className={isPadre ? 'bg-muted/40 hover:bg-muted/60' : 'hover:bg-muted/20'}>
        <TableCell>
          <div
            className="flex items-center gap-1"
            style={{ paddingLeft: depth * 20 }}
          >
            {depth > 0 && <span className="text-muted-foreground/40">↳</span>}
            {node.children.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleCollapse(cat.id)}
                className="text-muted-foreground hover:text-foreground p-0.5"
                title={isCollapsed ? 'Expandir' : 'Colapsar'}
              >
                {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-[18px]" />
            )}
            <span className={isPadre ? 'font-semibold' : ''}>{cat.name}</span>
            {cat.product_count > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{cat.product_count}</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{cat.slug}</TableCell>
        <TableCell>
          {cat.product_type
            ? <Badge variant="outline" className="text-xs">{PRODUCT_TYPE_LABEL[cat.product_type] ?? cat.product_type}</Badge>
            : <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>
        <TableCell className="text-center">
          {cat.is_visible_web
            ? <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100"><Eye className="h-3 w-3 mr-1" /> Sí</Badge>
            : <Badge variant="secondary"><EyeOff className="h-3 w-3 mr-1" /> No</Badge>}
        </TableCell>
        <TableCell className="text-center text-sm tabular-nums">{cat.sort_order}</TableCell>
        <TableCell className="text-right">
          <div className="inline-flex items-center gap-0.5">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => handleMove(cat.id, 'up')}
              disabled={siblingIndex === 0}
              title="Mover arriba"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => handleMove(cat.id, 'down')}
              disabled={siblingIndex === siblingsCount - 1}
              title="Mover abajo"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)} title="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setDeleteTarget(cat)}
              title="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>,
    )
    if (!isCollapsed) {
      node.children.forEach((child, i) => {
        out.push(...renderRow(child, depth + 1, i, node.children.length))
      })
    }
    return out
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FolderTree className="h-6 w-6 text-prats-navy" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Categorías de productos</h1>
            <p className="text-sm text-muted-foreground">
              Estructura jerárquica usada en el catálogo y en los formularios de producto.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
          <Plus className="h-4 w-4" /> Nueva categoría
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o slug…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {PRODUCT_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="only-web" checked={onlyWebVisible} onCheckedChange={setOnlyWebVisible} />
          <Label htmlFor="only-web" className="text-sm cursor-pointer">Solo visibles en web</Label>
        </div>
        {refreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-center">Web</TableHead>
              <TableHead className="text-center">Orden</TableHead>
              <TableHead className="text-right w-44">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTree.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  {categories.length === 0
                    ? <>No hay categorías. <Button variant="link" className="p-0 h-auto" onClick={openCreate}>Crear la primera</Button>.</>
                    : 'No hay categorías que coincidan con los filtros.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredTree.flatMap((node, i) => renderRow(node, 0, i, filteredTree.length))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setForm(emptyForm); setSlugTouched(false) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Camisas" />
            </div>
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => { setForm((f) => ({ ...f, slug: e.target.value })); setSlugTouched(true) }}
                placeholder="camisas"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">URL-friendly. Se genera automáticamente desde el nombre si lo dejas vacío.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Padre</Label>
                <Select
                  value={form.parent_id || '__none__'}
                  onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Ninguno (categoría raíz)</SelectItem>
                    {rootOptions.filter((c) => c.id !== form.id).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de producto</Label>
                <Select
                  value={form.product_type || '__none__'}
                  onValueChange={(v) => setForm((f) => ({ ...f, product_type: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Sin tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin tipo</SelectItem>
                    {PRODUCT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="visible-web"
                  checked={form.is_visible_web}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_visible_web: v }))}
                />
                <Label htmlFor="visible-web" className="cursor-pointer">Visible en web</Label>
              </div>
              <div className="space-y-1">
                <Label>Orden</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value === '' ? '' : Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Texto opcional usado en SEO / catálogo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-prats-navy hover:bg-prats-navy-light">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {form.id ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog eliminar */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la categoría <strong>{deleteTarget?.name}</strong>? Esta acción no se puede deshacer.
              {deleteTarget?.product_count ? (
                <span className="block mt-2 text-amber-700">
                  Atención: tiene {deleteTarget.product_count} producto(s) asignado(s); el servidor bloqueará la eliminación.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
