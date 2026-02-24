'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Loader2, Search, Check, User, Shirt,
  Factory, Package, UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAction } from '@/hooks/use-action'
import { useAuth } from '@/components/providers/auth-provider'
import { createOrderAction } from '@/actions/orders'
import { formatCurrency } from '@/lib/utils'

type OrderType = 'artesanal' | 'industrial' | 'proveedor' | 'oficial'

interface OrderLine {
  garment_type_id: string
  garment_name: string
  line_type: 'artesanal' | 'industrial'
  configuration: Record<string, any>
  fabric_id: string | null
  fabric_description: string
  fabric_meters: number
  supplier_id: string | null
  unit_price: number
  discount_percentage: number
  tax_rate: number
  material_cost: number
  labor_cost: number
  factory_cost: number
  model_name: string
  model_size: string
  finishing_notes: string
  measurement_id: string | null
  official_id: string | null
  official_name: string
}

const TYPE_CARDS: { type: OrderType; label: string; description: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'artesanal', label: 'Pedido de cliente artesanal', description: 'Confección en sastrería o con oficial', bg: 'bg-blue-50', border: 'border-blue-300', icon: Shirt },
  { type: 'industrial', label: 'Pedido de cliente industrial', description: 'Envío a fábrica con tela y medidas', bg: 'bg-orange-50', border: 'border-orange-300', icon: Factory },
  { type: 'proveedor', label: 'Pedido a proveedor', description: 'Compra de telas o materiales', bg: 'bg-yellow-50', border: 'border-yellow-300', icon: Package },
  { type: 'oficial', label: 'Pedido a oficial', description: 'Encargo de confección a oficial externo', bg: 'bg-green-50', border: 'border-green-300', icon: UserCheck },
]

function getRecipientType(orderType: OrderType): 'client' | 'supplier' | 'official' | 'factory' {
  switch (orderType) {
    case 'artesanal': return 'client'
    case 'industrial': return 'factory'
    case 'proveedor': return 'supplier'
    case 'oficial': return 'official'
    default: return 'client'
  }
}

function getTotalSteps(orderType: OrderType): number {
  switch (orderType) {
    case 'artesanal':
    case 'industrial':
    case 'oficial':
      return 3
    case 'proveedor':
      return 2
    default: return 3
  }
}

