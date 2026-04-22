'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Search, Loader2, Store as StoreIcon, Shirt, User as UserIcon, ChevronRight, X } from 'lucide-react'
import { listClients } from '@/actions/clients'
import { useStores } from '@/hooks/use-cached-queries'
import { NuevaVentaFichaClient } from '@/app/(sastre)/sastre/nueva-venta/ficha/nueva-venta-ficha-client'
import { toast } from 'sonner'

type OrderType = 'artesanal' | 'industrial' | 'camiseria' | 'camiseria_industrial'

const ORDER_TYPE_OPTIONS: Array<{ value: OrderType; label: string; description: string }> = [
  { value: 'artesanal', label: 'Artesanal', description: 'Pedido confeccionado a medida en taller propio' },
  { value: 'industrial', label: 'Industrial', description: 'Pedido industrial (fábrica externa)' },
  { value: 'camiseria', label: 'Camisería', description: 'Camisería a medida' },
  { value: 'camiseria_industrial', label: 'Camisería industrial', description: 'Camisas producidas en fábrica' },
]

type ClientRow = {
  id: string
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
  client_code?: string | null
}

export function AdminNewOrderWizard() {
  const router = useRouter()
  const { data: storesData } = useStores()
  const physicalStores = (storesData ?? []).filter((s: any) => s.store_type !== 'online').map((s: any) => ({ id: s.id, name: s.name, code: s.code }))

  // Setup state
  const [orderType, setOrderType] = useState<OrderType | ''>('')
  const [storeId, setStoreId] = useState<string>('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientLabel, setClientLabel] = useState<string>('')
  const [clientQuery, setClientQuery] = useState<string>('')
  const [clientResults, setClientResults] = useState<ClientRow[]>([])
  const [clientSearching, setClientSearching] = useState(false)

  // Step: 'setup' | 'ficha'
  const [step, setStep] = useState<'setup' | 'ficha'>('setup')

  // Búsqueda de clientes con debounce
  useEffect(() => {
    const q = clientQuery.trim()
    if (q.length < 2) { setClientResults([]); return }
    let cancelled = false
    setClientSearching(true)
    const t = setTimeout(() => {
      listClients({ search: q, pageSize: 10 })
        .then((res) => {
          if (cancelled) return
          if (res.success) {
            const payload = res.data as any
            const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
            setClientResults(rows as ClientRow[])
          }
        })
        .finally(() => { if (!cancelled) setClientSearching(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [clientQuery])

  const canContinue = orderType && storeId && clientId

  const handleContinue = () => {
    if (!canContinue) {
      toast.error('Selecciona tipo, cliente y tienda')
      return
    }
    setStep('ficha')
  }

  const handleOrderCreated = (orderId: string) => {
    toast.success('Pedido creado')
    router.push(`/admin/pedidos/${orderId}`)
  }

  // Breadcrumb header reutilizado en ambos steps
  const Header = () => (
    <div className="space-y-2">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin/pedidos" className="hover:text-foreground transition-colors">Pedidos y Reservas</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Nuevo pedido</span>
      </nav>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo pedido</h1>
        <Link href="/admin/pedidos">
          <Button variant="ghost" size="sm" className="gap-1">
            <X className="h-4 w-4" /> Cerrar
          </Button>
        </Link>
      </div>
    </div>
  )

  if (step === 'ficha' && orderType && storeId && clientId) {
    return (
      <div className="min-h-screen bg-[#0a1020]">
        {/* Mini header admin con botón volver al setup */}
        <div className="max-w-4xl mx-auto pt-6 px-6">
          <div className="flex items-center justify-between mb-4">
            <nav className="flex items-center gap-1 text-sm text-white/50">
              <Link href="/admin/pedidos" className="hover:text-white transition-colors">Pedidos y Reservas</Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <button type="button" onClick={() => setStep('setup')} className="hover:text-white transition-colors">
                Nuevo pedido
              </button>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-white font-medium">Ficha</span>
            </nav>
            <Link href="/admin/pedidos">
              <Button variant="ghost" size="sm" className="gap-1 text-white/70 hover:text-white hover:bg-white/10">
                <X className="h-4 w-4" /> Cancelar
              </Button>
            </Link>
          </div>
        </div>
        <NuevaVentaFichaClient
          clientId={clientId}
          tipo={orderType}
          orderType={orderType}
          defaultStoreId={storeId}
          sastreName="Admin"
          onCreated={handleOrderCreated}
          onBack={() => setStep('setup')}
          backLabel="Cambiar datos"
        />
      </div>
    )
  }

  // Setup step
  return (
    <div className="space-y-6 max-w-3xl mx-auto py-6">
      <Header />

      {/* Tipo de pedido */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shirt className="h-5 w-5 text-prats-navy" />
          <h2 className="font-semibold">Tipo de pedido</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ORDER_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOrderType(opt.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                orderType === opt.value
                  ? 'border-prats-navy bg-prats-navy/5 ring-2 ring-prats-navy/30'
                  : 'border-border hover:border-prats-navy/50 hover:bg-muted/50'
              }`}
            >
              <p className="font-semibold text-sm">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Cliente */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-prats-navy" />
          <h2 className="font-semibold">Cliente</h2>
        </div>
        {clientId ? (
          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{clientLabel}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setClientId(null); setClientLabel(''); setClientQuery('') }} className="gap-1">
              <X className="h-3 w-3" /> Cambiar
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar cliente por nombre, email, teléfono o código..."
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
              />
              {clientSearching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {clientResults.length > 0 && (
              <div className="rounded-md border max-h-60 overflow-y-auto">
                {clientResults.map((c) => {
                  const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted border-b last:border-b-0 flex items-center justify-between gap-2"
                      onClick={() => { setClientId(c.id); setClientLabel(name); setClientQuery(''); setClientResults([]) }}
                    >
                      <span className="font-medium">{name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.client_code || c.phone || c.email || ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex justify-end">
              <Link href="/admin/clientes?new=1" target="_blank" rel="noopener noreferrer">
                <Button variant="link" size="sm" className="text-prats-navy">
                  + Crear cliente nuevo en otra pestaña
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Card>

      {/* Tienda */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <StoreIcon className="h-5 w-5 text-prats-navy" />
          <h2 className="font-semibold">Tienda</h2>
        </div>
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar tienda..." />
          </SelectTrigger>
          <SelectContent>
            {physicalStores.map((s: { id: string; name: string; code: string }) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {s.code ? <span className="text-muted-foreground ml-1">({s.code})</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          La tienda determina el número de pedido y el almacén donde se descuentan los complementos boutique.
        </p>
      </Card>

      {/* Botones */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Link href="/admin/pedidos">
          <Button variant="outline" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
        <Button
          onClick={handleContinue}
          disabled={!canContinue}
          className="gap-1 bg-prats-navy hover:bg-prats-navy-light"
        >
          Continuar a la ficha <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center pt-4">
        Nota: el flujo de ficha completo incluye las opciones avanzadas (medidas de camisería, entrega a cuenta si hay caja abierta, complementos, etc.).
      </p>
    </div>
  )
}
