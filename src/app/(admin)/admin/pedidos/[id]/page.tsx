import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission, checkUserPermission } from '@/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderDetailContent } from './order-detail-content'

export const metadata: Metadata = { title: 'Ficha de pedido' }

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('orders.view')
  const params = await props.params
  const admin = createAdminClient()

  const { data: order } = await admin
    .from('tailoring_orders')
    .select(`
      *,
      clients ( id, full_name, phone, email, category, client_code ),
      stores ( id, name, code ),
      tailoring_order_lines (
        *,
        garment_types ( id, name, code ),
        fabrics ( id, fabric_code, name, composition ),
        suppliers ( id, name ),
        officials ( id, name )
      ),
      tailoring_order_state_history ( id, from_status, to_status, description, notes, changed_by_name, changed_at ),
      tailoring_fittings ( id, fitting_number, scheduled_date, scheduled_time, status, adjustments_needed, notes, duration_minutes )
    `)
    .eq('id', params.id)
    .single()

  if (!order) notFound()

  // Defensa en profundidad, mismo criterio que getOrder (actions/orders.ts): el
  // gateo en UI no basta. Sin esto, coste y margen del pedido y de cada prenda
  // viajaban íntegros en la respuesta RSC de la página y se leían desde la
  // pestaña Red con un rol que no puede verlos (vendedor_avanzado entra a
  // /admin/pedidos por la excepción del middleware y NO tiene orders.view_costs).
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const canViewCosts = user ? await checkUserPermission(user.id, 'orders.view_costs') : false
  if (!canViewCosts) {
    const o = order as Record<string, unknown>
    o.total_material_cost = null
    o.total_labor_cost = null
    o.total_factory_cost = null
    o.total_cost = null
    for (const line of (o.tailoring_order_lines ?? []) as Record<string, unknown>[]) {
      line.material_cost = null
      line.lining_cost = null
      line.labor_cost = null
      line.factory_cost = null
    }
  }

  // Cargar clientMeasurements (mismo patrón que getOrder en actions/orders.ts).
  // Sin esto, el PDF de Camisería no puede hacer fallback a las medidas vigentes
  // del cliente cuando line.configuration está vacía.
  const clientId = order.client_id as string | undefined
  if (clientId) {
    const { data: rows } = await admin
      .from('client_measurements')
      .select('values')
      .eq('client_id', clientId)
      .eq('is_current', true)
    const merged: Record<string, unknown> = {}
    for (const r of rows ?? []) {
      const v = (r as { values?: unknown }).values
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue
      for (const [k, val] of Object.entries(v)) {
        if (val !== null && val !== undefined && val !== '') merged[k] = val
      }
    }
    ;(order as Record<string, unknown>).clientMeasurements = { values: merged }
  }

  return <OrderDetailContent order={order} />
}
