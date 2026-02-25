'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createClientSchema, updateClientSchema, clientNoteSchema, clientMeasurementsSchema } from '@/lib/validations/clients'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'

export const listClients = protectedAction<ListParams, ListResult<any>>(
  { permission: 'clients.view', auditModule: 'clients' },
  async (ctx, params) => {
    const result = await queryList('clients', {
      ...params,
      searchFields: ['full_name', 'email', 'phone', 'document_number', 'client_code'],
    }, `
      id, client_code, full_name, first_name, last_name, email, phone,
      category, client_type, is_active, total_spent, total_pending,
      purchase_count, average_ticket, tags, created_at,
      home_store_id, assigned_salesperson_id
    `)
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
    return success(client)
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

      const result = { ...client, accountCreated: !!profileId }
      return success(result)
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

    const { data: client, error } = await ctx.adminClient
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return failure(error.message)
    return success(client)
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
    return success(measurement)
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
    return success(data)
  }
)
