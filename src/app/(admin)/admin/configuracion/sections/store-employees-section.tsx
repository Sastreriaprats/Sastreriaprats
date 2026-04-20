'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Save, Search, Users, Store as StoreIcon, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useStores } from '@/hooks/use-cached-queries'
import {
  listAvailableEmployees,
  listStoreEmployees,
  setStoreEmployees,
} from '@/actions/store-employees'

interface Employee {
  id: string
  full_name: string
  email: string
}

export function StoreEmployeesSection() {
  const { data: storesData } = useStores()
  const stores = useMemo(
    () => (storesData ?? []).map((s) => ({ id: s.id, name: s.name, code: s.code })),
    [storesData],
  )

  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [originalAssignedIds, setOriginalAssignedIds] = useState<Set<string>>(new Set())
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(stores[0].id)
    }
  }, [stores, selectedStoreId])

  useEffect(() => {
    let cancelled = false
    setLoadingEmployees(true)
    listAvailableEmployees()
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          toast.error(res.error)
          setEmployees([])
        } else {
          setEmployees(res.data ?? [])
        }
      })
      .finally(() => !cancelled && setLoadingEmployees(false))
    return () => {
      cancelled = true
    }
  }, [])

  const loadAssignments = useCallback(async (storeId: string) => {
    if (!storeId) return
    setLoadingAssignments(true)
    try {
      const res = await listStoreEmployees(storeId)
      if (res.error) {
        toast.error(res.error)
        setAssignedIds(new Set())
        setOriginalAssignedIds(new Set())
      } else {
        const ids = new Set(res.data ?? [])
        setAssignedIds(ids)
        setOriginalAssignedIds(new Set(ids))
      }
    } finally {
      setLoadingAssignments(false)
    }
  }, [])

  useEffect(() => {
    if (selectedStoreId) loadAssignments(selectedStoreId)
  }, [selectedStoreId, loadAssignments])

  const toggleEmployee = (userId: string, checked: boolean) => {
    setAssignedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(userId)
      else next.delete(userId)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    if (checked) setAssignedIds(new Set(employees.map((e) => e.id)))
    else setAssignedIds(new Set())
  }

  const hasChanges = useMemo(() => {
    if (assignedIds.size !== originalAssignedIds.size) return true
    for (const id of assignedIds) if (!originalAssignedIds.has(id)) return true
    return false
  }, [assignedIds, originalAssignedIds])

  const handleSave = async () => {
    if (!selectedStoreId) return
    setSaving(true)
    try {
      const res = await setStoreEmployees(selectedStoreId, [...assignedIds])
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Empleados actualizados')
        setOriginalAssignedIds(new Set(assignedIds))
      }
    } finally {
      setSaving(false)
    }
  }

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q),
    )
  }, [employees, search])

  const allFilteredSelected =
    filteredEmployees.length > 0 &&
    filteredEmployees.every((e) => assignedIds.has(e.id))

  const selectedStore = stores.find((s) => s.id === selectedStoreId)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Empleados por tienda</h2>
        <p className="text-sm text-muted-foreground">
          Selecciona qué empleados aparecerán en el desplegable de vendedor del TPV para cada tienda.
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="flex gap-3 py-4 text-sm text-blue-900">
          <Info className="h-5 w-5 shrink-0 text-blue-600" />
          <p>
            Si una tienda <strong>no tiene ningún empleado seleccionado</strong>,
            en el TPV de esa tienda se mostrarán <strong>todos los empleados activos</strong>.
            Selecciona al menos un empleado para activar el filtrado.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <StoreIcon className="h-4 w-4" /> Tienda
              </CardTitle>
              <CardDescription>Elige la tienda que deseas configurar</CardDescription>
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Selecciona una tienda" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.code ? `(${s.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {selectedStore && (
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" /> {assignedIds.size} asignados
                </Badge>
              )}
              <Button
                onClick={handleSave}
                disabled={!selectedStoreId || !hasChanges || saving}
                className="gap-2 bg-prats-navy hover:bg-prats-navy/90"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empleado..."
                className="pl-8"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={(c) => toggleAll(!!c)}
                disabled={loadingEmployees || loadingAssignments}
              />
              <span>Seleccionar todos</span>
            </label>
          </div>

          {loadingEmployees || loadingAssignments ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando empleados...
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No hay empleados que coincidan con la búsqueda.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEmployees.map((emp) => {
                const checked = assignedIds.has(emp.id)
                return (
                  <label
                    key={emp.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/50 ${
                      checked ? 'border-prats-navy/40 bg-prats-navy/5' : ''
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggleEmployee(emp.id, !!c)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{emp.full_name}</p>
                      {emp.email && (
                        <p className="truncate text-xs text-muted-foreground">{emp.email}</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
