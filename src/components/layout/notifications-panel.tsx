'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Bell, CheckCheck, AlertTriangle, Truck, Package, CreditCard, Calendar, Loader2, ArrowRight, FileText } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { getDashboardAlerts } from '@/actions/dashboard'
import { getOverdueSupplierInvoicesCount } from '@/actions/supplier-invoices'
import { formatDateTime } from '@/lib/utils'

type UnifiedItem = {
  id: string
  type: 'alert' | 'notification'
  title: string
  message: string
  link: string
  date?: string
  isRead?: boolean
  icon: 'orders' | 'payments' | 'stock' | 'invoices' | 'payment_due' | 'info' | 'warning' | 'default'
  sortOrder: number
}

const iconMap: Record<string, UnifiedItem['icon']> = {
  order_update: 'orders',
  stock_alert: 'stock',
  payment_due: 'payment_due',
  appointment: 'info',
  success: 'default',
  info: 'info',
  warning: 'warning',
  error: 'warning',
  system: 'default',
}

const iconComponents: Record<UnifiedItem['icon'], React.ElementType> = {
  orders: Truck,
  payments: CreditCard,
  stock: Package,
  invoices: FileText,
  payment_due: CreditCard,
  info: Calendar,
  warning: AlertTriangle,
  default: Bell,
}

const iconColors: Record<UnifiedItem['icon'], string> = {
  orders: 'text-amber-600',
  payments: 'text-red-600',
  stock: 'text-orange-600',
  invoices: 'text-red-600',
  payment_due: 'text-amber-600',
  info: 'text-blue-600',
  warning: 'text-amber-600',
  default: 'text-muted-foreground',
}

export function NotificationsPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [alerts, setAlerts] = useState<{ ordersOverdue: number; overduePayments: number; lowStockCount: number } | null>(null)
  const [overdueInvoicesCount, setOverdueInvoicesCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!profile?.id) return
    setIsLoading(true)
    try {
      const [alertsRes, invoicesRes, { data }] = await Promise.all([
        getDashboardAlerts(),
        getOverdueSupplierInvoicesCount().catch(() => ({ success: false, data: 0 })),
        supabase.from('notifications').select('id, type, is_read, link, title, message, created_at, user_id').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
      ])
      if (alertsRes.success) setAlerts(alertsRes.data)
      if (invoicesRes?.success && typeof invoicesRes.data === 'number') setOverdueInvoicesCount(invoicesRes.data)
      if (data) setNotifications(data)
    } catch (err) {
      console.error('[NotificationsPanel] fetchData error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, profile?.id])

  useEffect(() => { if (open) fetchData() }, [open, fetchData])

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllAsRead = async () => {
    if (!profile?.id) return
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', profile.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const handleClick = (item: UnifiedItem) => {
    if (item.type === 'notification') markAsRead(item.id)
    if (item.link) {
      router.push(item.link)
      onOpenChange(false)
    }
  }

  const unifiedList = useMemo((): UnifiedItem[] => {
    const list: UnifiedItem[] = []
    let sortOrder = 0

    if (alerts) {
      if (alerts.ordersOverdue > 0) {
        list.push({
          id: 'alert-orders',
          type: 'alert',
          title: 'Pedidos con retraso',
          message: `${alerts.ordersOverdue} pedido${alerts.ordersOverdue > 1 ? 's' : ''} con fecha de entrega pasada. Revisa estado y comunica al cliente.`,
          link: '/admin/pedidos?status=overdue',
          isRead: false,
          icon: 'orders',
          sortOrder: sortOrder++,
        })
      }
      if (alerts.overduePayments > 0) {
        list.push({
          id: 'alert-payments',
          type: 'alert',
          title: 'Pagos a proveedor vencidos',
          message: `${alerts.overduePayments} pago${alerts.overduePayments > 1 ? 's' : ''} pendiente${alerts.overduePayments > 1 ? 's' : ''} con fecha de vencimiento pasada. Registra el pago en la ficha del proveedor.`,
          link: '/admin/proveedores',
          isRead: false,
          icon: 'payments',
          sortOrder: sortOrder++,
        })
      }
      if (overdueInvoicesCount > 0) {
        list.push({
          id: 'alert-invoices',
          type: 'alert',
          title: 'Facturas de proveedor vencidas',
          message: `${overdueInvoicesCount} factura${overdueInvoicesCount > 1 ? 's' : ''} con vencimiento pasado. Revisa en Contabilidad → Facturas proveedores y marca como pagadas si ya lo están.`,
          link: '/admin/contabilidad/facturas-proveedores',
          isRead: false,
          icon: 'invoices',
          sortOrder: sortOrder++,
        })
      }
      if (alerts.lowStockCount > 0) {
        list.push({
          id: 'alert-stock',
          type: 'alert',
          title: 'Stock bajo',
          message: `${alerts.lowStockCount} producto${alerts.lowStockCount > 1 ? 's' : ''} por debajo del mínimo. Revisa en Productos y Stock y repón o ajusta el mínimo.`,
          link: '/admin/stock',
          isRead: false,
          icon: 'stock',
          sortOrder: sortOrder++,
        })
      }
    }

    notifications.forEach(n => {
      list.push({
        id: n.id,
        type: 'notification',
        title: n.title,
        message: n.message || '',
        link: n.link || '#',
        date: n.created_at,
        isRead: n.is_read,
        icon: iconMap[n.type] || 'default',
        sortOrder: 1000 + list.length,
      })
    })

    return list.sort((a, b) => a.sortOrder - b.sortOrder)
  }, [alerts, overdueInvoicesCount, notifications])

  const unreadNotifications = notifications.filter(n => !n.is_read).length
  const badgeCount = unreadNotifications + (alerts?.ordersOverdue ?? 0) + (alerts?.overduePayments ?? 0) + (alerts?.lowStockCount ?? 0) + overdueInvoicesCount

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[420px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5" /> Notificaciones
              {badgeCount > 0 && <Badge variant="destructive" className="text-xs">{badgeCount > 99 ? '99+' : badgeCount}</Badge>}
            </SheetTitle>
            {unreadNotifications > 0 && (
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={markAllAsRead}>
                <CheckCheck className="h-3 w-3" /> Marcar leídas
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : unifiedList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Bell className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">Sin notificaciones</p>
              <p className="text-sm text-muted-foreground mt-1">Aquí aparecerán pedidos con retraso, vencimientos, stock bajo y avisos del sistema.</p>
            </div>
          ) : (
            <div className="divide-y">
              {unifiedList.map(item => {
                const Icon = iconComponents[item.icon]
                const color = iconColors[item.icon]
                const unread = item.type === 'alert' ? true : !item.isRead
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleClick(item)}
                    className={`flex gap-4 p-4 w-full text-left transition-colors hover:bg-muted/60 ${unread ? 'bg-amber-50/70' : ''}`}
                  >
                    <div className={`flex-shrink-0 mt-0.5 w-10 h-10 rounded-full flex items-center justify-center ${unread ? 'bg-amber-100' : 'bg-muted'} ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${unread ? 'text-foreground' : 'text-foreground'}`}>{item.title}</p>
                      <p className="text-sm text-muted-foreground mt-1 leading-snug">{item.message}</p>
                      {item.date && (
                        <p className="text-xs text-muted-foreground mt-2">{formatDateTime(item.date)}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {unread && <div className="h-2 w-2 rounded-full bg-amber-500" />}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
