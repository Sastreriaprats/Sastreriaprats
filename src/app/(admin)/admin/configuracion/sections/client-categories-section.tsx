'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Plus, Pencil, Trash2, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import {
  listClientCategoriesAdmin,
  createClientCategory,
  updateClientCategory,
  deleteClientCategory,
  type ClientCategoryAdmin,
} from '@/actions/client-categories'

/**
 * Categorías de cliente (Normal, VIP, La fábrica…). Petición de Isma, sep-2026:
 * que la tienda las cree sin pasar por soporte. Una categoría con clientes no se
 * borra: se desactiva (deja de ofrecerse, pero los clientes la conservan).
 */
export function ClientCategoriesSection() {
  const { can } = usePermissions()
  const canEdit = can('clients.edit')
  const queryClient = useQueryClient()

  const [items, setItems] = useState<ClientCategoryAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ClientCategoryAdmin | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ClientCategoryAdmin | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listClientCategoriesAdmin()
    setLoading(false)
    if (res.success) setItems(res.data)
    else toast.error(res.error)
  }, [])

  useEffect(() => { load() }, [load])

  // Los desplegables de clientes leen el catálogo con react-query: tras cada
  // cambio se invalida para que la nueva categoría aparezca sin recargar.
  const refreshAll = async () => {
    await load()
    await queryClient.invalidateQueries({ queryKey: ['client-categories'] })
  }

  const openCreate = () => { setEditing(null); setFormName(''); setShowForm(true) }
  const openRename = (c: ClientCategoryAdmin) => { setEditing(c); setFormName(c.name); setShowForm(true) }

  const handleSave = async () => {
    const name = formName.trim()
    if (!name) { toast.error('Escribe un nombre'); return }
    setSaving(true)
    const res = editing
      ? await updateClientCategory({ id: editing.id, name })
      : await createClientCategory({ name })
    setSaving(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success(editing ? 'Categoría renombrada' : 'Categoría creada')
    setShowForm(false)
    await refreshAll()
  }

  const handleToggle = async (c: ClientCategoryAdmin, active: boolean) => {
    setTogglingId(c.id)
    const res = await updateClientCategory({ id: c.id, is_active: active })
    setTogglingId(null)
    if (!res.success) { toast.error(res.error); return }
    toast.success(active ? 'Categoría activada' : 'Categoría desactivada')
    await refreshAll()
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const res = await deleteClientCategory(confirmDelete.id)
    setDeleting(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success('Categoría borrada')
    setConfirmDelete(null)
    await refreshAll()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Categorías de cliente</CardTitle>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate} className="gap-1 bg-prats-navy hover:bg-prats-navy-light">
            <Plus className="h-4 w-4" /> Nueva categoría
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Son las que aparecen en el campo «Categoría» de la ficha del cliente. Una categoría que ya tiene clientes no se
          puede borrar: desactívala y dejará de ofrecerse, pero esos clientes la conservan.
        </p>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-28 text-right">Clientes</TableHead>
                  <TableHead className="w-24 text-center">Activa</TableHead>
                  {canEdit && <TableHead className="w-28" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id} className={c.is_active ? '' : 'opacity-60'}>
                    <TableCell className="font-medium">
                      {c.name}
                      {c.is_system && <Badge variant="outline" className="ml-2 text-[10px]">Sistema</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.clients_count.toLocaleString('es-ES')}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={c.is_active}
                        disabled={!canEdit || c.code === 'standard' || togglingId === c.id}
                        onCheckedChange={(v) => handleToggle(c, v)}
                        aria-label={`Activar ${c.name}`}
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRename(c)} title="Renombrar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!c.is_system && (
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                              onClick={() => setConfirmDelete(c)}
                              title={c.clients_count > 0 ? 'Tiene clientes: desactívala en su lugar' : 'Borrar'}
                              disabled={c.clients_count > 0}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Renombrar categoría' : 'Nueva categoría'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'El cambio de nombre se aplica a todos los clientes que la tienen.'
                : 'Aparecerá en el campo «Categoría» de los clientes.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="client-category-name">Nombre</Label>
            <Input
              id="client-category-name"
              value={formName}
              maxLength={60}
              autoFocus
              placeholder="Ej.: La fábrica"
              onChange={(e) => setFormName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-prats-navy hover:bg-prats-navy-light">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar «{confirmDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>No la tiene ningún cliente. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