export function CreateOrderWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { activeStoreId } = useAuth()
  const clientIdFromUrl = searchParams.get('clientId')

  const [orderType, setOrderType] = useState<OrderType | null>(null)
  const [step, setStep] = useState(0)

  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [isSearchingClient, setIsSearchingClient] = useState(false)

  const [officialSearch, setOfficialSearch] = useState('')
  const [officialResults, setOfficialResults] = useState<any[]>([])
  const [selectedOfficial, setSelectedOfficial] = useState<any>(null)
  const [isSearchingOfficial, setIsSearchingOfficial] = useState(false)

  const [parentOrderSearch, setParentOrderSearch] = useState('')
  const [parentOrderResults, setParentOrderResults] = useState<any[]>([])
  const [selectedParentOrder, setSelectedParentOrder] = useState<any>(null)
  const [isSearchingParentOrder, setIsSearchingParentOrder] = useState(false)

  const [estimatedDelivery, setEstimatedDelivery] = useState('')
  const [alertOnDelivery, setAlertOnDelivery] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState<'store' | 'home'>('store')
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [internalNotes, setInternalNotes] = useState('')
  const [clientNotes, setClientNotes] = useState('')

  const [supplierName, setSupplierName] = useState('')
  const [orderDescription, setOrderDescription] = useState('')
  const [fabricToSend, setFabricToSend] = useState('')
  const [measuresNotes, setMeasuresNotes] = useState('')
  const [garmentDescription, setGarmentDescription] = useState('')
  const [agreedPrice, setAgreedPrice] = useState<number>(0)

  const [factorySearch, setFactorySearch] = useState('')
  const [factoryResults, setFactoryResults] = useState<any[]>([])
  const [selectedFactory, setSelectedFactory] = useState<any>(null)
  const [isSearchingFactory, setIsSearchingFactory] = useState(false)

  const [lines, setLines] = useState<OrderLine[]>([])
  const [garmentTypes, setGarmentTypes] = useState<any[]>([])
  const [fabrics, setFabrics] = useState<any[]>([])
  const [showAddLine, setShowAddLine] = useState(false)
  const [lineForm, setLineForm] = useState<Partial<OrderLine>>({
    garment_type_id: '', line_type: 'artesanal', unit_price: 0, discount_percentage: 0,
    tax_rate: 21, material_cost: 0, labor_cost: 0, factory_cost: 0,
    fabric_description: '', fabric_meters: 0, model_name: '', model_size: '', finishing_notes: '',
    configuration: {}, official_id: null, official_name: '',
  })

  const [lineOfficialSearch, setLineOfficialSearch] = useState('')
  const [lineOfficialResults, setLineOfficialResults] = useState<any[]>([])
  const [isSearchingLineOfficial, setIsSearchingLineOfficial] = useState(false)

  useEffect(() => {
    supabase.from('garment_types').select('id, code, name, category').eq('is_active', true).neq('code', 'body').order('sort_order')
      .then(({ data }) => { if (data) setGarmentTypes(data) })
    supabase.from('fabrics').select('id, fabric_code, name, composition, color_name, price_per_meter, supplier_id')
      .eq('status', 'available').order('name')
      .then(({ data }) => { if (data) setFabrics(data) })
  }, [supabase])

  useEffect(() => {
    if (!clientIdFromUrl) return
    supabase.from('clients')
      .select('id, client_code, full_name, email, phone, category, discount_percentage')
      .eq('id', clientIdFromUrl)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSelectedClient(data)
          setOrderType('artesanal')
          setStep(1)
        }
      })
  }, [clientIdFromUrl, supabase])

  useEffect(() => {
    if (clientSearch.length < 2) { setClientResults([]); return }
    const t = setTimeout(async () => {
      setIsSearchingClient(true)
      const { data } = await supabase.from('clients')
        .select('id, client_code, full_name, email, phone, category, discount_percentage')
        .or(`full_name.ilike.%${clientSearch}%,email.ilike.%${clientSearch}%,phone.ilike.%${clientSearch}%,client_code.ilike.%${clientSearch}%`)
        .eq('is_active', true).limit(10)
      if (data) setClientResults(data)
      setIsSearchingClient(false)
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch, supabase])

  useEffect(() => {
    if (officialSearch.length < 2) { setOfficialResults([]); return }
    const t = setTimeout(async () => {
      setIsSearchingOfficial(true)
      const { data } = await supabase.from('officials')
        .select('id, name, phone, email, specialty, price_per_garment')
        .or(`name.ilike.%${officialSearch}%,email.ilike.%${officialSearch}%,phone.ilike.%${officialSearch}%`)
        .eq('is_active', true).limit(10)
      if (data) setOfficialResults(data)
      setIsSearchingOfficial(false)
    }, 300)
    return () => clearTimeout(t)
  }, [officialSearch, supabase])

  useEffect(() => {
    if (parentOrderSearch.length < 2) { setParentOrderResults([]); return }
    const t = setTimeout(async () => {
      setIsSearchingParentOrder(true)
      const { data } = await supabase.from('tailoring_orders')
        .select('id, order_number, order_type, clients(full_name)')
        .eq('order_type', 'artesanal')
        .ilike('order_number', `%${parentOrderSearch}%`)
        .limit(10)
      if (data) setParentOrderResults(data)
      setIsSearchingParentOrder(false)
    }, 300)
    return () => clearTimeout(t)
  }, [parentOrderSearch, supabase])

  useEffect(() => {
    if (lineOfficialSearch.length < 2) { setLineOfficialResults([]); setIsSearchingLineOfficial(false); return }
    const timeout = setTimeout(async () => {
      setIsSearchingLineOfficial(true)
      const { data, error } = await supabase
        .from('officials')
        .select('id, name, specialty')
        .ilike('name', `%${lineOfficialSearch}%`)
        .eq('is_active', true)
        .limit(10)
      console.log('LINE OFFICIAL SEARCH:', { data, error, search: lineOfficialSearch })
      if (data) setLineOfficialResults(data)
      setIsSearchingLineOfficial(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [lineOfficialSearch])

  useEffect(() => {
    if (factorySearch.length < 2) { setFactoryResults([]); return }
    const timeout = setTimeout(async () => {
      setIsSearchingFactory(true)
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, contact_email, contact_phone, supplier_types')
        .ilike('name', `%${factorySearch}%`)
        .eq('is_active', true)
        .limit(10)
      console.log('FACTORY SEARCH:', { data, error, search: factorySearch })
      if (data) setFactoryResults(data)
      setIsSearchingFactory(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [factorySearch])

  useEffect(() => {
    if (selectedClient?.discount_percentage != null) setDiscountPercentage(selectedClient.discount_percentage)
  }, [selectedClient])

  const subtotal = lines.reduce((sum, l) => {
    const lineDiscount = l.unit_price * (l.discount_percentage / 100)
    return sum + (l.unit_price - lineDiscount)
  }, 0)
  const orderDiscount = subtotal * (discountPercentage / 100)
  const taxableAmount = subtotal - orderDiscount
  const taxAmount = taxableAmount * 0.21
  const total = taxableAmount + taxAmount
  const totalCost = lines.reduce((sum, l) => sum + l.material_cost + l.labor_cost + l.factory_cost, 0)
  const margin = total > 0 ? ((total - totalCost) / total * 100) : 0

  const addLine = (keepOpen = false) => {
    const garment = garmentTypes.find((g: any) => g.id === lineForm.garment_type_id)
    if (!garment) { toast.error('Selecciona un tipo de prenda'); return }
    if (!lineForm.unit_price || lineForm.unit_price <= 0) { toast.error('Indica el precio'); return }
    const currentGarmentId = lineForm.garment_type_id
    setLines(prev => [...prev, {
      garment_type_id: lineForm.garment_type_id!,
      garment_name: garment.name,
      line_type: (lineForm.line_type as 'artesanal' | 'industrial') || 'artesanal',
      configuration: lineForm.configuration || {},
      fabric_id: lineForm.fabric_id || null,
      fabric_description: lineForm.fabric_description || '',
      fabric_meters: lineForm.fabric_meters || 0,
      supplier_id: lineForm.supplier_id || null,
      unit_price: lineForm.unit_price || 0,
      discount_percentage: lineForm.discount_percentage || 0,
      tax_rate: lineForm.tax_rate || 21,
      material_cost: lineForm.material_cost || 0,
      labor_cost: lineForm.labor_cost || 0,
      factory_cost: lineForm.factory_cost || 0,
      model_name: lineForm.model_name || '',
      model_size: lineForm.model_size || '',
      finishing_notes: lineForm.finishing_notes || '',
      measurement_id: null,
      official_id: lineForm.official_id || null,
      official_name: lineForm.official_name || '',
    }])
    if (!keepOpen) setShowAddLine(false)
    setLineForm({
      garment_type_id: keepOpen ? currentGarmentId : '',
      line_type: orderType === 'artesanal' || orderType === 'industrial' ? orderType : 'artesanal',
      unit_price: 0, discount_percentage: 0, tax_rate: 21, material_cost: 0, labor_cost: 0, factory_cost: 0,
      fabric_description: '', fabric_meters: 0, model_name: '', model_size: '', finishing_notes: '', configuration: {},
      official_id: null, official_name: '',
    })
  }

  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx))

  const { execute: submitOrder, isLoading: isSubmitting } = useAction(createOrderAction, {
    successMessage: 'Pedido creado correctamente',
    onSuccess: (data: any) => router.push(`/admin/pedidos/${data.id}`),
  })

  const buildOrderPayload = () => {
    if (!activeStoreId || !orderType) return null
    const recipient_type = getRecipientType(orderType)
    const recipient_name = orderType === 'proveedor' ? supplierName
      : orderType === 'oficial' ? (selectedOfficial?.name ?? null)
      : orderType === 'industrial' ? (selectedFactory?.name ?? null)
      : null
    let internal = internalNotes || null
    if (orderType === 'industrial' && (fabricToSend || measuresNotes)) {
      internal = [internalNotes, fabricToSend && `Tela a enviar: ${fabricToSend}`, measuresNotes && `Medidas: ${measuresNotes}`].filter(Boolean).join('\n') || null
    }
    if (orderType === 'oficial' && (garmentDescription || agreedPrice)) {
      internal = [internalNotes, garmentDescription && `Prenda: ${garmentDescription}`, agreedPrice ? `Precio acordado: ${agreedPrice}€` : ''].filter(Boolean).join('\n') || null
    }
    if (orderType === 'proveedor' && orderDescription) {
      internal = [internalNotes, orderDescription].filter(Boolean).join('\n') || null
    }
    return {
      order: {
        order_type: orderType,
        client_id: selectedClient?.id ?? null,
        official_id: selectedOfficial?.id ?? null,
        recipient_type,
        recipient_name: recipient_name || null,
        parent_order_id: selectedParentOrder?.id ?? null,
        store_id: activeStoreId,
        estimated_delivery_date: estimatedDelivery || null,
        alert_on_delivery: alertOnDelivery,
        delivery_method: deliveryMethod,
        discount_percentage: discountPercentage,
        internal_notes: internal,
        client_notes: clientNotes || null,
      },
      lines: orderType === 'artesanal' ? lines.map(l => ({
        garment_type_id: l.garment_type_id,
        line_type: l.line_type,
        configuration: l.configuration,
        fabric_id: l.fabric_id,
        fabric_description: l.fabric_description,
        fabric_meters: l.fabric_meters || null,
        supplier_id: l.supplier_id,
        unit_price: l.unit_price,
        discount_percentage: l.discount_percentage,
        tax_rate: l.tax_rate,
        material_cost: l.material_cost,
        labor_cost: l.labor_cost,
        factory_cost: l.factory_cost,
        model_name: l.model_name || null,
        model_size: l.model_size || null,
        finishing_notes: l.finishing_notes || null,
        measurement_id: l.measurement_id,
        official_id: l.official_id,
      })) : [],
    }
  }

  const handleSubmit = () => {
    if (orderType === 'artesanal' && lines.length === 0) {
      toast.error('Añade al menos una prenda')
      return
    }
    if (orderType === 'industrial' && !selectedClient?.id) {
      toast.error('Selecciona un cliente')
      return
    }
    if (orderType === 'industrial' && !selectedFactory?.id) {
      toast.error('Selecciona un fabricante')
      return
    }
    if (orderType === 'oficial' && !selectedOfficial?.id) {
      toast.error('Selecciona un oficial')
      return
    }
    const payload = buildOrderPayload()
    if (!payload) return
    submitOrder(payload)
  }

  const totalSteps = orderType ? getTotalSteps(orderType) : 0
  const isConfirmStep = orderType && step === totalSteps

  if (orderType === null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/pedidos')}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">Nuevo pedido</h1>
            <p className="text-muted-foreground">Elige el tipo de pedido</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TYPE_CARDS.map(({ type, label, description, bg, border, icon: Icon }) => (
            <Card
              key={type}
              className={`cursor-pointer transition-all hover:shadow-md ${bg} border-2 ${border}`}
              onClick={() => { setOrderType(type); setStep(1) }}
            >
              <CardHeader>
                <Icon className="h-10 w-10 mb-2" />
                <CardTitle className="text-lg">{label}</CardTitle>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => step === 1 ? setOrderType(null) : setStep(step - 1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nuevo pedido — {TYPE_CARDS.find(c => c.type === orderType)?.label}</h1>
          <p className="text-muted-foreground">Paso {step} de {totalSteps}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => {
          let label = `Paso ${n}`
          if (orderType === 'artesanal') label = n === 1 ? 'Cliente / Oficial' : n === 2 ? 'Detalles' : 'Prendas'
          if (orderType === 'industrial') label = n === 1 ? 'Cliente' : n === 2 ? 'Detalles' : 'Confirmar'
          if (orderType === 'proveedor') label = n === 1 ? 'Detalles' : 'Confirmar'
          if (orderType === 'oficial') label = n === 1 ? 'Oficial' : n === 2 ? 'Detalles' : 'Confirmar'
          return (
            <div key={n} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${step === n ? 'bg-prats-navy text-white' : step > n ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
              {label}
            </div>
          )
        })}
      </div>

      {/* ————— ARTESANAL ————— */}
      {orderType === 'artesanal' && step === 1 && (
        <Card>
          <CardHeader><CardTitle>Cliente y oficial (opcionales)</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Buscar cliente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Nombre, email, teléfono o código..." className="pl-9" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
              </div>
              {isSearchingClient && <Loader2 className="h-5 w-5 animate-spin" />}
              {clientResults.length > 0 && (
                <div className="rounded-lg border divide-y max-h-[200px] overflow-y-auto">
                  {clientResults.map((c: any) => (
                    <div key={c.id} className={`flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 ${selectedClient?.id === c.id ? 'bg-prats-navy/5 ring-1 ring-prats-navy' : ''}`} onClick={() => setSelectedClient(c)}>
                      <div>
                        <p className="font-medium">{c.full_name} <span className="text-xs text-muted-foreground font-mono ml-1">{c.client_code}</span></p>
                        <p className="text-xs text-muted-foreground">{c.email} · {c.phone}</p>
                      </div>
                      {selectedClient?.id === c.id && <Check className="h-4 w-4 text-prats-navy" />}
                    </div>
                  ))}
                </div>
              )}
              {selectedClient && (
                <div className="rounded-lg border bg-green-50 p-3 flex items-center justify-between">
                  <span className="font-medium">{selectedClient.full_name}</span>
                  <Badge className="bg-green-100 text-green-700">Seleccionado</Badge>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Oficial asignado (opcional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar oficial..." className="pl-9" value={officialSearch} onChange={(e) => setOfficialSearch(e.target.value)} />
              </div>
              {isSearchingOfficial && <Loader2 className="h-5 w-5 animate-spin" />}
              {officialResults.length > 0 && (
                <div className="rounded-lg border divide-y max-h-[200px] overflow-y-auto">
                  {officialResults.map((o: any) => (
                    <div key={o.id} className={`flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 ${selectedOfficial?.id === o.id ? 'bg-prats-navy/5 ring-1 ring-prats-navy' : ''}`} onClick={() => setSelectedOfficial(o)}>
                      <div>
                        <p className="font-medium">{o.name}</p>
                        <p className="text-xs text-muted-foreground">{o.email ?? ''} · {o.phone ?? ''}</p>
                      </div>
                      {selectedOfficial?.id === o.id && <Check className="h-4 w-4 text-prats-navy" />}
                    </div>
                  ))}
                </div>
              )}
              {selectedOfficial && (
                <div className="rounded-lg border bg-green-50 p-3 flex items-center justify-between">
                  <span className="font-medium">{selectedOfficial.name}</span>
                  <Badge className="bg-green-100 text-green-700">Seleccionado</Badge>
                </div>
              )}
            </div>
            <Button onClick={() => setStep(2)} className="w-full bg-prats-navy hover:bg-prats-navy-light">Continuar</Button>
          </CardContent>
        </Card>
      )}

      {orderType === 'artesanal' && step === 2 && (
        <Card>
          <CardHeader><CardTitle>Detalles del pedido</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fecha estimada de entrega</Label>
              <Input type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} />
              <div className="flex items-center gap-2 mt-2">
                <Switch id="alert-art" checked={alertOnDelivery} onCheckedChange={setAlertOnDelivery} />
                <Label htmlFor="alert-art" className="text-sm font-normal cursor-pointer">Alerta en fecha de entrega</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Método de entrega</Label>
                <Select value={deliveryMethod} onValueChange={(v: any) => setDeliveryMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Recogida en tienda</SelectItem>
                    <SelectItem value="home">Envío a domicilio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descuento global (%)</Label>
                <Input type="number" min={0} max={100} value={discountPercentage} onChange={(e) => setDiscountPercentage(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="space-y-2"><Label>Notas internas</Label><Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} placeholder="Solo equipo..." /></div>
            <div className="space-y-2"><Label>Notas para el cliente</Label><Textarea value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} rows={2} placeholder="Visibles para el cliente..." /></div>
            <Button onClick={() => setStep(3)} className="w-full bg-prats-navy hover:bg-prats-navy-light">Siguiente: Prendas</Button>
          </CardContent>
        </Card>
      )}

      {orderType === 'artesanal' && step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Prendas ({lines.length})</h3>
            <Button size="sm" className="gap-2 bg-prats-navy hover:bg-prats-navy-light" onClick={() => { setLineForm(prev => ({ ...prev, line_type: 'artesanal' })); setShowAddLine(true) }}>
              <Plus className="h-4 w-4" /> Añadir prenda
            </Button>
          </div>
          {lines.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><Shirt className="mx-auto h-12 w-12 mb-4 opacity-30" /><p>Añade al menos una prenda.</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <Card key={idx}><CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2"><span className="font-medium">{line.garment_name}</span><Badge variant="outline">{line.line_type}</Badge></div>
                      {line.fabric_description && <p className="text-sm text-muted-foreground">Tejido: {line.fabric_description}</p>}
                      {line.model_name && <p className="text-sm text-muted-foreground">Modelo: {line.model_name} {line.model_size && `(${line.model_size})`}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(line.unit_price)}</p>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeLine(idx)}><Trash2 className="h-3 w-3 mr-1" /> Quitar</Button>
                    </div>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}

          <Dialog open={showAddLine} onOpenChange={setShowAddLine}>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Añadir prenda</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Tipo de prenda *</Label>
                  <Select value={lineForm.garment_type_id} onValueChange={(v) => setLineForm(p => ({ ...p, garment_type_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>{garmentTypes.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Tejido</Label>
                  <Select value={lineForm.fabric_id || ''} onValueChange={(v) => { const fab = fabrics.find((f: any) => f.id === v); setLineForm(p => ({ ...p, fabric_id: v, fabric_description: fab ? `${fab.name} - ${fab.composition}` : '', supplier_id: fab?.supplier_id || null })) }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tejido" /></SelectTrigger>
                    <SelectContent>{fabrics.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.fabric_code} — {f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Descripción tejido</Label><Input value={lineForm.fabric_description || ''} onChange={(e) => setLineForm(p => ({ ...p, fabric_description: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Metros</Label><Input type="number" step="0.1" value={lineForm.fabric_meters || ''} onChange={(e) => setLineForm(p => ({ ...p, fabric_meters: parseFloat(e.target.value) || 0 }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Modelo/Patrón</Label><Input value={lineForm.model_name || ''} onChange={(e) => setLineForm(p => ({ ...p, model_name: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Talla</Label><Input value={lineForm.model_size || ''} onChange={(e) => setLineForm(p => ({ ...p, model_size: e.target.value }))} /></div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Precio venta (sin IVA) *</Label><Input type="number" step="0.01" value={lineForm.unit_price || ''} onChange={(e) => setLineForm(p => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} /></div>
                  <div className="space-y-2"><Label>Descuento línea (%)</Label><Input type="number" min={0} max={100} value={lineForm.discount_percentage || ''} onChange={(e) => setLineForm(p => ({ ...p, discount_percentage: parseFloat(e.target.value) || 0 }))} /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Coste material</Label><Input type="number" step="0.01" value={lineForm.material_cost || ''} onChange={(e) => setLineForm(p => ({ ...p, material_cost: parseFloat(e.target.value) || 0 }))} /></div>
                  <div className="space-y-2"><Label>Mano obra</Label><Input type="number" step="0.01" value={lineForm.labor_cost || ''} onChange={(e) => setLineForm(p => ({ ...p, labor_cost: parseFloat(e.target.value) || 0 }))} /></div>
                  <div className="space-y-2"><Label>Fábrica</Label><Input type="number" step="0.01" value={lineForm.factory_cost || ''} onChange={(e) => setLineForm(p => ({ ...p, factory_cost: parseFloat(e.target.value) || 0 }))} /></div>
                </div>
                <div className="space-y-2"><Label>Acabado</Label><Textarea value={lineForm.finishing_notes || ''} onChange={(e) => setLineForm(p => ({ ...p, finishing_notes: e.target.value }))} rows={2} /></div>
                <Separator />
                <div className="space-y-2">
                  <Label>Confección por oficial (opcional)</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar oficial..."
                      className="pl-9"
                      value={lineOfficialSearch}
                      onChange={(e) => setLineOfficialSearch(e.target.value)}
                    />
                  </div>
                  {isSearchingLineOfficial && <Loader2 className="h-4 w-4 animate-spin mx-auto" />}
                  {lineOfficialResults.length > 0 && (
                    <div className="rounded-lg border divide-y max-h-[150px] overflow-y-auto">
                      {lineOfficialResults.map((o: any) => (
                        <div key={o.id}
                          className={`flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 text-sm ${lineForm.official_id === o.id ? 'bg-prats-navy/5' : ''}`}
                          onClick={() => { setLineForm(p => ({ ...p, official_id: o.id, official_name: o.name })); setLineOfficialSearch(''); setLineOfficialResults([]) }}>
                          <span>{o.name}</span>
                          {o.specialty && <span className="text-xs text-muted-foreground">{o.specialty}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {lineForm.official_id && (
                    <div className="flex items-center justify-between rounded-lg border bg-green-50 px-3 py-2 text-sm">
                      <span className="font-medium">{lineForm.official_name}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive"
                        onClick={() => setLineForm(p => ({ ...p, official_id: null, official_name: '' }))}>
                        Quitar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddLine(false)}>Cancelar</Button>
                <Button variant="outline" className="bg-prats-navy/10 text-prats-navy border-prats-navy" onClick={() => addLine(true)}>Añadir prenda</Button>
                <Button className="bg-prats-navy hover:bg-prats-navy-light" onClick={() => addLine(false)}>Añadir y cerrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" /> Anterior</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || lines.length === 0} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</> : <><Check className="h-4 w-4" /> Confirmar y crear</>}
            </Button>
          </div>
        </div>
      )}

      {/* ————— INDUSTRIAL ————— */}
      {orderType === 'industrial' && step === 1 && (
        <Card>
          <CardHeader><CardTitle>Cliente (obligatorio)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar cliente por nombre, email, teléfono o código..." className="pl-9" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
            </div>
            {isSearchingClient && <Loader2 className="h-5 w-5 animate-spin" />}
            {clientResults.length > 0 && (
              <div className="rounded-lg border divide-y max-h-[300px] overflow-y-auto">
                {clientResults.map((c: any) => (
                  <div key={c.id} className={`flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 ${selectedClient?.id === c.id ? 'bg-prats-navy/5 ring-1 ring-prats-navy' : ''}`} onClick={() => setSelectedClient(c)}>
                    <div><p className="font-medium">{c.full_name} <span className="text-xs font-mono text-muted-foreground">{c.client_code}</span></p><p className="text-xs text-muted-foreground">{c.email} · {c.phone}</p></div>
                    {selectedClient?.id === c.id && <Check className="h-4 w-4 text-prats-navy" />}
                  </div>
                ))}
              </div>
            )}
            {selectedClient && <div className="rounded-lg border bg-green-50 p-3 flex items-center justify-between"><span className="font-medium">{selectedClient.full_name}</span><Badge className="bg-green-100 text-green-700">Seleccionado</Badge></div>}
            <Button onClick={() => setStep(2)} className="w-full bg-prats-navy hover:bg-prats-navy-light" disabled={!selectedClient?.id}>Continuar</Button>
          </CardContent>
        </Card>
      )}

      {orderType === 'industrial' && step === 2 && (
        <Card>
          <CardHeader><CardTitle>Detalles</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Fecha estimada de entrega</Label><Input type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} /><div className="flex items-center gap-2 mt-2"><Switch id="alert-ind" checked={alertOnDelivery} onCheckedChange={setAlertOnDelivery} /><Label htmlFor="alert-ind" className="text-sm font-normal cursor-pointer">Alerta en fecha de entrega</Label></div></div>
            <div className="space-y-2">
              <Label>Fabricante *</Label>
              {selectedFactory ? (
                <div className="flex items-center justify-between rounded-lg border bg-orange-50 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{selectedFactory.name}</span>
                    {selectedFactory.contact_phone && <span className="text-muted-foreground ml-2">{selectedFactory.contact_phone}</span>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive"
                    onClick={() => setSelectedFactory(null)}>
                    Cambiar
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Buscar fabricante..." className="pl-9"
                      value={factorySearch} onChange={(e) => setFactorySearch(e.target.value)} />
                  </div>
                  {isSearchingFactory && <Loader2 className="h-4 w-4 animate-spin mx-auto" />}
                  {factoryResults.length > 0 && (
                    <div className="rounded-lg border divide-y max-h-[150px] overflow-y-auto">
                      {factoryResults.map((f: any) => (
                        <div key={f.id}
                          className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 text-sm"
                          onClick={() => { setSelectedFactory(f); setFactorySearch(''); setFactoryResults([]) }}>
                          <span>{f.name}</span>
                          {f.contact_phone && <span className="text-xs text-muted-foreground">{f.contact_phone}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="space-y-2"><Label>Tela a enviar a fábrica</Label><Textarea value={fabricToSend} onChange={(e) => setFabricToSend(e.target.value)} rows={2} placeholder="Descripción de la tela..." /></div>
            <div className="space-y-2"><Label>Medidas (notas)</Label><Textarea value={measuresNotes} onChange={(e) => setMeasuresNotes(e.target.value)} rows={2} placeholder="Medidas o instrucciones..." /></div>
            <div className="space-y-2"><Label>Notas internas</Label><Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} /></div>
            <Button onClick={() => setStep(3)} className="w-full bg-prats-navy hover:bg-prats-navy-light">Siguiente: Confirmar</Button>
          </CardContent>
        </Card>
      )}

      {orderType === 'industrial' && step === 3 && (
        <Card>
          <CardHeader><CardTitle>Confirmar y crear</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p><strong>Cliente:</strong> {selectedClient?.full_name}</p>
            <p><strong>Fabricante:</strong> {selectedFactory?.name ?? '—'}</p>
            <p><strong>Entrega estimada:</strong> {estimatedDelivery || '—'}</p>
            {fabricToSend && <p><strong>Tela a enviar:</strong> {fabricToSend}</p>}
            {measuresNotes && <p><strong>Medidas/notas:</strong> {measuresNotes}</p>}
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" /> Anterior</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">{isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</> : <><Check className="h-4 w-4" /> Crear pedido</>}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ————— PROVEEDOR ————— */}
      {orderType === 'proveedor' && step === 1 && (
        <Card>
          <CardHeader><CardTitle>Detalles del pedido a proveedor</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Proveedor</Label><Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Nombre del proveedor" /></div>
            <div className="space-y-2"><Label>Descripción del pedido</Label><Textarea value={orderDescription} onChange={(e) => setOrderDescription(e.target.value)} rows={3} placeholder="Telas, materiales..." /></div>
            <div className="space-y-2"><Label>Fecha estimada</Label><Input type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} /><div className="flex items-center gap-2 mt-2"><Switch id="alert-prov" checked={alertOnDelivery} onCheckedChange={setAlertOnDelivery} /><Label htmlFor="alert-prov" className="text-sm font-normal cursor-pointer">Alerta en esta fecha</Label></div></div>
            <div className="space-y-2"><Label>Notas</Label><Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} /></div>
            <Button onClick={() => setStep(2)} className="w-full bg-prats-navy hover:bg-prats-navy-light">Siguiente: Confirmar</Button>
          </CardContent>
        </Card>
      )}

      {orderType === 'proveedor' && step === 2 && (
        <Card>
          <CardHeader><CardTitle>Confirmar y crear</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p><strong>Proveedor:</strong> {supplierName || '—'}</p>
            <p><strong>Descripción:</strong> {orderDescription || '—'}</p>
            <p><strong>Fecha estimada:</strong> {estimatedDelivery || '—'}</p>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-2" /> Anterior</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">{isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</> : <><Check className="h-4 w-4" /> Crear pedido</>}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ————— OFICIAL ————— */}
      {orderType === 'oficial' && step === 1 && (
        <Card>
          <CardHeader><CardTitle>Oficial y pedido asociado</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Oficial (obligatorio)</Label>
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar oficial..." className="pl-9" value={officialSearch} onChange={(e) => setOfficialSearch(e.target.value)} /></div>
              {isSearchingOfficial && <Loader2 className="h-5 w-5 animate-spin" />}
              {officialResults.length > 0 && (
                <div className="rounded-lg border divide-y max-h-[200px] overflow-y-auto">
                  {officialResults.map((o: any) => (
                    <div key={o.id} className={`flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 ${selectedOfficial?.id === o.id ? 'bg-prats-navy/5 ring-1 ring-prats-navy' : ''}`} onClick={() => setSelectedOfficial(o)}>
                      <div><p className="font-medium">{o.name}</p><p className="text-xs text-muted-foreground">{o.email ?? ''} · {o.phone ?? ''}</p></div>
                      {selectedOfficial?.id === o.id && <Check className="h-4 w-4 text-prats-navy" />}
                    </div>
                  ))}
                </div>
              )}
              {selectedOfficial && <div className="rounded-lg border bg-green-50 p-3 flex items-center justify-between"><span className="font-medium">{selectedOfficial.name}</span><Badge className="bg-green-100 text-green-700">Seleccionado</Badge></div>}
            </div>
            <div className="space-y-2">
              <Label>Pedido de cliente artesanal asociado (opcional)</Label>
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar por número de pedido..." className="pl-9" value={parentOrderSearch} onChange={(e) => setParentOrderSearch(e.target.value)} /></div>
              {isSearchingParentOrder && <Loader2 className="h-5 w-5 animate-spin" />}
              {parentOrderResults.length > 0 && (
                <div className="rounded-lg border divide-y max-h-[200px] overflow-y-auto">
                  {parentOrderResults.map((o: any) => (
                    <div key={o.id} className={`flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 ${selectedParentOrder?.id === o.id ? 'bg-prats-navy/5 ring-1 ring-prats-navy' : ''}`} onClick={() => setSelectedParentOrder(o)}>
                      <div><p className="font-medium">{o.order_number}</p><p className="text-xs text-muted-foreground">{(o.clients as any)?.full_name ?? ''}</p></div>
                      {selectedParentOrder?.id === o.id && <Check className="h-4 w-4 text-prats-navy" />}
                    </div>
                  ))}
                </div>
              )}
              {selectedParentOrder && <div className="rounded-lg border bg-green-50 p-3 flex items-center justify-between"><span className="font-medium">{selectedParentOrder.order_number}</span><Badge className="bg-green-100 text-green-700">Asociado</Badge></div>}
            </div>
            <Button onClick={() => setStep(2)} className="w-full bg-prats-navy hover:bg-prats-navy-light" disabled={!selectedOfficial?.id}>Continuar</Button>
          </CardContent>
        </Card>
      )}

      {orderType === 'oficial' && step === 2 && (
        <Card>
          <CardHeader><CardTitle>Detalles</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Prenda a confeccionar</Label><Input value={garmentDescription} onChange={(e) => setGarmentDescription(e.target.value)} placeholder="Ej: Traje completo, chaqueta..." /></div>
            <div className="space-y-2"><Label>Fecha de entrega</Label><Input type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} /><div className="flex items-center gap-2 mt-2"><Switch id="alert-of" checked={alertOnDelivery} onCheckedChange={setAlertOnDelivery} /><Label htmlFor="alert-of" className="text-sm font-normal cursor-pointer">Alerta en fecha de entrega</Label></div></div>
            <div className="space-y-2"><Label>Precio acordado (€)</Label><Input type="number" step="0.01" value={agreedPrice || ''} onChange={(e) => setAgreedPrice(parseFloat(e.target.value) || 0)} /></div>
            <div className="space-y-2"><Label>Notas</Label><Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} /></div>
            <Button onClick={() => setStep(3)} className="w-full bg-prats-navy hover:bg-prats-navy-light">Siguiente: Confirmar</Button>
          </CardContent>
        </Card>
      )}

      {orderType === 'oficial' && step === 3 && (
        <Card>
          <CardHeader><CardTitle>Confirmar y crear</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p><strong>Oficial:</strong> {selectedOfficial?.name}</p>
            {selectedParentOrder && <p><strong>Pedido asociado:</strong> {selectedParentOrder.order_number}</p>}
            <p><strong>Prenda:</strong> {garmentDescription || '—'}</p>
            <p><strong>Entrega:</strong> {estimatedDelivery || '—'}</p>
            <p><strong>Precio acordado:</strong> {formatCurrency(agreedPrice)}</p>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" /> Anterior</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">{isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</> : <><Check className="h-4 w-4" /> Crear pedido</>}</Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
