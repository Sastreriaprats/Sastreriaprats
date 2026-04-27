'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createClientSchema, updateClientSchema, clientNoteSchema, clientMeasurementsSchema } from '@/lib/validations/clients'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { sendWelcomeEmail } from '@/lib/email/transactional'
import { buildAuditDiff } from '@/lib/audit'

type ClientAggregates = { spent: number; pending: number; count: number }

/**
 * Calcula en vivo los totales por cliente sumando pedidos de confección
 * (`tailoring_orders`) y ventas POS completadas (`sales`). Las columnas
 * homónimas en `clients` están sin trigger y permanecen a 0.
 */
async function computeClientAggregates(
  admin: AdminClient,
  clientIds: string[],
): Promise<Map<string, ClientAggregates>> {
  const map = new Map<string, ClientAggregates>()
  if (clientIds.length === 0) return map

  const [ordersRes, salesRes] = await Promise.all([
    admin
      .from('tailoring_orders')
      .select('client_id, total_paid, total_pending')
      .in('client_id', clientIds)
      .neq('status', 'cancelled'),
    admin
      .from('sales')
      .select('client_id, total')
      .in('client_id', clientIds)
      .eq('status', 'completed'),
  ])

  for (const o of (ordersRes.data ?? []) as Array<Record<string, unknown>>) {
    const id = String(o.client_id || '')
    if (!id) continue
    const cur = map.get(id) ?? { spent: 0, pending: 0, count: 0 }
    cur.spent += Number(o.total_paid) || 0
    cur.pending += Number(o.total_pending) || 0
    cur.count += 1
    map.set(id, cur)
  }
  for (const s of (salesRes.data ?? []) as Array<Record<string, unknown>>) {
    const id = String(s.client_id || '')
    if (!id) continue
    const cur = map.get(id) ?? { spent: 0, pending: 0, count: 0 }
    cur.spent += Number(s.total) || 0
    cur.count += 1
    map.set(id, cur)
  }

  return map
}

function applyAggregates<T extends Record<string, unknown>>(
  client: T,
  agg: ClientAggregates | undefined,
): T {
  const a = agg ?? { spent: 0, pending: 0, count: 0 }
  return {
    ...client,
    total_spent: a.spent,
    total_pending: a.pending,
    purchase_count: a.count,
    average_ticket: a.count > 0 ? a.spent / a.count : 0,
  }
}

export const listClients = protectedAction<ListParams, ListResult<any>>(
  { permission: 'clients.view', auditModule: 'clients' },
  async (ctx, params) => {
    const result = await queryList<Record<string, unknown>>('clients', {
      ...params,
      searchFields: ['full_name', 'email', 'phone', 'document_number', 'client_code'],
    }, `
      id, client_code, full_name, first_name, last_name, email, phone,
      category, client_type, is_active, total_spent, total_pending,
      purchase_count, average_ticket, tags, created_at,
      home_store_id, assigned_salesperson_id
    `)

    const ids = result.data.map((c) => String(c.id))
    const aggregates = await computeClientAggregates(ctx.adminClient, ids)
    result.data = result.data.map((c) => applyAggregates(c, aggregates.get(String(c.id))))

    return success(result)
  }
)

export const getClient = protectedAction<string, any>(
  { permission: 'clients.view', auditModule: 'clients' },
  async (ctx, clientId) => {
    const client = await queryById('clients', clientId, `
      *,
      client_notes ( id, note_type, title, content, is_pinned, created_at, created_by_name ),
      boutique_alterations ( id, description, cost, status, created_at )
    `)
    if (!client) return failure('Cliente no encontrado', 'NOT_FOUND')

    const aggregates = await computeClientAggregates(ctx.adminClient, [clientId])
    return success(applyAggregates(client as Record<string, unknown>, aggregates.get(clientId)))
  }
)

