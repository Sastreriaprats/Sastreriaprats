'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, Loader2, X, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAction } from '@/hooks/use-action'
import { createProductAction, updateProductAction, createVariantAction, adjustStock, listPhysicalWarehouses } from '@/actions/products'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const PRODUCT_TYPES = [
  { value: 'boutique', label: 'Boutique' },
  { value: 'tailoring_fabric', label: 'Tejido' },
  { value: 'accessory', label: 'Complemento' },
  { value: 'service', label: 'Servicio' },
] as const

const TAX_OPTIONS = [0, 4, 10, 21]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

type VariantRow = { id: string; size: string; color: string; variant_sku: string; stock_inicial: number }

function getInitialImages(product: any): string[] {
  if (Array.isArray(product?.images) && product.images.length) return product.images
  if (product?.main_image_url) return [product.main_image_url]
  return []
}

export function ProductForm({
  categories,
  suppliers,
  initialProduct,
  onSuccess,
  onCancel,
  showPageHeader = false,
}: {
  categories: { id: string; name: string; slug: string; product_type?: string | null }[]
  suppliers: { id: string; name: string }[]
  initialProduct?: any
  onSuccess?: () => void
  onCancel?: () => void
  showPageHeader?: boolean
}) {
  const router = useRouter()
  const isEdit = !!initialProduct?.id
  const [activeTab, setActiveTab] = useState('basico')

  const [basico, setBasico] = useState({
    name: '',
    sku: '',
    product_type: 'boutique' as string,
    category_id: '',
    brand: 'Prats',
    collection: '',
    season: '',
    description: '',
    supplier_id: '',
    supplier_reference: '',
    is_active: true,
    fabric_meters_used: '' as number | '',
    metros_iniciales: '' as number | '',
  })
  const [precios, setPrecios] = useState({
    cost_price: '' as number | '',
    pvp: '' as number | '',        // precio que introduce el usuario (con IVA)
    tax_rate: 21,
    min_stock_alert: '' as number | '',
  })
  const [web, setWeb] = useState({
    is_visible_web: false,
    web_slug: '',
    web_title: '',
    web_description: '',
    web_tags: [] as string[],
    tagInput: '',
    color: '',
    material: '',
  })
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [showAddVariant, setShowAddVariant] = useState(false)
  const [variantForm, setVariantForm] = useState({ size: '', color: '', variant_sku: '', stock_inicial: 0 })
  const [initialStockWarehouseId, setInitialStockWarehouseId] = useState<string>('')
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string; stores?: { name: string; store_type?: string } }[]>([])
  const [images, setImages] = useState<string[]>([])
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const supabase = useMemo(() => createClient(), [])
  const metrosInicialesRef = useRef<number>(0)

  useEffect(() => {
    let cancelled = false
    listPhysicalWarehouses()
      .then(result => {
        if (!cancelled && result.success && result.data?.length) {
          setWarehouses(result.data as any[])
          if (!initialStockWarehouseId) {
            setInitialStockWarehouseId(result.data[0].id)
          }
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('[product-form] listPhysicalWarehouses:', err)
          toast.error('Error al cargar almacenes')
        }
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!initialProduct) return
    setBasico({
      name: initialProduct.name ?? '',
      sku: initialProduct.sku ?? '',
      product_type: (initialProduct.product_type as any) ?? 'boutique',
      category_id: initialProduct.category_id ?? '',
      brand: initialProduct.brand ?? 'Prats',
      collection: initialProduct.collection ?? '',
      season: initialProduct.season ?? '',
      description: initialProduct.description ?? '',
      supplier_id: initialProduct.supplier_id ?? '',
      supplier_reference: initialProduct.supplier_reference ?? '',
      is_active: initialProduct.is_active ?? true,
      fabric_meters_used: initialProduct.fabric_meters_used != null ? initialProduct.fabric_meters_used : '',
      metros_iniciales: '' as number | '',
    })
    const taxRate = initialProduct.tax_rate ?? 21
    const basePrice = initialProduct.base_price != null ? Number(initialProduct.base_price) : null
    const pvpValue = basePrice != null ? Math.round(basePrice * (1 + taxRate / 100) * 100) / 100 : ''
    setPrecios({
      cost_price: initialProduct.cost_price != null ? initialProduct.cost_price : '',
      pvp: pvpValue,
      tax_rate: taxRate,
      min_stock_alert: initialProduct.min_stock_alert != null ? initialProduct.min_stock_alert : '',
    })
    setWeb({
      is_visible_web: initialProduct.is_visible_web ?? false,
      web_slug: initialProduct.web_slug ?? '',
      web_title: initialProduct.web_title ?? '',
      web_description: initialProduct.web_description ?? '',
      web_tags: Array.isArray(initialProduct.web_tags) ? initialProduct.web_tags : [],
      tagInput: '',
      color: initialProduct.color ?? '',
      material: initialProduct.material ?? '',
    })
    setImages(getInitialImages(initialProduct))
  }, [initialProduct])

  // El usuario introduce el PVP (con IVA); calculamos base_price para guardar en BD
  const basePriceCalculated = useMemo(() => {
    const pvp = typeof precios.pvp === 'number' ? precios.pvp : parseFloat(String(precios.pvp))
    if (Number.isNaN(pvp) || pvp < 0) return null
    return Math.round((pvp / (1 + precios.tax_rate / 100)) * 100) / 100
  }, [precios.pvp, precios.tax_rate])

  const syncSlug = (name: string) => {
    if (!web.web_slug || slugify(basico.name) === web.web_slug) {
      setWeb((w) => ({ ...w, web_slug: slugify(name) }))
    }
  }

  const { execute: doCreateProduct, isLoading: isCreating } = useAction(createProductAction, {
    successMessage: 'Producto creado',
    onSuccess: async (product) => {
      if (!product?.id) {
        router.push('/admin/stock')
        return
      }
      const isFabric = String(product?.product_type || '') === 'tailoring_fabric'
      const metrosIniciales = isFabric ? metrosInicialesRef.current : 0

      if (isFabric && metrosIniciales > 0 && variants.length === 0) {
        const variantSku = `${product.sku}-01`
        const res = await createVariantAction({
          product_id: product.id,
          variant_sku: variantSku,
          size: undefined,
          color: undefined,
        })
        if (res.success && res.data?.id) {
          const whId = initialStockWarehouseId || warehouses?.[0]?.id
          if (whId) {
            await adjustStock({
              variantId: res.data.id,
              warehouseId: whId,
              quantity: metrosIniciales,
              reason: 'Metros iniciales',
              movementType: 'adjustment_positive',
            })
          }
        }
      } else {
        for (const v of variants) {
          const res = await createVariantAction({
            product_id: product.id,
            variant_sku: v.variant_sku,
            size: v.size || undefined,
            color: v.color || undefined,
          })
          if (res.success && res.data?.id && v.stock_inicial > 0) {
            const whId = initialStockWarehouseId || warehouses?.[0]?.id
            if (whId) {
              await adjustStock({
                variantId: res.data.id,
                warehouseId: whId,
                quantity: v.stock_inicial,
                reason: 'Stock inicial',
                movementType: 'adjustment_positive',
              })
            }
          }
        }
      }
      router.push(`/admin/stock/productos/${product.id}`)
    },
  })

  const { execute: doUpdateProduct, isLoading: isUpdating } = useAction(updateProductAction, {
    successMessage: 'Producto actualizado',
    onSuccess: () => {
      onSuccess?.()
    },
  })

  const isSaving = isCreating || isUpdating

  const addVariant = () => {
    const sku = variantForm.variant_sku.trim()
    if (!sku) return
    setVariants((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        size: variantForm.size,
        color: variantForm.color,
        variant_sku: sku,
        stock_inicial: variantForm.stock_inicial || 0,
      },
    ])
    setVariantForm({ size: '', color: '', variant_sku: '', stock_inicial: 0 })
    setShowAddVariant(false)
  }

  const removeVariant = (id: string) => setVariants((prev) => prev.filter((v) => v.id !== id))

  const addTag = () => {
    const t = web.tagInput.trim()
    if (!t || web.web_tags.includes(t)) return
    setWeb((w) => ({ ...w, web_tags: [...w.web_tags, t], tagInput: '' }))
  }

  const removeTag = (tag: string) => setWeb((w) => ({ ...w, web_tags: w.web_tags.filter((t) => t !== tag) }))

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (images.length + files.length > 5) {
      toast.error('Máximo 5 imágenes')
      return
    }
    setIsUploadingImage(true)
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('product-images').upload(path, file)
        if (error) {
          toast.error(`Error subiendo imagen: ${error.message}`)
        } else {
          const { data } = supabase.storage.from('product-images').getPublicUrl(path)
          setImages((prev) => [...prev, data.publicUrl])
        }
      }
    } catch (err: any) {
      toast.error(`Error subiendo imagen: ${err.message || 'Error de red'}`)
    } finally {
      setIsUploadingImage(false)
      e.target.value = ''
    }
  }

  const buildPayload = () => {
    const finalPrice = basePriceCalculated !== null
      ? basePriceCalculated
      : (basico.product_type === 'tailoring_fabric' ? 0 : null)
    if (finalPrice === null) return null
    return {
      ...basico,
      category_id: (basico.category_id && basico.category_id.trim()) || undefined,
      supplier_id: (basico.supplier_id && basico.supplier_id.trim()) || undefined,
      brand: basico.brand || undefined,
      collection: basico.collection || undefined,
      season: basico.season || undefined,
      description: basico.description || undefined,
      supplier_reference: basico.supplier_reference || undefined,
      cost_price: precios.cost_price !== '' ? Number(precios.cost_price) : undefined,
      base_price: finalPrice,
      tax_rate: precios.tax_rate,
      min_stock_alert: precios.min_stock_alert !== '' && precios.min_stock_alert != null
        ? (basico.product_type === 'tailoring_fabric' ? parseFloat(String(precios.min_stock_alert)) : Number(precios.min_stock_alert))
        : undefined,
      is_visible_web: basico.product_type === 'tailoring_fabric' ? false : web.is_visible_web,
      fabric_meters_used: basico.product_type === 'tailoring_fabric' ? (basico.fabric_meters_used !== '' && basico.fabric_meters_used != null ? Number(basico.fabric_meters_used) : 0) : undefined,
      web_slug: web.web_slug || undefined,
      web_title: web.web_title || undefined,
      web_description: web.web_description || undefined,
      web_tags: web.web_tags.length ? web.web_tags : undefined,
      color: web.color || undefined,
      material: web.material || undefined,
      images: images.length ? images : undefined,
      main_image_url: images[0] || undefined,
    }
  }

  const handleSubmit = async () => {
    const payload = buildPayload()
    if (!payload) return
    if (isEdit) {
      await doUpdateProduct({ id: initialProduct.id, data: payload })
    } else {
      if (basico.product_type === 'tailoring_fabric') {
        const m = basico.metros_iniciales === '' || basico.metros_iniciales == null ? 0 : Number(basico.metros_iniciales)
        metrosInicialesRef.current = Number.isFinite(m) && m >= 0 ? m : 0
      } else {
        metrosInicialesRef.current = 0
      }
      await doCreateProduct(payload)
    }
  }

  const canSubmit = !isSaving && !!basico.name.trim() && !!basico.sku.trim() &&
    (basico.product_type === 'tailoring_fabric' || typeof precios.pvp === 'number' || precios.pvp !== '')

  return (
    <div className="space-y-6">
      {showPageHeader && (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/stock"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Nuevo producto</h1>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basico">Información básica</TabsTrigger>
          <TabsTrigger value="precios">Precios</TabsTrigger>
          <TabsTrigger value="web">Web / Tienda</TabsTrigger>
          <TabsTrigger value="variantes">Variantes</TabsTrigger>
        </TabsList>

        <TabsContent value="basico" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Información básica</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    value={basico.name}
                    onChange={(e) => {
                      setBasico((b) => ({ ...b, name: e.target.value }))
                      syncSlug(e.target.value)
                    }}
                    placeholder="Nombre del producto"
                  />
                </div>
                <div className="space-y-2">
                  <Label>SKU *</Label>
                  <Input
                    value={basico.sku}
                    onChange={(e) => setBasico((b) => ({ ...b, sku: e.target.value }))}
                    placeholder="PRATS-001"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo de producto</Label>
                  <Select
                    value={basico.product_type}
                    onValueChange={(v: any) => {
                      const currentCat = categories.find((c) => c.id === basico.category_id)
                      const keepCategory = currentCat && (currentCat.product_type ?? 'boutique') === v
                      setBasico((b) => ({ ...b, product_type: v, category_id: keepCategory ? b.category_id : '' }))
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  {categories.filter((c) => (c.product_type ?? 'boutique') === basico.product_type).length === 0 && (
                    <p className="text-xs text-amber-600 mb-1">
                      No hay categorías para este tipo. Ejecuta en Supabase (SQL Editor) el script{' '}
                      <code className="bg-muted px-1 rounded">scripts/seed-fabric-and-service-categories.sql</code> y recarga la página.
                    </p>
                  )}
                  <Select
                    value={basico.category_id}
                    onValueChange={(v) => setBasico((b) => ({ ...b, category_id: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter((c) => (c.product_type ?? 'boutique') === basico.product_type)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Marca</Label>
                  <Input
                    value={basico.brand}
                    onChange={(e) => setBasico((b) => ({ ...b, brand: e.target.value }))}
                    placeholder="Prats"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Colección</Label>
                  <Input
                    value={basico.collection}
                    onChange={(e) => setBasico((b) => ({ ...b, collection: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Temporada</Label>
                <Input
                  value={basico.season}
                  onChange={(e) => setBasico((b) => ({ ...b, season: e.target.value }))}
                  placeholder="AW25"
                />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={basico.description}
                  onChange={(e) => setBasico((b) => ({ ...b, description: e.target.value }))}
                  placeholder="Descripción del producto"
                  rows={3}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  <Select
                    value={basico.supplier_id}
                    onValueChange={(v) => setBasico((b) => ({ ...b, supplier_id: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Referencia proveedor</Label>
                  <Input
                    value={basico.supplier_reference}
                    onChange={(e) => setBasico((b) => ({ ...b, supplier_reference: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={basico.is_active}
                  onCheckedChange={(v) => setBasico((b) => ({ ...b, is_active: v }))}
                />
                <Label htmlFor="is_active">Activo</Label>
              </div>
              <div className="space-y-2 max-w-xs">
                <Label>
                  {basico.product_type === 'tailoring_fabric'
                    ? 'Stock mínimo de alerta (metros)'
                    : 'Stock mínimo de alerta (unidades)'}
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={basico.product_type === 'tailoring_fabric' ? 0.01 : 1}
                  value={precios.min_stock_alert === '' ? '' : precios.min_stock_alert}
                  onChange={(e) => setPrecios((p) => ({ ...p, min_stock_alert: e.target.value === '' ? '' : (basico.product_type === 'tailoring_fabric' ? parseFloat(e.target.value) : Number(e.target.value)) }))}
                  placeholder={basico.product_type === 'tailoring_fabric' ? 'Ej. 5' : 'Ej. 2'}
                />
              </div>
              {basico.product_type === 'tailoring_fabric' && (
                <>
                  {!isEdit && (
                    <div className="space-y-2 max-w-xs">
                      <Label>Metros disponibles (iniciales)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={basico.metros_iniciales === '' ? '' : basico.metros_iniciales}
                        onChange={(e) => setBasico((b) => ({ ...b, metros_iniciales: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                        placeholder="Ej. 25"
                      />
                      <p className="text-xs text-muted-foreground">Al crear el producto se creará una variante con este stock en metros.</p>
                    </div>
                  )}
                  {isEdit && (
                    <div className="space-y-2 max-w-xs">
                      <Label>Metros gastados</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={basico.fabric_meters_used === '' ? '' : basico.fabric_meters_used}
                        onChange={(e) => setBasico((b) => ({ ...b, fabric_meters_used: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                        placeholder="Ej. 0"
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="precios" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Precios</CardTitle>
              {basico.product_type === 'tailoring_fabric' && (
                <p className="text-sm text-muted-foreground">Precios por metro cuadrado (m²)</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{basico.product_type === 'tailoring_fabric' ? 'Coste por m²' : 'Precio coste'}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={precios.cost_price === '' ? '' : precios.cost_price}
                    onChange={(e) => setPrecios((p) => ({ ...p, cost_price: e.target.value === '' ? '' : Number(e.target.value) }))}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{basico.product_type === 'tailoring_fabric' ? 'PVP por m² (con IVA) *' : 'PVP (precio con IVA) *'}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={precios.pvp === '' ? '' : precios.pvp}
                    onChange={(e) => setPrecios((p) => ({ ...p, pvp: e.target.value === '' ? '' : Number(e.target.value) }))}
                    placeholder="0,00 €"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>IVA %</Label>
                  <Select
                    value={String(precios.tax_rate)}
                    onValueChange={(v) => setPrecios((p) => ({ ...p, tax_rate: Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TAX_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{basico.product_type === 'tailoring_fabric' ? 'Precio por m² sin IVA (base)' : 'Precio sin IVA (base)'}</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                    {basePriceCalculated != null ? formatCurrency(basePriceCalculated) : '—'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="web" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Web / Tienda online</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Imágenes del producto (máx. 5)</Label>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  {images.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border bg-gray-50 group">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {i === 0 && <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">Principal</span>}
                    </div>
                  ))}
                  {images.length < 5 && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors bg-gray-50">
                      {isUploadingImage ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : <><ImagePlus className="h-5 w-5 text-gray-400 mb-1" /><span className="text-xs text-gray-400">Añadir</span></>}
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleImageUpload} disabled={isUploadingImage} />
                    </label>
                  )}
                </div>
              </div>
              {basico.product_type === 'tailoring_fabric' ? (
                <p className="text-sm text-muted-foreground">Los tejidos no se publican en la tienda online.</p>
              ) : (
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_visible_web"
                    checked={web.is_visible_web}
                    onCheckedChange={(v) => setWeb((w) => ({ ...w, is_visible_web: v }))}
                  />
                  <Label htmlFor="is_visible_web">Visible en tienda online</Label>
                </div>
              )}
              <div className="space-y-2">
                <Label>Slug URL</Label>
                <Input
                  value={web.web_slug}
                  onChange={(e) => setWeb((w) => ({ ...w, web_slug: e.target.value }))}
                  placeholder="nombre-producto"
                />
              </div>
              <div className="space-y-2">
                <Label>Título web</Label>
                <Input
                  value={web.web_title}
                  onChange={(e) => setWeb((w) => ({ ...w, web_title: e.target.value }))}
                  placeholder="Título para SEO y ficha"
                />
              </div>
              <div className="space-y-2">
                <Label>Descripción web</Label>
                <Textarea
                  value={web.web_description}
                  onChange={(e) => setWeb((w) => ({ ...w, web_description: e.target.value }))}
                  placeholder="Descripción para la ficha en tienda"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Tags web</Label>
                <div className="flex flex-wrap gap-2">
                  {web.web_tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex gap-1">
                    <Input
                      value={web.tagInput}
                      onChange={(e) => setWeb((w) => ({ ...w, tagInput: e.target.value }))}
                      placeholder="Añadir tag"
                      className="w-32"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={addTag}>Añadir</Button>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input
                    value={web.color}
                    onChange={(e) => setWeb((w) => ({ ...w, color: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Material</Label>
                  <Input
                    value={web.material}
                    onChange={(e) => setWeb((w) => ({ ...w, material: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variantes" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Variantes</CardTitle>
                {!isEdit && (
                  <Button
                    size="sm"
                    className="gap-1 bg-prats-navy hover:bg-prats-navy-light"
                    onClick={() => setShowAddVariant(true)}
                  >
                    <Plus className="h-4 w-4" /> Añadir variante
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEdit && warehouses.length > 0 && (
                <div className="rounded-lg border p-3 bg-muted/20">
                  <Label className="text-sm">Almacén para stock inicial (variantes)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Si asignas stock inicial a una variante, se dará de alta en este almacén.</p>
                  <Select value={initialStockWarehouseId || warehouses[0]?.id} onValueChange={setInitialStockWarehouseId}>
                    <SelectTrigger className="w-full max-w-sm"><SelectValue placeholder="Seleccionar almacén" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}{w.stores?.name ? ` (${w.stores.name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!isEdit && showAddVariant && (
                <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-1">
                      <Label>Talla</Label>
                      <Input
                        value={variantForm.size}
                        onChange={(e) => setVariantForm((f) => ({ ...f, size: e.target.value }))}
                        placeholder="48, M, L..."
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Color</Label>
                      <Input
                        value={variantForm.color}
                        onChange={(e) => setVariantForm((f) => ({ ...f, color: e.target.value }))}
                        placeholder="Azul marino"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>SKU variante *</Label>
                      <Input
                        value={variantForm.variant_sku}
                        onChange={(e) => setVariantForm((f) => ({ ...f, variant_sku: e.target.value }))}
                        placeholder={basico.sku ? `${basico.sku}-01` : 'SKU-01'}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Stock inicial</Label>
                      <Input
                        type="number"
                        min={0}
                        value={variantForm.stock_inicial || ''}
                        onChange={(e) => setVariantForm((f) => ({ ...f, stock_inicial: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addVariant} disabled={!variantForm.variant_sku.trim()} className="bg-prats-navy hover:bg-prats-navy-light">
                      Añadir
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddVariant(false)}>Cancelar</Button>
                  </div>
                </div>
              )}
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU variante</TableHead>
                      <TableHead>Talla</TableHead>
                      <TableHead>Color</TableHead>
                      {!isEdit && <TableHead className="text-right">Stock inicial</TableHead>}
                      {!isEdit && <TableHead className="w-12"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isEdit ? (
                      (initialProduct?.product_variants || []).map((v: any) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono text-sm">{v.variant_sku}</TableCell>
                          <TableCell>{v.size || '—'}</TableCell>
                          <TableCell>{v.color || '—'}</TableCell>
                        </TableRow>
                      ))
                    ) : variants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No hay variantes. Añade al menos una (opcional) o guarda el producto y añade variantes en la ficha.
                        </TableCell>
                      </TableRow>
                    ) : (
                      variants.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono text-sm">{v.variant_sku}</TableCell>
                          <TableCell>{v.size || '—'}</TableCell>
                          <TableCell>{v.color || '—'}</TableCell>
                          <TableCell className="text-right">{v.stock_inicial}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeVariant(v.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2">
        {showPageHeader && (
          <Button variant="outline" asChild><Link href="/admin/stock">Cancelar</Link></Button>
        )}
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-prats-navy hover:bg-prats-navy-light"
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isEdit ? 'Guardar cambios' : 'Guardar producto'}
        </Button>
      </div>
    </div>
  )
}
