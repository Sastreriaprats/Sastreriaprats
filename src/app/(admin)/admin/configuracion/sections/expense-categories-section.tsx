'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Plus, Pencil, Trash2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import {
  listExpenseCategoriesAdmin,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  type ExpenseCategoryAdmin,
} from '@/actions/expense-categories'

/**
 * Categorías de gasto de las facturas de proveedor (mig 295): las que se ponen a
 * cada factura desde el informe para socios. Una categoría con facturas no se
 * borra: se desactiva (deja de ofrecerse, pero las facturas la conservan).
 */
export function ExpenseCategoriesSection() {
  const { can } = usePermissions()
  const canEdit = can('supplier_invoices.manage')
  const queryClient = useQueryClient()

  const [items, setItems] = useState<ExpenseCategoryAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ExpenseCategoryAdmin | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ExpenseCategoryAdmin | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listExpenseCategoriesAdmin()
    setLoading(false)
    if (res.success) setItems(res.data)
    else toast.error(res.error)
  }, [])

  useEffect(() => { load() }, [load])

  // Los desplegables del informe leen el catálogo con react-query: tras cada
  // cambio se invalida para que la nueva categoría aparezca sin recargar.
  const refreshAll = async () => {
    await load()
    await queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
  }

  const openCreate = () => { setEditing(null); setFormName(''); setShowForm(true) }
  const openRename = (c: ExpenseCategoryAdmin) => { setEditing(c); setFormName(c.name); setShowForm(true) }

  const handleSave = async () => {
    const name = formName.trim()
    if (!name) { toast.error('Escribe un nombre'); return }
    setSaving(true)
    const res = editing
      ? await updateExpenseCategory({ id: editing.id, name })
      : await createExpenseCategory({ name })
    setSaving(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success(editing ? 'Categoría renombrada' : 'Categoría creada')
    setShowForm(false)
    await refreshAll()
  }

  const handleToggle = async (c: ExpenseCategoryAdmin, active: boolean) => {
    setTogglingId(c.id)
    const res = await updateExpenseCategory({ id: c.id, is_active: active })
    setTogglingId(null)
    if (!res.success) { toast.error(res.error); return }
    toast.success(active ? 'Categoría activada' : 'Categoría desactivada')
    await refreshAll()
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const res = await deleteExpenseCategory(confirmDelete.id)
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
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Categorías de gasto</CardTitle>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate} className="gap-1 bg-prats-navy hover:bg-prats-navy-light">
            <Plus className="h-4 w-4" /> Nueva categoría
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Son las que se ponen a cada factura de proveedor en Informes → Socios, para ver los gastos desglosados. Una
          categoría que ya tiene facturas no se puede borrar: desactívala y dejará de ofrecerse, pero esas facturas la
          conservan.
        </p>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-28 text-right">Facturas</TableHead>
                  <TableHead className="w-24 text-center">Activa</TableHead>
                  {canEdit && <TableHead className="w-28" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id} className={c.is_active ? '' : 'opacity-60'}>
                    <TableCell className="font-medium">
                      {c.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.invoices_count.toLocaleString('es-ES')}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={c.is_active}
                        disabled={!canEdit || togglingId === c.id}
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
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => setConfirmDelete(c)}
                            title={c.invoices_count > 0 ? 'Tiene facturas: desactívala en su lugar' : 'Borrar'}
                            disabled={c.invoices_count > 0}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                ? 'El cambio de nombre se aplica a todas las facturas que la tienen.'
                : 'Se podrá poner a las facturas de proveedor desde el informe para socios.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="expense-category-name">Nombre</Label>
            <Input
              id="expense-category-name"
              value={formName}
              maxLength={60}
              autoFocus
              placeholder="Ej.: Mantenimiento"
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
            <AlertDialogDescription>No la tiene ninguna factura. Esta acción no se puede deshacer.</AlertDialogDescription>
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