export const createClientAction = protectedAction<any, any>(
  {
    permission: 'clients.create',
    auditModule: 'clients',
    auditAction: 'create',
    auditEntity: 'client',
    revalidate: ['/admin/clientes'],
  },
  async (ctx, input) => {
    try {
      const parsed = createClientSchema.safeParse(input)
      if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

      const clientCode = await getNextNumber('clients', 'client_code', 'CLI')
      const email = parsed.data.email?.trim()?.toLowerCase() || null
      const hasValidEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

      let profileId: string | null = null
      const defaultPassword = process.env.CLIENT_DEFAULT_PASSWORD

      if (hasValidEmail && defaultPassword) {
        const fullName = `${parsed.data.first_name || ''} ${parsed.data.last_name || ''}`.trim()
        const { data: authData, error: authError } = await ctx.adminClient.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName || email,
            first_name: parsed.data.first_name || '',
            last_name: parsed.data.last_name || '',
          },
        })

        if (authError) {
          const msg = authError.message || ''
          const alreadyExists = /already|exists|registered|duplicate/i.test(msg)
          if (alreadyExists) {
            console.error('[createClientAction] auth user already exists for', email, authError)
            // Crear cliente sin cuenta; el email ya tiene usuario
          } else {
            console.error('[createClientAction] createUser:', authError)
            return failure('No se pudo crear la cuenta de acceso: ' + (msg || authError.message))
          }
        } else if (authData?.user?.id) {
          profileId = authData.user.id

          const { data: clientRole } = await ctx.adminClient
            .from('roles')
            .select('id')
            .eq('name', 'client')
            .single()

          if (clientRole) {
            const { error: roleErr } = await ctx.adminClient.from('user_roles').insert({
              user_id: profileId,
              role_id: clientRole.id,
            })
            if (roleErr) console.error('[createClientAction] user_roles:', roleErr)
          }
        }
      }

      const insertPayload: Record<string, unknown> = {
        ...parsed.data,
        client_code: clientCode,
        created_by: ctx.userId,
      }
      delete (insertPayload as Record<string, unknown>).full_name
      if (profileId) insertPayload.profile_id = profileId

      const { data: client, error } = await ctx.adminClient
        .from('clients')
        .insert(insertPayload)
        .select()
        .single()

      if (error) return failure(error.message)

      const clientEmail = (client as { email?: string } | null)?.email
      if (clientEmail) {
        const fullName = `${parsed.data.first_name || ''} ${parsed.data.last_name || ''}`.trim()
        const firstName = parsed.data.first_name || ''
        try {
          await sendWelcomeEmail({
            name: fullName || firstName || 'Cliente',
            email: clientEmail,
            password: profileId && defaultPassword ? defaultPassword : undefined,
          })
        } catch (emailError) {
          console.error('[createClientAction] Error enviando welcome email:', emailError)
        }
      }

      const result = { ...client, accountCreated: !!profileId }
      const auditDescription = `Cliente: ${parsed.data.first_name || ''} ${parsed.data.last_name || ''}`.trim() || 'Cliente (sin nombre)'
      return success({ ...result, auditDescription })
    } catch (e) {
      console.error('[createClientAction] unexpected:', e)
      return failure('Error inesperado al crear el cliente')
    }
  }
)

export const updateClientAction = protectedAction<{ id: string; data: any }, any>(
  {
    permission: 'clients.edit',
    auditModule: 'clients',
    auditAction: 'update',
    auditEntity: 'client',
    revalidate: ['/admin/clientes'],
  },
  async (ctx, { id, data: input }) => {
    const parsed = updateClientSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const updateData: any = { ...parsed.data }
    delete updateData.full_name

    const { data: before } = await ctx.adminClient
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    const { data: client, error } = await ctx.adminClient
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return failure(error.message)
    const diff = buildAuditDiff(before as Record<string, unknown> | null, client as Record<string, unknown> | null)
    const fullName = (client as any)?.full_name || [(client as any)?.first_name, (client as any)?.last_name].filter(Boolean).join(' ') || 'Cliente'
    return success({
      ...(client as Record<string, unknown>),
      auditDescription: `Cliente: ${fullName}`,
      auditOldData: diff?.auditOldData,
      auditNewData: diff?.auditNewData,
    })
  }
)

export const deleteClientAction = protectedAction<string, { id: string }>(
  {
    permission: 'clients.delete',
    auditModule: 'clients',
    auditAction: 'delete',
    auditEntity: 'client',
    revalidate: ['/admin/clientes'],
  },
  async (ctx, clientId) => {
    const { error } = await ctx.adminClient
      .from('clients')
      .update({ is_active: false })
      .eq('id', clientId)

    if (error) return failure(error.message)
    return success({ id: clientId })
  }
)

export const hardDeleteClientAction = protectedAction<string, { id: string }>(
  {
    permission: 'clients.delete',
    auditModule: 'clients',
    auditAction: 'delete',
    auditEntity: 'client',
    revalidate: ['/admin/clientes'],
  },
  async (ctx, clientId) => {
    // Verificar que el usuario es administrador
    const { data: userRoles } = await ctx.adminClient
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', ctx.userId)

    const isAdmin = userRoles?.some((ur: any) => {
      const r = ur.roles as { name?: string } | null
      return r?.name && ['administrador', 'super_admin'].includes(r.name)
    })

    if (!isAdmin) return failure('Solo los administradores pueden eliminar clientes permanentemente')

    const { error } = await ctx.adminClient
      .from('clients')
      .delete()
      .eq('id', clientId)

    if (error) {
      if (error.message?.includes('fkey') || error.code === '23503') {
        return failure('No se puede eliminar este cliente porque tiene pedidos, ventas u otros registros asociados. Puedes desactivarlo en su lugar.')
      }
      return failure(error.message)
    }
    return success({ id: clientId })
  }
)

export const addClientNote = protectedAction<any, any>(
  {
    permission: 'clients.edit',
    auditModule: 'clients',
    auditAction: 'create',
    auditEntity: 'client_note',
    revalidate: ['/admin/clientes'],
  },
  async (ctx, input) => {
    const parsed = clientNoteSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const { data: note, error } = await ctx.adminClient
      .from('client_notes')
      .insert({
        ...parsed.data,
        created_by: ctx.userId,
        created_by_name: ctx.userName,
      })
      .select()
      .single()

    if (error) return failure(error.message)
    return success(note)
  }
)

