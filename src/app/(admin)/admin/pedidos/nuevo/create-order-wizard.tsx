'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
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
  Factory, Package, UserCheck, Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAction } from '@/hooks/use-action'
import { useGarmentTypes } from '@/hooks/use-cached-queries'
import { useAuth } from '@/components/providers/auth-provider'
import { createOrderAction } from '@/actions/orders'
import { getClientMeasurements } from '@/actions/clients'
import { listSuppliers, createSupplierOrderAction } from '@/actions/suppliers'
import { listFabricsBySupplier } from '@/actions/fabrics'
import { formatCurrency } from '@/lib/utils'
import { generateCamiseriaFichaPdf } from '@/lib/camiseria-ficha-pdf'

type OrderType = 'artesanal' | 'industrial' | 'proveedor' | 'oficial' | 'camiseria'

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

interface SupplierRequestLine {
  item_type: 'fabric' | 'product' | ''
  fabric_id: string | null
  product_id: string | null
  description: string
  reference: string
  quantity: number
  unit: string
}

const TYPE_CARDS: { type: OrderType; label: string; description: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'artesanal', label: 'Pedido de cliente artesanal', description: 'Confección en sastrería o con oficial', bg: 'bg-blue-50', border: 'border-blue-300', icon: Shirt },
  { type: 'camiseria', label: 'Pedido de camisería', description: 'Camisas a medida con ficha de medidas', bg: 'bg-violet-50', border: 'border-violet-300', icon: Shirt },
  { type: 'industrial', label: 'Pedido de cliente industrial', description: 'Envío a fábrica con tela y medidas', bg: 'bg-orange-50', border: 'border-orange-300', icon: Factory },
  { type: 'proveedor', label: 'Pedido a proveedor', description: 'Compra de telas o materiales', bg: 'bg-yellow-50', border: 'border-yellow-300', icon: Package },
  { type: 'oficial', label: 'Pedido a oficial', description: 'Encargo de confección a oficial externo', bg: 'bg-green-50', border: 'border-green-300', icon: UserCheck },
]

function getRecipientType(orderType: OrderType): 'client' | 'supplier' | 'official' | 'factory' {
  switch (orderType) {
    case 'artesanal':
    case 'camiseria':
      return 'client'
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
    case 'camiseria':
      return 3
    case 'proveedor':
      return 2
    default: return 3
  }
}

