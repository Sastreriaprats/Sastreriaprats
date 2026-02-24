'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Bell, CheckCheck, AlertTriangle, Truck, Package, CreditCard, Calendar, Loader2, ArrowRight } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { getDashboardAlerts } from '@/actions/dashboard'
import { formatDateTime } from '@/lib/utils'

const typeIcons: Record<string, React.ElementType> = {
  order_update: AlertTriangle,
  stock_alert: Package,
  payment_due: CreditCard,
  appointment: Calendar,
  success: Truck,
  info: Bell,
  warning: AlertTriangle,
  error: AlertTriangle,
  system: Bell,
}

const typeColors: Record<string, string> = {
  order_update: 'text-red-500',
  stock_alert: 'text-orange-500',
  payment_due: 'text-amber-500',
  appointment: 'text-purple-500',
  success: 'text-green-500',
  info: 'text-blue-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
  system: 'text-blue-500',
}

export function NotificationsPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const supabase = createClient()
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [alerts, setAlerts] = useState<{ ordersOverdue: number; overduePayments: number; lowStockCount: number } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return
    setIsLoading(true)
    try {
      const [alertsRes, { data }] = await Promise.all([
        getDashboardAlerts(),
        supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
      ])
      if (alertsRes.success) setAlerts(alertsRes.data)
      if (data) setNotifications(data)
    } catch (err) {
      console.error('[NotificationsPanel] fetchNotifications error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, profile?.id])

  useEffect(() => { if (open) fetchNotifications() }, [open, fetchNotifications])

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

  const handleClick = (notification: any) => {
    markAsRead(notification.id)
    if (notification.link) {
      router.push(notification.link)
      onOpenChange(false)
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length
  const alertsTotal = alerts ? alerts.ordersOverdue + alerts.overduePayments + alerts.lowStockCount : 0
  const badgeCount = unreadCount + alertsTotal

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" /> Alertas y notificaciones
              {badgeCount > 0 && <Badge variant="destructive" className="text-xs">{badgeCount > 99 ? '99+' : badgeCount}</Badge>}
            </SheetTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={markAllAsRead}>
                <CheckCheck className="h-3 w-3" /> Marcar leídas
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <>
              {/* Alertas del dashboard */}
              {alerts && alertsTotal > 0 && (
                <div className="p-4 border-b bg-amber-50/50">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Alertas
                  </p>
                  <ul className="space-y-2">
                    {alerts.ordersOverdue > 0 && (
                      <li>
                        <button type="button" onClick={() => { router.push('/admin/pedidos?status=overdue'); onOpenChange(false) }} className="text-sm text-amber-800 hover:underline flex items-center gap-2 w-full text-left">
                          {alerts.ordersOverdue} pedido{alerts.ordersOverdue > 1 ? 's' : ''} con retraso
                          <ArrowRight className="h-3 w-3 shrink-0" />
                        </button>
                      </li>
                    )}
                    {alerts.overduePayments > 0 && (
                      <li>
                        <button type="button" onClick={() => { router.push('/admin/proveedores'); onOpenChange(false) }} className="text-sm text-amber-800 hover:underline flex items-center gap-2 w-full text-left">
                          {alerts.overduePayments} pago{alerts.overduePayments > 1 ? 's' : ''} a proveedor vencido{alerts.overduePayments > 1 ? 's' : ''}
                          <ArrowRight className="h-3 w-3 shrink-0" />
                        </button>
                      </li>
                    )}
                    {alerts.lowStockCount > 0 && (
                      <li>
                        <button type="button" onClick={() => { router.push('/admin/stock'); onOpenChange(false) }} className="text-sm text-amber-800 hover:underline flex items-center gap-2 w-full text-left">
                          {alerts.lowStockCount} producto{alerts.lowStockCount > 1 ? 's' : ''} con stock bajo
                          <ArrowRight className="h-3 w-3 shrink-0" />
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Notificaciones */}
              <div className="py-2">
                <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notificaciones</p>
                {notifications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="mx-auto h-10 w-10 mb-3 opacity-20" />
                    <p className="text-sm">Sin notificaciones</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {notifications.map(n => {
                const Icon = typeIcons[n.type] || Bell
                const color = typeColors[n.type] || 'text-muted-foreground'
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/50 ${!n.is_read ? 'bg-blue-50/50' : ''}`}
                    onClick={() => handleClick(n)}
                  >
                    <div className={`flex-shrink-0 mt-0.5 ${color}`}><Icon className="h-5 w-5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? 'font-medium' : ''}`}>{n.title}</p>
                      {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.created_at)}</p>
                    </div>
                    {!n.is_read && <div className="flex-shrink-0"><div className="h-2 w-2 rounded-full bg-blue-500 mt-2" /></div>}
                  </div>
                )
              })}
                  </div>
                )}
              </div>
            </>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