export const saveClientMeasurements = protectedAction<any, any>(
  {
    permission: 'clients.edit',
    auditModule: 'clients',
    auditAction: 'create',
    auditEntity: 'client_measurements',
    revalidate: ['/admin/clientes'],
  },
  async (ctx, input) => {
    const parsed = clientMeasurementsSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const { data: measurement, error } = await ctx.adminClient
      .from('client_measurements')
      .insert({
        ...parsed.data,
        taken_by: ctx.userId,
        taken_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return failure(error.message)
    const clientName = await (async () => {
      const { data: c } = await ctx.adminClient.from('clients').select('full_name, first_name, last_name').eq('id', measurement.client_id).single()
      if (!c) return 'Cliente'
      return (c as any).full_name || [ (c as any).first_name, (c as any).last_name ].filter(Boolean).join(' ') || 'Cliente'
    })()
    const garmentName = await (async () => {
      const { data: g } = await ctx.adminClient.from('garment_types').select('name').eq('id', measurement.garment_type_id).single()
      return (g as any)?.name ?? 'Prenda'
    })()
    const auditDescription = `Medidas de: ${clientName} · Prenda: ${garmentName}`
    return success({ ...measurement, auditDescription })
  }
)

export const getClientMeasurements = protectedAction<{ clientId: string; garmentTypeId?: string }, any[]>(
  { permission: 'clients.view', auditModule: 'clients' },
  async (ctx, { clientId, garmentTypeId }) => {
    let query = ctx.adminClient
      .from('client_measurements')
      .select('*, garment_types ( name, code )')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (garmentTypeId) query = query.eq('garment_type_id', garmentTypeId)

    const { data, error } = await query
    if (error) return failure(error.message)
    return success(data || [])
  }
)

export const saveBodyMeasurements = protectedAction<{ client_id: string; values: Record<string, string>; garment_type_id: string }, any>(
  {
    permission: 'clients.edit',
    auditModule: 'clients',
    auditAction: 'update',
    auditEntity: 'client_measurements',
    revalidate: ['/admin/clientes'],
  },
  async (ctx, input) => {
    // Leer medidas actuales (antes del cambio) para calcular diff detallado
    const { data: prev } = await ctx.adminClient
      .from('client_measurements')
      .select('id, values, version')
      .eq('client_id', input.client_id)
      .eq('garment_type_id', input.garment_type_id)
      .eq('is_current', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const prevValues = (prev?.values ?? {}) as Record<string, unknown>

    // Desactivar medidas anteriores
    const { error: updateError } = await ctx.adminClient
      .from('client_measurements')
      .update({ is_current: false })
      .eq('client_id', input.client_id)
      .eq('garment_type_id', input.garment_type_id)

    if (updateError) {
      console.error('[saveBodyMeasurements] UPDATE error:', updateError)
      return failure(updateError.message)
    }

    // Obtener última versión
    const { data: last } = await ctx.adminClient
      .from('client_measurements')
      .select('version')
      .eq('client_id', input.client_id)
      .eq('garment_type_id', input.garment_type_id)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const nextVersion = (last?.version ?? 0) + 1

    const { data, error } = await ctx.adminClient
      .from('client_measurements')
      .insert({
        client_id: input.client_id,
        garment_type_id: input.garment_type_id,
        measurement_type: 'artesanal',
        values: input.values,
        is_current: true,
        version: nextVersion,
        taken_at: new Date().toISOString(),
        taken_by: ctx.userId,
      })
      .select()
      .single()

    if (error) return failure(error.message)

    // Diff de medidas: solo los campos (cm) que cambiaron
    const newValues = (input.values ?? {}) as Record<string, unknown>
    const keys = new Set([...Object.keys(prevValues), ...Object.keys(newValues)])
    const oldDiff: Record<string, unknown> = {}
    const newDiff: Record<string, unknown> = {}
    for (const k of keys) {
      if (String(prevValues[k] ?? '') !== String(newValues[k] ?? '')) {
        oldDiff[k] = prevValues[k] ?? null
        newDiff[k] = newValues[k] ?? null
      }
    }

    // Resolver nombre del cliente y prenda para descripción
    const { data: clientRow } = await ctx.adminClient
      .from('clients')
      .select('full_name, first_name, last_name')
      .eq('id', input.client_id)
      .single()
    const clientName = (clientRow as any)?.full_name
      || [(clientRow as any)?.first_name, (clientRow as any)?.last_name].filter(Boolean).join(' ')
      || 'Cliente'
    const { data: garmentRow } = await ctx.adminClient
      .from('garment_types')
      .select('name')
      .eq('id', input.garment_type_id)
      .single()
    const garmentName = (garmentRow as any)?.name ?? 'Prenda'

    return success({
      ...(data as Record<string, unknown>),
      auditDescription: `Medidas · ${clientName} · ${garmentName}`,
      auditOldData: Object.keys(oldDiff).length ? oldDiff : undefined,
      auditNewData: Object.keys(newDiff).length ? newDiff : undefined,
    })
  }
)