export function CreateOrderWizard({
  fromSastre = false,
  initialOrderType,
}: {
  fromSastre?: boolean
  initialOrderType?: 'artesanal' | 'industrial' | 'camiseria'
} = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { activeStoreId } = useAuth()
  const clientIdFromUrl = searchParams.get('clientId')

  const [orderType, setOrderType] = useState<OrderType | null>(initialOrderType ?? null)
  const [step, setStep] = useState(initialOrderType ? 1 : 0)

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
  const [alertOnPayment, setAlertOnPayment] = useState(true)
  const [deliveryMethod, setDeliveryMethod] = useState<'store' | 'home'>('store')
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [internalNotes, setInternalNotes] = useState('')
  const [clientNotes, setClientNotes] = useState('')

  const [supplierName, setSupplierName] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierResults, setSupplierResults] = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false)
  const [supplierFabrics, setSupplierFabrics] = useState<any[]>([])
  const [supplierProducts, setSupplierProducts] = useState<any[]>([])
  const [loadingSupplierItems, setLoadingSupplierItems] = useState(false)
  const [supplierFabricsError, setSupplierFabricsError] = useState<string | null>(null)
  const [paymentDueDate, setPaymentDueDate] = useState('')
  const [orderDescription, setOrderDescription] = useState('')
  const [supplierRequestLines, setSupplierRequestLines] = useState<SupplierRequestLine[]>([])
  const [fabricToSend, setFabricToSend] = useState('')
  const [measuresNotes, setMeasuresNotes] = useState('')
  const [garmentDescription, setGarmentDescription] = useState('')
  const [agreedPrice, setAgreedPrice] = useState<number>(0)

  const [factorySearch, setFactorySearch] = useState('')
  const [factoryResults, setFactoryResults] = useState<any[]>([])
  const [selectedFactory, setSelectedFactory] = useState<any>(null)
  const [isSearchingFactory, setIsSearchingFactory] = useState(false)

  const [lines, setLines] = useState<OrderLine[]>([])
  const { data: garmentTypesData } = useGarmentTypes()
  const garmentTypes = garmentTypesData ? garmentTypesData.filter(g => g.code !== 'body') : []
  const [fabrics, setFabrics] = useState<any[]>([])
  const [showAddLine, setShowAddLine] = useState(false)
  const [lineForm, setLineForm] = useState<Partial<OrderLine>>({
    garment_type_id: '', line_type: 'artesanal', unit_price: 0, discount_percentage: 0,
    tax_rate: 21, material_cost: 0, labor_cost: 0, factory_cost: 0,
    fabric_description: '', fabric_meters: 0, model_name: '', model_size: '', finishing_notes: '',
    configuration: {}, official_id: null, official_name: '',
  })
  /** El usuario introduce siempre el PVP (con IVA). Al añadir la línea se convierte a sin IVA internamente. */
  const [lineFormPvpConIva, setLineFormPvpConIva] = useState<number>(0)

  const [lineOfficialSearch, setLineOfficialSearch] = useState('')
  const [lineOfficialResults, setLineOfficialResults] = useState<any[]>([])
  const [isSearchingLineOfficial, setIsSearchingLineOfficial] = useState(false)

  /** Estado para flujo Pedido de camisería (paso 3: ficha) */
  const [camiseriaConfig, setCamiseriaConfig] = useState<Record<string, string>>({})
  const [camiseriaPvpConIva, setCamiseriaPvpConIva] = useState<number>(0)
  const [camiseriaEntregado, setCamiseriaEntregado] = useState('')
  const [camiseriaObservaciones, setCamiseriaObservaciones] = useState('')
  /** Cliente para el que ya cargamos medidas por defecto (para no pisar ediciones al volver a paso 3) */
  const camiseriaDefaultsLoadedForClientId = useRef<string | null>(null)

  /** Al entrar en paso 3 (Ficha camisería), precargar medidas del cliente desde su ficha (solo una vez por cliente; las ediciones son solo para este pedido) */
  useEffect(() => {
    if (orderType !== 'camiseria' || step !== 3 || !selectedClient?.id || !garmentTypes.length) return
    const camiseriaType = garmentTypes.find((g: any) => g.name === 'Camisería')
    if (!camiseriaType) return
    if (camiseriaDefaultsLoadedForClientId.current === selectedClient.id) return
    let cancelled = false
    getClientMeasurements({ clientId: selectedClient.id, garmentTypeId: camiseriaType.id })
      .then((res) => {
        if (cancelled || !res.success || !res.data?.length) return
        const current = res.data.find((m: any) => m.is_current) ?? res.data[0]
        const values = current?.values
        if (values && typeof values === 'object') {
          const next: Record<string, string> = {}
          for (const [k, v] of Object.entries(values)) next[k] = v == null ? '' : String(v)
          setCamiseriaConfig(next)
        }
        camiseriaDefaultsLoadedForClientId.current = selectedClient.id
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [orderType, step, selectedClient?.id, garmentTypes])

  useEffect(() => {
    supabase.from('fabrics').select('id, fabric_code, name, composition, color_name, price_per_meter, supplier_id, stock_meters, reserved_meters')
      .eq('status', 'active').order('name', { ascending: true }).limit(200)
      .then(({ data }) => { if (data) setFabrics(data) }, err => { console.error('[create-order-wizard] fabrics:', err) })
  }, [supabase])

  useEffect(() => {
    if (!clientIdFromUrl) return
    supabase.from('clients')
      .select('id, client_code, full_name, email, phone, category, discount_percentage')
      .eq('id', clientIdFromUrl)
      .eq('is_active', true)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (data) {
            setSelectedClient(data)
            if (!initialOrderType) {
              setOrderType('artesanal')
              setStep(1)
            }
          }
        },
        err => { console.error('[create-order-wizard] client by id:', err) }
      )
  }, [clientIdFromUrl, supabase, initialOrderType])

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
    if (orderType !== 'proveedor' || supplierSearch.length < 2) {
      setSupplierResults([])
      return
    }
    const t = setTimeout(() => {
      setIsSearchingSupplier(true)
      listSuppliers({ search: supplierSearch, pageSize: 10 })
        .then((res: any) => {
          if (res?.success && res.data?.data) setSupplierResults(res.data.data)
          setIsSearchingSupplier(false)
        })
        .catch(() => setIsSearchingSupplier(false))
    }, 300)
    return () => clearTimeout(t)
  }, [orderType, supplierSearch])

  const loadSupplierCatalog = async (supplierId: string) => {
    setLoadingSupplierItems(true)
    setSupplierFabricsError(null)
    const fabricsRes = await listFabricsBySupplier({ supplierId, limit: 300 })
    if (fabricsRes.success) {
      const rows = fabricsRes.data?.data || []
      setSupplierFabrics(rows)
      if (rows.length === 0) {
        setSupplierFabricsError(`No se encontraron tejidos para este proveedor (ID: ${supplierId})`)
      }
    } else {
      setSupplierFabrics([])
      setSupplierFabricsError(`No se encontraron tejidos para este proveedor (ID: ${supplierId})`)
      console.error('[create-order-wizard] listFabricsBySupplier fallo', {
        supplierId,
        error: (fabricsRes as any)?.error,
      })
    }

    const { data: productsData } = await supabase
      .from('products')
      .select('id, sku, name, supplier_reference')
      .eq('supplier_id', supplierId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(300)
    setSupplierProducts(productsData || [])
    setLoadingSupplierItems(false)
  }

  useEffect(() => {
    if (!selectedSupplier?.id) {
      setSupplierFabrics([])
      setSupplierProducts([])
      setSupplierFabricsError(null)
      return
    }
    loadSupplierCatalog(selectedSupplier.id).catch(() => {
      setSupplierFabrics([])
      setSupplierProducts([])
      setSupplierFabricsError(`No se encontraron tejidos para este proveedor (ID: ${selectedSupplier.id})`)
      setLoadingSupplierItems(false)
    })
  }, [selectedSupplier?.id, supabase])

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
      if (data) setFactoryResults(data)
      setIsSearchingFactory(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [factorySearch])

  useEffect(() => {
    if (selectedClient?.discount_percentage != null) setDiscountPercentage(selectedClient.discount_percentage)
  }, [selectedClient])

  useEffect(() => {
    if (orderType === 'proveedor' && step === 1 && !paymentDueDate) {
      const in30 = new Date()
      in30.setDate(in30.getDate() + 30)
      if (!estimatedDelivery) setEstimatedDelivery(in30.toISOString().slice(0, 10))
      setAlertOnPayment(false)
      setAlertOnDelivery(true)
    }
  }, [orderType, step])

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
    const pvpConIva = lineFormPvpConIva || 0
    if (pvpConIva <= 0) { toast.error('Indica el PVP (precio con IVA)'); return }
    const taxRate = (lineForm.tax_rate ?? 21) / 100
    const priceSinIva = Math.round((pvpConIva / (1 + taxRate)) * 100) / 100
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
      unit_price: priceSinIva,
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
    setLineFormPvpConIva(0)
    setLineForm({
      garment_type_id: keepOpen ? currentGarmentId : '',
      line_type: orderType === 'artesanal' || orderType === 'industrial' ? orderType : 'artesanal',
      unit_price: 0, discount_percentage: 0, tax_rate: 21, material_cost: 0, labor_cost: 0, factory_cost: 0,
      fabric_description: '', fabric_meters: 0, model_name: '', model_size: '', finishing_notes: '', configuration: {},
      official_id: null, official_name: '',
    })
  }

  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx))

  const addSupplierRequestLine = () => {
    setSupplierRequestLines((prev) => [...prev, {
      item_type: '',
      fabric_id: null,
      product_id: null,
      description: '',
      reference: '',
      quantity: 1,
      unit: '',
    }])
  }

  const updateSupplierRequestLine = (idx: number, patch: Partial<SupplierRequestLine>) => {
    setSupplierRequestLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)))
  }

  const removeSupplierRequestLine = (idx: number) => {
    setSupplierRequestLines((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      return next
    })
  }

  const { execute: submitOrder, isLoading: isSubmitting } = useAction(createOrderAction, {
    successMessage: 'Pedido creado correctamente',
    onSuccess: (data: any) => router.push(fromSastre ? `/sastre/pedidos/${data.id}` : `/admin/pedidos/${data.id}`),
  })

  const { execute: submitSupplierOrder, isLoading: isSubmittingSupplier } = useAction(createSupplierOrderAction, {
    onSuccess: (data: any) => {
      if (data?.ap_invoice_id) toast.success('Pedido y factura creados. Redirigiendo a Facturas proveedores.')
      else toast.success('Pedido creado.')
      router.push(data?.ap_invoice_id ? '/admin/contabilidad/facturas-proveedores' : `/admin/proveedores/${selectedSupplier?.id}`)
    },
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
        order_type: orderType === 'camiseria' ? 'artesanal' : orderType,
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
      })) : orderType === 'camiseria' ? (() => {
        const camiseriaType = garmentTypes.find((g: any) => g.name === 'Camisería')
        if (!camiseriaType) return []
        const pvpConIva = camiseriaPvpConIva || 0
        const taxRate = 21 / 100
        const priceSinIva = Math.round((pvpConIva / (1 + taxRate)) * 100) / 100
        const observaciones = [camiseriaObservaciones, camiseriaEntregado ? `Entregado a cuenta: ${camiseriaEntregado}` : ''].filter(Boolean).join('\n') || null
        return [{
          garment_type_id: camiseriaType.id,
          line_type: 'artesanal' as const,
          configuration: camiseriaConfig,
          fabric_id: null,
          fabric_description: '',
          fabric_meters: null,
          supplier_id: null,
          unit_price: priceSinIva,
          discount_percentage: 0,
          tax_rate: 21,
          material_cost: 0,
          labor_cost: 0,
          factory_cost: 0,
          model_name: null,
          model_size: null,
          finishing_notes: observaciones,
          measurement_id: null,
          official_id: null,
        }]
      })() : [],
    }
  }

  const handleSubmit = () => {
    if (orderType === 'artesanal' && lines.length === 0) {
      toast.error('Añade al menos una prenda')
      return
    }
    if (orderType === 'camiseria') {
      if (!selectedClient?.id) {
        toast.error('Selecciona un cliente')
        return
      }
      if (!camiseriaPvpConIva || camiseriaPvpConIva <= 0) {
        toast.error('Indica el PVP (precio con IVA)')
        return
      }
      const camiseriaType = garmentTypes.find((g: any) => g.name === 'Camisería')
      if (!camiseriaType) {
        toast.error('No se encontró el tipo de prenda Camisería. Ejecuta la migración 050.')
        return
      }
      const payload = buildOrderPayload()
      if (payload) submitOrder(payload)
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
    if (orderType === 'proveedor') {
      if (!selectedSupplier?.id) {
        toast.error('Selecciona un proveedor')
        return
      }
      if (!estimatedDelivery?.trim()) {
        toast.error('Indica la fecha de entrega estimada')
        return
      }
      const cleanedLines = supplierRequestLines
        .map((line) => ({
          item_type: line.item_type,
          fabric_id: line.item_type === 'fabric' ? line.fabric_id : null,
          product_id: line.item_type === 'product' ? line.product_id : null,
          description: line.description.trim(),
          reference: line.reference.trim(),
          quantity: Number(line.quantity),
          unit: (line.unit || 'unidades').trim(),
        }))
        .filter((line) => line.item_type && line.description && Number.isFinite(line.quantity) && line.quantity > 0)
      if (cleanedLines.length === 0) {
        toast.error('Añade al menos un producto solicitado')
        return
      }
      const notes = [orderDescription, internalNotes].filter(Boolean).join('\n') || null
      submitSupplierOrder({
        supplier_id: selectedSupplier.id,
        total: 0,
        payment_due_date: paymentDueDate?.trim() || null,
        estimated_delivery_date: estimatedDelivery.trim(),
        notes,
        alert_on_payment: alertOnPayment,
        alert_on_delivery: alertOnDelivery,
        lines: cleanedLines.map((line) => ({
          fabric_id: line.fabric_id,
          product_id: line.product_id,
          description: line.description,
          reference: line.reference,
          quantity: line.quantity,
          unit: line.unit,
        })),
      })
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
          <Button variant="ghost" size="icon" onClick={() => router.push(fromSastre ? '/sastre/pedidos' : '/admin/pedidos')}><ArrowLeft className="h-5 w-5" /></Button>
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
        <Button variant="ghost" size="icon" onClick={() => step === 1 ? (fromSastre ? router.push('/sastre/pedidos') : setOrderType(null)) : setStep(step - 1)}>
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
          if (orderType === 'camiseria') label = n === 1 ? 'Cliente' : n === 2 ? 'Detalles' : 'Ficha camisería'
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
      {(orderType === 'artesanal' || orderType === 'camiseria') && step === 1 && (
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
            <Button onClick={() => setStep(2)} className="w-full bg-prats-navy hover:bg-prats-navy-light" disabled={orderType === 'camiseria' && !selectedClient?.id}>Continuar</Button>
          </CardContent>
        </Card>
      )}

      {(orderType === 'artesanal' || orderType === 'camiseria') && step === 2 && (
        <Card>
          <CardHeader><CardTitle>Detalles del pedido</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fecha estimada de entrega</Label>
              <DatePickerPopover value={estimatedDelivery} onChange={(date) => setEstimatedDelivery(date)} />
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
            <Button onClick={() => setStep(3)} className="w-full bg-prats-navy hover:bg-prats-navy-light">
              {orderType === 'camiseria' ? 'Siguiente: Ficha camisería' : 'Siguiente: Prendas'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ————— CAMISERÍA paso 3: Ficha ————— */}
      {orderType === 'camiseria' && step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Ficha de camisería</CardTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              Se han cargado las medidas de la ficha del cliente. Puedes editarlas solo para este pedido; la ficha del cliente no se modificará al guardar.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {['cuello', 'canesu', 'manga', 'fren_pecho', 'cont_pecho', 'cintura', 'cadera', 'largo_cuerpo', 'p_izq', 'p_dch', 'hombro', 'biceps'].map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{key.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</Label>
                  <Input type="number" step="0.5" value={camiseriaConfig[key] ?? ''} onChange={(e) => setCamiseriaConfig(c => ({ ...c, [key]: e.target.value }))} className="h-9" placeholder="cm" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Características</Label>
              <div className="flex flex-wrap gap-3">
                {['jareton', 'bolsillo', 'hombro_caido', 'hombros_altos', 'hombros_bajos', 'erguido', 'cargado', 'espalda_lisa', 'esp_pliegues', 'esp_tablon_centr', 'esp_pinzas'].map((key) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={camiseriaConfig[key] === 'true'} onChange={(e) => setCamiseriaConfig(c => ({ ...c, [key]: e.target.checked ? 'true' : '' }))} className="rounded" />
                    {key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div><Label className="text-xs">Iniciales</Label><Input value={camiseriaConfig.iniciales ?? ''} onChange={(e) => setCamiseriaConfig(c => ({ ...c, iniciales: e.target.value }))} className="h-9" /></div>
                <div><Label className="text-xs">Mod. Cuello</Label><Input value={camiseriaConfig.mod_cuello ?? ''} onChange={(e) => setCamiseriaConfig(c => ({ ...c, mod_cuello: e.target.value }))} className="h-9" /></div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Puño</Label>
              <div className="flex flex-wrap gap-3">
                {['puno_sencillo', 'puno_gemelo', 'puno_mixto', 'puno_mosquetero', 'puno_otro'].map((key) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="camiseria_puno"
                      checked={camiseriaConfig[key] === 'true'}
                      onChange={() => {
                        const next = { ...camiseriaConfig }
                        ;['puno_sencillo', 'puno_gemelo', 'puno_mixto', 'puno_mosquetero', 'puno_otro'].forEach((k) => { next[k] = k === key ? 'true' : '' })
                        setCamiseriaConfig(next)
                      }}
                      className="rounded"
                    />
                    {key.replace('puno_', '').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tejido (descripción)</Label>
              <Textarea value={camiseriaConfig.tejido ?? ''} onChange={(e) => setCamiseriaConfig(c => ({ ...c, tejido: e.target.value }))} rows={2} className="resize-none" />
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={camiseriaConfig.derecho === 'true'} onChange={(e) => setCamiseriaConfig(c => ({ ...c, derecho: e.target.checked ? 'true' : '' }))} className="rounded" />
                  Derecho
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={camiseriaConfig.izquierdo === 'true'} onChange={(e) => setCamiseriaConfig(c => ({ ...c, izquierdo: e.target.checked ? 'true' : '' }))} className="rounded" />
                  Izquierdo
                </label>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PVP (con IVA) *</Label>
                <Input type="number" step="0.01" min={0} value={camiseriaPvpConIva || ''} onChange={(e) => setCamiseriaPvpConIva(parseFloat(e.target.value) || 0)} placeholder="Ej: 121,00 €" />
              </div>
              <div className="space-y-2">
                <Label>Entregado a cuenta (€)</Label>
                <Input type="number" step="0.01" value={camiseriaEntregado} onChange={(e) => setCamiseriaEntregado(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea value={camiseriaObservaciones} onChange={(e) => setCamiseriaObservaciones(e.target.value)} rows={2} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => generateCamiseriaFichaPdf({ clientName: selectedClient?.full_name ?? 'Cliente', values: camiseriaConfig, prefix: '', precio: camiseriaPvpConIva ? `${camiseriaPvpConIva} €` : undefined, entregado: camiseriaEntregado || undefined, observaciones: camiseriaObservaciones || undefined })}>
                <Printer className="h-4 w-4" /> Imprimir ficha
              </Button>
            </div>
            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" /> Anterior</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
                {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</> : <><Check className="h-4 w-4" /> Confirmar y crear pedido</>}
              </Button>
            </div>
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
                      <p className="font-medium">PVP {formatCurrency(Math.round(line.unit_price * (1 + (line.tax_rate || 21) / 100) * 100) / 100)}</p>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeLine(idx)}><Trash2 className="h-3 w-3 mr-1" /> Quitar</Button>
                    </div>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}

          <Dialog open={showAddLine} onOpenChange={(open) => { setShowAddLine(open); if (!open) setLineFormPvpConIva(0) }}>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Añadir prenda</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Tipo de prenda *</Label>
                  <Select value={lineForm.garment_type_id} onValueChange={(v) => setLineForm(p => ({ ...p, garment_type_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>{garmentTypes.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {garmentTypes.find((g: any) => g.id === lineForm.garment_type_id)?.name === 'Camisería' && (
                  <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                    <h4 className="font-medium text-sm">Ficha Camisería</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {['cuello', 'canesu', 'manga', 'fren_pecho', 'cont_pecho', 'cintura', 'cadera', 'largo_cuerpo', 'p_izq', 'p_dch', 'hombro', 'biceps'].map((key) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs">{key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={(lineForm.configuration || {})[key] ?? ''}
                            onChange={(e) => setLineForm(p => ({ ...p, configuration: { ...(p.configuration || {}), [key]: e.target.value } }))}
                            className="h-9"
                            placeholder="cm"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Características</Label>
                      <div className="flex flex-wrap gap-3">
                        {['jareton', 'bolsillo', 'hombro_caido', 'hombros_altos', 'hombros_bajos', 'erguido', 'cargado', 'espalda_lisa', 'esp_pliegues', 'esp_tablon_centr', 'esp_pinzas'].map((key) => {
                          const cfg = lineForm.configuration || {}
                          const checked = cfg[key] === 'true' || cfg[key] === '1'
                          return (
                            <label key={key} className="flex items-center gap-1.5 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => setLineForm(p => ({ ...p, configuration: { ...(p.configuration || {}), [key]: e.target.checked ? 'true' : '' } }))}
                                className="rounded"
                              />
                              {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </label>
                          )
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div><Label className="text-xs">Iniciales</Label><Input value={(lineForm.configuration || {}).iniciales ?? ''} onChange={(e) => setLineForm(p => ({ ...p, configuration: { ...(p.configuration || {}), iniciales: e.target.value } }))} className="h-9" /></div>
                        <div><Label className="text-xs">Mod. Cuello</Label><Input value={(lineForm.configuration || {}).mod_cuello ?? ''} onChange={(e) => setLineForm(p => ({ ...p, configuration: { ...(p.configuration || {}), mod_cuello: e.target.value } }))} className="h-9" /></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Puño</Label>
                      <div className="flex flex-wrap gap-3">
                        {['puno_sencillo', 'puno_gemelo', 'puno_mixto', 'puno_mosquetero', 'puno_otro'].map((key) => {
                          const cfg = lineForm.configuration || {}
                          const checked = cfg[key] === 'true' || cfg[key] === '1'
                          return (
                            <label key={key} className="flex items-center gap-1.5 text-sm">
                              <input
                                type="radio"
                                name="line_camiseria_puno"
                                checked={checked}
                                onChange={() => {
                                  const next = { ...(lineForm.configuration || {}) }
                                  ;['puno_sencillo', 'puno_gemelo', 'puno_mixto', 'puno_mosquetero', 'puno_otro'].forEach((k) => { next[k] = k === key ? 'true' : '' })
                                  setLineForm(p => ({ ...p, configuration: next }))
                                }}
                                className="rounded"
                              />
                              {key.replace('puno_', '').replace(/\b\w/g, l => l.toUpperCase())}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Tejido (descripción)</Label>
                      <Textarea value={(lineForm.configuration || {}).tejido ?? ''} onChange={(e) => setLineForm(p => ({ ...p, configuration: { ...(p.configuration || {}), tejido: e.target.value } }))} rows={2} className="resize-none" />
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={(lineForm.configuration || {}).derecho === 'true'} onChange={(e) => setLineForm(p => ({ ...p, configuration: { ...(p.configuration || {}), derecho: e.target.checked ? 'true' : '' } }))} className="rounded" />
                          Derecho
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={(lineForm.configuration || {}).izquierdo === 'true'} onChange={(e) => setLineForm(p => ({ ...p, configuration: { ...(p.configuration || {}), izquierdo: e.target.checked ? 'true' : '' } }))} className="rounded" />
                          Izquierdo
                        </label>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => generateCamiseriaFichaPdf({
                        clientName: selectedClient?.full_name ?? 'Cliente',
                        values: lineForm.configuration || {},
                        prefix: '',
                        precio: lineFormPvpConIva ? `${lineFormPvpConIva} €` : undefined,
                        observaciones: lineForm.finishing_notes || undefined,
                      })}
                    >
                      <Printer className="h-4 w-4" />
                      Imprimir ficha
                    </Button>
                  </div>
                )}
                <div className="space-y-2"><Label>Tejido</Label>
                  <Select value={lineForm.fabric_id || ''} onValueChange={(v) => { const fab = fabrics.find((f: any) => f.id === v); setLineForm(p => ({ ...p, fabric_id: v, fabric_description: fab ? `${fab.name} - ${fab.composition}` : '', supplier_id: fab?.supplier_id || null })) }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tejido" /></SelectTrigger>
                    <SelectContent>
                      {fabrics.map((f: any) => {
                        const stockM = Number(f.stock_meters) || 0
                        const reserved = Number(f.reserved_meters) || 0
                        const available = Math.max(0, stockM - reserved)
                        const stockLabel = available <= 0 ? '— Sin stock' : `— ${available.toFixed(1)} m disp.`
                        return (
                          <SelectItem key={f.id} value={f.id}>
                            {f.fabric_code} — {f.name} {stockLabel}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {lineForm.fabric_id && (() => {
                    const fab = fabrics.find((f: any) => f.id === lineForm.fabric_id)
                    if (!fab) return null
                    const stockM = Number(fab.stock_meters) || 0
                    const reserved = Number(fab.reserved_meters) || 0
                    const available = Math.max(0, stockM - reserved)
                    const requested = Number(lineForm.fabric_meters) || 0
                    const sinStock = available <= 0
                    const insuficiente = requested > 0 && requested > available
                    return (
                      <div className="flex flex-col gap-1 text-xs">
                        <p className={sinStock ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                          {sinStock ? 'Sin stock' : `${available.toFixed(1)} m disponibles en stock`}
                          {reserved > 0 && ` (${reserved.toFixed(1)} m reservados)`}
                        </p>
                        {insuficiente && (
                          <p className="text-destructive font-medium">
                            Se piden {requested.toFixed(1)} m pero solo hay {available.toFixed(1)} m disponibles.
                          </p>
                        )}
                      </div>
                    )
                  })()}
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
                  <div className="space-y-2">
                    <Label>PVP (con IVA) *</Label>
                    <Input type="number" step="0.01" min={0} value={lineFormPvpConIva || ''} onChange={(e) => setLineFormPvpConIva(parseFloat(e.target.value) || 0)} placeholder="Ej: 121,00 €" />
                    <p className="text-xs text-muted-foreground">Precio final que paga el cliente (IVA {lineForm.tax_rate ?? 21}% incluido)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Descuento línea (%)</Label>
                    <Input type="number" min={0} max={100} value={lineForm.discount_percentage || ''} onChange={(e) => setLineForm(p => ({ ...p, discount_percentage: parseFloat(e.target.value) || 0 }))} />
                  </div>
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
            <div className="space-y-2"><Label>Fecha estimada de entrega</Label><DatePickerPopover value={estimatedDelivery} onChange={(date) => setEstimatedDelivery(date)} /><div className="flex items-center gap-2 mt-2"><Switch id="alert-ind" checked={alertOnDelivery} onCheckedChange={setAlertOnDelivery} /><Label htmlFor="alert-ind" className="text-sm font-normal cursor-pointer">Alerta en fecha de entrega</Label></div></div>
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
            <div className="space-y-2">
              <Label>Proveedor *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, código o NIF..."
                  className="pl-9"
                  value={selectedSupplier ? selectedSupplier.name : supplierSearch}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value)
                    if (selectedSupplier) setSelectedSupplier(null)
                  }}
                />
              </div>
              {isSearchingSupplier && <Loader2 className="h-4 w-4 animate-spin mt-1" />}
              {supplierResults.length > 0 && !selectedSupplier && (
                <div className="rounded-lg border divide-y max-h-[200px] overflow-y-auto">
                  {supplierResults.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                      onClick={() => { setSelectedSupplier(s); setSupplierSearch(''); setSupplierResults([]) }}
                    >
                      <div>
                        <p className="font-medium">{s.name} <span className="text-xs text-muted-foreground font-mono">{s.supplier_code}</span></p>
                        {s.nif_cif && <p className="text-xs text-muted-foreground">{s.nif_cif}</p>}
                      </div>
                      <Check className="h-4 w-4 text-prats-navy" />
                    </div>
                  ))}
                </div>
              )}
              {selectedSupplier && (
                <div className="rounded-lg border bg-green-50 p-3 flex items-center justify-between">
                  <span className="font-medium">{selectedSupplier.name}</span>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setSelectedSupplier(null)}>Cambiar</Button>
                </div>
              )}
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Productos solicitados *</Label>
                <div className="flex items-center gap-2">
                  {selectedSupplier?.id && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loadingSupplierItems}
                      onClick={() => loadSupplierCatalog(selectedSupplier.id)}
                    >
                      {loadingSupplierItems ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      Recargar
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addSupplierRequestLine}>
                    <Plus className="h-3 w-3 mr-1" /> Añadir línea
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Aquí registras lo que pides al proveedor. El coste se completa después, al recibir su albarán/factura.
              </p>
              {selectedSupplier?.id && !loadingSupplierItems && supplierFabrics.length === 0 ? (
                <p className="text-xs text-amber-700">
                  No hay tejidos activos vinculados a este proveedor. Si acabas de crear uno, pulsa en Recargar.
                </p>
              ) : null}
              {supplierFabricsError ? (
                <p className="text-xs text-destructive">{supplierFabricsError}</p>
              ) : null}
              <div className="space-y-2">
                {supplierRequestLines.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Aún no hay líneas. Pulsa en <strong>Añadir línea</strong> y elige si es <strong>Tela</strong> o <strong>Producto</strong>.
                  </div>
                ) : null}
                {supplierRequestLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2">
                    <div className="col-span-12 sm:col-span-2 space-y-1">
                      <Label className="text-xs">Tipo *</Label>
                      <Select
                        value={line.item_type || 'none'}
                        onValueChange={(value) => {
                          if (value === 'none') {
                            updateSupplierRequestLine(idx, {
                              item_type: '',
                              fabric_id: null,
                              product_id: null,
                              description: '',
                              reference: '',
                              unit: '',
                            })
                            return
                          }
                          const isFabric = value === 'fabric'
                          updateSupplierRequestLine(idx, {
                            item_type: isFabric ? 'fabric' : 'product',
                            fabric_id: null,
                            product_id: null,
                            description: '',
                            reference: '',
                            unit: '',
                          })
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Elegir" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Seleccionar</SelectItem>
                          <SelectItem value="fabric">Tela</SelectItem>
                          <SelectItem value="product">Producto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 sm:col-span-4 space-y-1">
                      <Label className="text-xs">
                        {line.item_type === 'fabric' ? 'Tejido' : line.item_type === 'product' ? 'Producto' : 'Elemento'}
                      </Label>
                      {line.item_type === 'fabric' ? (
                        <Select
                          value={line.fabric_id || 'none'}
                          onValueChange={(value) => {
                            if (value === 'none') {
                              updateSupplierRequestLine(idx, { fabric_id: null })
                              return
                            }
                            const fabric = supplierFabrics.find((f: any) => f.id === value)
                            updateSupplierRequestLine(idx, {
                              fabric_id: value,
                              product_id: null,
                              description: fabric ? `${fabric.name}${fabric.composition ? ` - ${fabric.composition}` : ''}` : line.description,
                              reference: fabric?.fabric_code || line.reference,
                              unit: line.unit || 'metros',
                            })
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecciona tejido" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin seleccionar</SelectItem>
                            {supplierFabrics.map((f: any) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.fabric_code} - {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : line.item_type === 'product' ? (
                        <Select
                          value={line.product_id || 'none'}
                          onValueChange={(value) => {
                            if (value === 'none') {
                              updateSupplierRequestLine(idx, { product_id: null })
                              return
                            }
                            const product = supplierProducts.find((p: any) => p.id === value)
                            updateSupplierRequestLine(idx, {
                              product_id: value,
                              fabric_id: null,
                              description: product?.name || line.description,
                              reference: product?.supplier_reference || product?.sku || line.reference,
                              unit: line.unit || 'unidades',
                            })
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecciona producto" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin seleccionar</SelectItem>
                            {supplierProducts.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.sku} - {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value="" disabled placeholder="Primero elige tipo" />
                      )}
                    </div>
                    <div className="col-span-12 sm:col-span-3 space-y-1">
                      <Label className="text-xs">Descripción *</Label>
                      <Input
                        value={line.description}
                        onChange={(e) => updateSupplierRequestLine(idx, { description: e.target.value })}
                        placeholder="Tela lino azul marino"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-1 space-y-1">
                      <Label className="text-xs">Cantidad *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => updateSupplierRequestLine(idx, { quantity: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-1 space-y-1">
                      <Label className="text-xs">Unidad</Label>
                      <Input
                        value={line.unit}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => updateSupplierRequestLine(idx, { unit: e.target.value })}
                        placeholder="Ej: metros"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeSupplierRequestLine(idx)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha de pago al proveedor</Label>
                <DatePickerPopover
                  value={paymentDueDate}
                  onChange={(date) => setPaymentDueDate(date)}
                />
                <div className="flex items-center gap-2 mt-2">
                  <Switch id="alert-payment" checked={alertOnPayment} onCheckedChange={setAlertOnPayment} />
                  <Label htmlFor="alert-payment" className="text-sm font-normal cursor-pointer">Alerta en fecha de pago</Label>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha de entrega estimada *</Label>
              <DatePickerPopover value={estimatedDelivery} onChange={(date) => setEstimatedDelivery(date)} />
              <div className="flex items-center gap-2 mt-2">
                <Switch id="alert-prov" checked={alertOnDelivery} onCheckedChange={setAlertOnDelivery} />
                <Label htmlFor="alert-prov" className="text-sm font-normal cursor-pointer">Alerta en fecha de entrega</Label>
              </div>
            </div>
            <div className="space-y-2"><Label>Descripción del pedido</Label><Textarea value={orderDescription} onChange={(e) => setOrderDescription(e.target.value)} rows={3} placeholder="Telas, materiales..." /></div>
            <div className="space-y-2"><Label>Notas</Label><Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} /></div>
            <Button
              onClick={() => setStep(2)}
              className="w-full bg-prats-navy hover:bg-prats-navy-light"
              disabled={
                !selectedSupplier?.id
                || !estimatedDelivery
                || supplierRequestLines.filter((line) => line.item_type && line.description.trim() && Number(line.quantity) > 0).length === 0
              }
            >
              Siguiente: Confirmar
            </Button>
          </CardContent>
        </Card>
      )}

      {orderType === 'proveedor' && step === 2 && (
        <Card>
          <CardHeader><CardTitle>Confirmar y crear</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p><strong>Proveedor:</strong> {selectedSupplier?.name ?? '—'}</p>
            <div>
              <p className="font-semibold mb-2">Productos solicitados</p>
              <div className="rounded-md border divide-y">
                {supplierRequestLines
                  .filter((line) => line.description.trim() && Number(line.quantity) > 0)
                  .map((line, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{line.description}</span>
                      <span className="font-medium">{line.quantity} {line.unit || 'unidades'}</span>
                    </div>
                  ))}
              </div>
            </div>
            <p><strong>Fecha de pago:</strong> {paymentDueDate || '—'}</p>
            <p><strong>Fecha de entrega estimada:</strong> {estimatedDelivery || '—'}</p>
            {orderDescription && <p><strong>Descripción:</strong> {orderDescription}</p>}
            {internalNotes && <p><strong>Notas:</strong> {internalNotes}</p>}
            <p className="text-sm text-muted-foreground">Se crea el pedido con líneas de producto. El coste se registrará al recibir albarán/factura del proveedor.</p>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-2" /> Anterior</Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmittingSupplier}
                className="gap-2 bg-prats-navy hover:bg-prats-navy-light"
              >
                {isSubmittingSupplier ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</> : <><Check className="h-4 w-4" /> Crear pedido</>}
              </Button>
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
            <div className="space-y-2"><Label>Fecha de entrega</Label><DatePickerPopover value={estimatedDelivery} onChange={(date) => setEstimatedDelivery(date)} /><div className="flex items-center gap-2 mt-2"><Switch id="alert-of" checked={alertOnDelivery} onCheckedChange={setAlertOnDelivery} /><Label htmlFor="alert-of" className="text-sm font-normal cursor-pointer">Alerta en fecha de entrega</Label></div></div>
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
