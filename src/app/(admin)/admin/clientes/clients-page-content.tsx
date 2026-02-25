'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, MoreHorizontal, Eye, Pencil, UserX, Download, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useList } from '@/hooks/use-list'
import { usePermissions } from '@/hooks/use-permissions'
import { listClients, deleteClientAction } from '@/actions/clients'
import { getInitials, formatCurrency, formatDate } from '@/lib/utils'
import { CreateClientDialog } from './create-client-dialog'

const categoryColors: Record<string, string> = {
  standard: 'bg-gray-100 text-gray-700',
  vip: 'bg-amber-100 text-amber-700',
  premium: 'bg-purple-100 text-purple-700',
  gold: 'bg-yellow-100 text-yellow-800',
  ambassador: 'bg-prats-navy/10 text-prats-navy',
}

export function ClientsPageContent({ basePath = '/admin' }: { basePath?: string }) {
  const router = useRouter()
  const { can } = usePermissions()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const {
    data: clients, total, totalPages, page, setPage,
    search, setSearch, sortBy, sortOrder, toggleSort,
    filters, setFilters, isLoading, refresh, pageSize,
  } = useList(listClients, {
    pageSize: 25,
    defaultSort: 'created_at',
    defaultOrder: 'desc',
  })

  const applyCategory = (value: string) => {
    setCategoryFilter(value)
    setFilters(prev => ({
      ...prev,
      ...(value !== 'all' ? { category: value } : { category: undefined }),
    }))
  }

  const applyStatus = (value: string) => {
    setStatusFilter(value)
    setFilters(prev => ({
      ...prev,
      ...(value !== 'all' ? { is_active: value === 'active' } : { is_active: undefined }),
    }))
  }

  const handleDelete = async (clientId: string) => {
    if (!confirm('¿Desactivar este cliente? Podrás reactivarlo después.')) return
    const result = await deleteClientAction(clientId)
    if (result.success) { toast.success('Cliente desactivado'); refresh() }
    else toast.error(result.error)
  }

  const SortableHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-foreground' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">{total} clientes en total</p>
        </div>
        {can('clients.create') && (
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, email, teléfono, código..." className="pl-9" autoComplete="off"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={applyCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Categoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
            <SelectItem value="gold">Gold</SelectItem>
            <SelectItem value="ambassador">Embajador</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={applyStatus}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
        {can('clients.export') && (
          <Button variant="outline" size="sm" className="gap-1">
            <Download className="h-4 w-4" /> Exportar
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="full_name">Cliente</SortableHeader>
              <TableHead>Contacto</TableHead>
              <SortableHeader field="category">Categoría</SortableHeader>
              <SortableHeader field="total_spent">Total gastado</SortableHeader>
              <SortableHeader field="total_pending">Pendiente</SortableHeader>
              <SortableHeader field="purchase_count">Compras</SortableHeader>
              <SortableHeader field="created_at">Alta</SortableHeader>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full shrink-0" /><div className="space-y-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16" /></div></div></TableCell>
                  <TableCell><div className="space-y-1"><Skeleton className="h-3 w-36" /><Skeleton className="h-3 w-24" /></div></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
                </TableRow>
              ))
            ) : clients.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                {search ? 'No se encontraron clientes con esa búsqueda' : 'No hay clientes aún. Crea el primero.'}
              </TableCell></TableRow>
            ) : clients.map((client: any) => (
              <TableRow
                key={client.id}
                className={`cursor-pointer hover:bg-muted/50 ${!client.is_active ? 'opacity-50' : ''}`}
                onClick={() => router.push(`${basePath}/clientes/${client.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-prats-navy text-white text-xs">
                        {getInitials(client.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{client.full_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{client.client_code}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {client.email && <p className="text-muted-foreground">{client.email}</p>}
                    {client.phone && <p className="text-muted-foreground">{client.phone}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs ${categoryColors[client.category] || categoryColors.standard}`}>
                    {client.category === 'standard' ? 'Estándar' : client.category?.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{formatCurrency(client.total_spent)}</TableCell>
                <TableCell>
                  <span className={client.total_pending > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                    {formatCurrency(client.total_pending)}
                  </span>
                </TableCell>
                <TableCell className="text-center">{client.purchase_count || 0}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(client.created_at)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`${basePath}/clientes/${client.id}`)}>
                        <Eye className="mr-2 h-4 w-4" /> Ver ficha
                      </DropdownMenuItem>
                      {can('clients.edit') && (
                        <DropdownMenuItem onClick={() => router.push(`${basePath}/clientes/${client.id}?tab=datos`)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                      )}
                      {can('clients.delete') && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(client.id)} className="text-destructive">
                            <UserX className="mr-2 h-4 w-4" /> Desactivar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} de {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateClientDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={refresh} />
    </div>
  )
}
