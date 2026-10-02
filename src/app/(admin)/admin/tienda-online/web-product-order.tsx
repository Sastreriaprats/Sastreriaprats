'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, ExternalLink, GripVertical, Loader2, Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import {
  getWebProductOrder,
  saveWebProductOrder,
  type WebOrderCategory,
  type WebOrderProduct,
} from '@/actions/web-product-order'

const ALL = '__all__'

const formatPrice = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

/**
 * Tienda Online → Orden en la web. Ordena los productos tal y como salen en la
 * web en "Recomendados" (el orden por defecto). Arrastrar funciona con ratón; en
 * el iPad, las flechas.
 */
export function WebProductOrder() {
  const { can } = usePermissions()
  const canEdit = can('cms.edit')

  const [categories, setCategories] = useState<WebOrderCategory[]>([])
  const [category, setCategory] = useState<string>(ALL)
  const [loaded, setLoaded] = useState<WebOrderProduct[]>([])
  const [items, setItems] = useState<WebOrderProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const load = useCallback(async (slug: string) => {
    setLoading(true)
    const res = await getWebProductOrder({ categorySlug: slug === ALL ? null : slug })
    setLoading(false)
    if (!res.success) { toast.error(res.error ?? 'No se pudo cargar la lista'); return }
    setCategories(res.data.categories)
    setLoaded(res.data.products)
    setItems(res.data.products)
  }, [])

  useEffect(() => { load(ALL) }, [load])

  const dirty = useMemo(
    () => items.length !== loaded.length || items.some((p, i) => p.id !== loaded[i]?.id),
    [items, loaded],
  )
  const unplaced = useMemo(() => loaded.filter((p) => p.position == null).length, [loaded])
  const categoryLabel = category === ALL ? null : categories.find((c) => c.slug === category)?.name ?? null

  const changeCategory = (slug: string) => {
    if (dirty && !window.confirm('Hay cambios sin guardar en este orden. ¿Descartarlos?')) return
    setCategory(slug)
    load(slug)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return
    setItems((prev) => {
      const next = [...prev]
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await saveWebProductOrder({ orderedIds: items.map((p) => p.id), categoryLabel })
    setSaving(false)
    if (!res.success) { toast.error(res.error ?? 'No se pudo guardar el orden'); return }
    toast.success('Orden guardado. La web ya lo muestra en "Recomendados".')
    load(category)
  }

  const webUrl = category === ALL ? '/boutique' : `/boutique/categoria/${category}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orden de los productos en la web</CardTitle>
        <CardDescription>
          Es el orden «Recomendados», el que ve el cliente al entrar en la boutique o en una categoría.
          Ordenar una categoría no descoloca el resto: sus productos se reparten los huecos que ya tenían.
          Los productos nuevos aparecen al final hasta que los coloques.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={category} onValueChange={changeCategory} disabled={loading || saving}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toda la boutique</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.parentName ? `${c.parentName} › ${c.name}` : c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <a href={webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            Ver en la web <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="ml-auto flex items-center gap-2">
            {dirty && (
              <Button variant="outline" size="sm" onClick={() => setItems(loaded)} disabled={saving}>
                <Undo2 className="mr-1 h-4 w-4" /> Descartar
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving || !canEdit}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Guardar orden
            </Button>
          </div>
        </div>

        {!canEdit && (
          <p className="text-sm text-amber-700">Puedes ver el orden, pero para cambiarlo hace falta el permiso de editar el contenido web.</p>
        )}
        {unplaced > 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            {unplaced === loaded.length
              ? 'Todavía no hay orden propio: ahora mismo la web los enseña por nombre (A-Z). Al guardar, se fija el orden de esta lista.'
              : `${unplaced} producto${unplaced === 1 ? '' : 's'} sin colocar (salen al final, por nombre).`}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No hay productos visibles en la web en esta categoría.</p>
        ) : (
          <ol className="divide-y rounded-md border">
            {items.map((p, i) => (
              <li
                key={p.id}
                draggable={canEdit && !saving}
                onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (dragIndex !== null && dragIndex !== i) { move(dragIndex, i); setDragIndex(i) }
                }}
                onDragEnd={() => setDragIndex(null)}
                onDrop={(e) => { e.preventDefault(); setDragIndex(null) }}
                className={`flex items-center gap-3 bg-white px-3 py-2 ${dragIndex === i ? 'opacity-50' : ''}`}
              >
                <GripVertical className={`h-4 w-4 shrink-0 text-muted-foreground ${canEdit ? 'cursor-move' : 'opacity-30'}`} />
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" loading="lazy" draggable={false} />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.categoryName ?? 'Sin categoría'} · {formatPrice(p.price)}
                    {p.position == null && <Badge variant="outline" className="ml-2 align-middle text-[10px]">sin colocar</Badge>}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Al principio" onClick={() => move(i, 0)} disabled={i === 0 || saving}><ChevronsUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Subir" onClick={() => move(i, i - 1)} disabled={i === 0 || saving}><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Bajar" onClick={() => move(i, i + 1)} disabled={i === items.length - 1 || saving}><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Al final" onClick={() => move(i, items.length - 1)} disabled={i === items.length - 1 || saving}><ChevronsDown className="h-4 w-4" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
