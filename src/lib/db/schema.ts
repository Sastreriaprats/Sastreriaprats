// ==========================================
// SASTRERÍA PRATS — Database Schema
// ==========================================
// Espejo de la migración 001_auth_roles_stores.sql

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  decimal,
  boolean,
  timestamp,
  jsonb,
  date,
  time,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ========== ENUMS ==========

export const userRoleTypeEnum = pgEnum('user_role_type', [
  'super_admin',
  'admin',
  'accountant',
  'tailor',
  'salesperson',
  'web_manager',
  'client',
])

export const entityStatusEnum = pgEnum('entity_status', [
  'active',
  'inactive',
  'suspended',
])

export const storeTypeEnum = pgEnum('store_type', [
  'physical',
  'online',
  'warehouse',
])

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'read',
  'update',
  'delete',
  'login',
  'logout',
  'pin_login',
  'pin_logout',
  'export',
  'import',
  'print',
  'approve',
  'reject',
  'cancel',
  'state_change',
  'payment',
  'refund',
])

export const sessionTypeEnum = pgEnum('session_type', [
  'web',
  'admin',
  'pos',
  'mobile',
  'api',
])

// Enums migración 002
export const clientTypeEnum = pgEnum('client_type', ['individual', 'company'])
export const clientCategoryEnum = pgEnum('client_category', ['standard', 'vip', 'premium', 'gold', 'ambassador'])
export const genderTypeEnum = pgEnum('gender_type', ['male', 'female', 'other', 'unspecified'])
export const measurementTypeEnum = pgEnum('measurement_type', ['artesanal', 'industrial'])
export const supplierTypeEnum = pgEnum('supplier_type', ['fabric', 'manufacturing', 'accessories', 'trimmings', 'services', 'logistics', 'other'])
export const paymentTermTypeEnum = pgEnum('payment_term_type', ['immediate', 'net_15', 'net_30', 'net_60', 'net_90', 'custom'])
export const fabricUnitEnum = pgEnum('fabric_unit', ['meters', 'yards', 'pieces'])
export const fabricStatusEnum = pgEnum('fabric_status', ['active', 'discontinued', 'seasonal', 'out_of_stock'])
export const supplierOrderStatusEnum = pgEnum('supplier_order_status', [
  'draft', 'sent', 'confirmed', 'partially_received', 'received', 'incident', 'cancelled',
])

// ========== TABLAS ==========

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  preferredLocale: text('preferred_locale').default('es'),
  darkMode: boolean('dark_mode').default(false),
  pinHash: text('pin_hash'),
  isActive: boolean('is_active').default(true).notNull(),
  status: entityStatusEnum('status').default('active').notNull(),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  deactivationReason: text('deactivation_reason'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastLoginIp: text('last_login_ip'),
  lastLoginDevice: text('last_login_device'),
  loginCount: integer('login_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  roleType: text('role_type').default('custom'),
  systemRole: userRoleTypeEnum('system_role'),
  hierarchyLevel: integer('hierarchy_level').default(50).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  color: text('color').default('#6B7280'),
  icon: text('icon').default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  module: text('module').notNull(),
  action: text('action').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  sortOrder: integer('sort_order').default(0),
  isSensitive: boolean('is_sensitive').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id')
    .notNull()
    .references(() => permissions.id, { onDelete: 'cascade' }),
  grantedBy: uuid('granted_by').references(() => profiles.id, { onDelete: 'set null' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
})

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  assignedBy: uuid('assigned_by').references(() => profiles.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow(),
  validUntil: timestamp('valid_until', { withTimezone: true }),
})

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 10 }).notNull().unique(),
  name: text('name').notNull(),
  displayName: text('display_name'),
  storeType: storeTypeEnum('store_type').default('physical').notNull(),
  address: text('address'),
  addressLine2: text('address_line2'),
  city: text('city').default('Madrid'),
  postalCode: text('postal_code'),
  province: text('province').default('Madrid'),
  country: text('country').default('España'),
  phone: text('phone'),
  email: text('email'),
  openingHours: jsonb('opening_hours').default({}),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  googleMapsUrl: text('google_maps_url'),
  defaultCashFund: decimal('default_cash_fund', { precision: 10, scale: 2 }).default('300.00'),
  fiscalName: text('fiscal_name'),
  fiscalNif: text('fiscal_nif'),
  fiscalAddress: text('fiscal_address'),
  invoicePrefix: text('invoice_prefix'),
  orderPrefix: text('order_prefix'),
  lastOrderNumber: integer('last_order_number').default(0),
  lastInvoiceNumber: integer('last_invoice_number').default(0),
  slug: text('slug').unique(),
  description: text('description'),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true).notNull(),
  status: entityStatusEnum('status').default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 10 }).notNull().unique(),
  name: text('name').notNull(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  address: text('address'),
  city: text('city'),
  isMain: boolean('is_main').default(false),
  acceptsOnlineStock: boolean('accepts_online_stock').default(false),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const userStores = pgTable('user_stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  isPrimary: boolean('is_primary').default(false),
  assignedBy: uuid('assigned_by').references(() => profiles.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
})

export const activeSessions = pgTable('active_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  sessionType: sessionTypeEnum('session_type').notNull(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceInfo: text('device_info'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
})

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  userEmail: text('user_email'),
  userFullName: text('user_full_name'),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  sessionType: sessionTypeEnum('session_type'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  action: auditActionEnum('action').notNull(),
  module: text('module').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  entityDisplay: text('entity_display'),
  description: text('description'),
  oldData: jsonb('old_data'),
  newData: jsonb('new_data'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const systemConfig = pgTable('system_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  category: text('category').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  valueType: text('value_type').notNull(),
  isRequired: boolean('is_required').default(false),
  defaultValue: jsonb('default_value'),
  isSensitive: boolean('is_sensitive').default(false),
  requiresAdmin: boolean('requires_admin').default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull(),
  link: text('link'),
  module: text('module'),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ========== TABLAS MIGRACIÓN 002 ==========

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  clientCode: varchar('client_code', { length: 20 }).unique(),
  clientType: clientTypeEnum('client_type').default('individual').notNull(),
  category: clientCategoryEnum('category').default('standard').notNull(), // DB: client_category enum
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  fullName: text('full_name'),
  email: text('email'),
  phone: text('phone'),
  phoneSecondary: text('phone_secondary'),
  dateOfBirth: date('date_of_birth'),
  gender: genderTypeEnum('gender').default('unspecified'),
  nationality: text('nationality'),
  documentType: text('document_type').default('DNI'),
  documentNumber: text('document_number'),
  companyName: text('company_name'),
  companyNif: text('company_nif'),
  companyContactName: text('company_contact_name'),
  address: text('address'),
  addressLine2: text('address_line2'),
  city: text('city'),
  postalCode: text('postal_code'),
  province: text('province'),
  country: text('country').default('España'),
  shippingAddress: text('shipping_address'),
  shippingCity: text('shipping_city'),
  shippingPostalCode: text('shipping_postal_code'),
  shippingProvince: text('shipping_province'),
  shippingCountry: text('shipping_country'),
  standardSizes: jsonb('standard_sizes').default({}),
  preferences: jsonb('preferences').default({}),
  tags: text('tags').array(),
  source: text('source'),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).default('0.00'),
  acceptsMarketing: boolean('accepts_marketing').default(false).notNull(),
  marketingConsentDate: timestamp('marketing_consent_date', { withTimezone: true }),
  acceptsDataStorage: boolean('accepts_data_storage').default(false).notNull(),
  dataConsentDate: timestamp('data_consent_date', { withTimezone: true }),
  newsletterSubscribed: boolean('newsletter_subscribed').default(false),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }).default('0.00'),
  totalPending: decimal('total_pending', { precision: 12, scale: 2 }).default('0.00'),
  lastPurchaseDate: timestamp('last_purchase_date', { withTimezone: true }),
  firstPurchaseDate: timestamp('first_purchase_date', { withTimezone: true }),
  purchaseCount: integer('purchase_count').default(0),
  averageTicket: decimal('average_ticket', { precision: 10, scale: 2 }).default('0.00'),
  isActive: boolean('is_active').default(true).notNull(),
  homeStoreId: uuid('home_store_id').references(() => stores.id, { onDelete: 'set null' }),
  assignedSalespersonId: uuid('assigned_salesperson_id').references(() => profiles.id, { onDelete: 'set null' }),
  internalNotes: text('internal_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
})

export const clientContacts = pgTable('client_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: text('position'),
  email: text('email'),
  phone: text('phone'),
  isPrimary: boolean('is_primary').default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const clientNotes = pgTable('client_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  noteType: text('note_type').default('general'),
  title: text('title'),
  content: text('content').notNull(),
  isPinned: boolean('is_pinned').default(false),
  isPrivate: boolean('is_private').default(false),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdByName: text('created_by_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const garmentTypes = pgTable('garment_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  name: text('name').notNull(),
  category: text('category').default('sastreria'),
  sortOrder: integer('sort_order').default(0),
  icon: text('icon').default('shirt'),
  hasSketch: boolean('has_sketch').default(false),
  sketchUrl: text('sketch_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const measurementFields = pgTable('measurement_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  garmentTypeId: uuid('garment_type_id').notNull().references(() => garmentTypes.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 50 }).notNull(),
  name: text('name').notNull(),
  fieldType: text('field_type').default('number'),
  options: jsonb('options'),
  unit: text('unit').default('cm'),
  minValue: decimal('min_value', { precision: 8, scale: 2 }),
  maxValue: decimal('max_value', { precision: 8, scale: 2 }),
  appliesTo: text('applies_to').default('both'),
  sortOrder: integer('sort_order').default(0),
  isRequired: boolean('is_required').default(false),
  helpText: text('help_text'),
  fieldGroup: text('field_group'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const clientMeasurements = pgTable('client_measurements', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  garmentTypeId: uuid('garment_type_id').notNull().references(() => garmentTypes.id, { onDelete: 'restrict' }),
  measurementType: measurementTypeEnum('measurement_type').notNull(),
  version: integer('version').notNull().default(1),
  isCurrent: boolean('is_current').default(true).notNull(),
  orderId: uuid('order_id'),
  values: jsonb('values').notNull().default({}),
  bodyObservations: text('body_observations'),
  takenBy: uuid('taken_by').references(() => profiles.id, { onDelete: 'set null' }),
  takenByName: text('taken_by_name'),
  takenAt: timestamp('taken_at', { withTimezone: true }).defaultNow().notNull(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const garmentConfigOptions = pgTable('garment_config_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  garmentTypeId: uuid('garment_type_id').notNull().references(() => garmentTypes.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 50 }).notNull(),
  name: text('name').notNull(),
  optionType: text('option_type').default('select'),
  availableOptions: jsonb('available_options').default([]),
  defaultValue: text('default_value'),
  sortOrder: integer('sort_order').default(0),
  fieldGroup: text('field_group'),
  isRequired: boolean('is_required').default(false),
  helpText: text('help_text'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const boutiqueAlterations = pgTable('boutique_alterations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  garmentDescription: text('garment_description'),
  alterationDetails: text('alteration_details'),
  hasCost: boolean('has_cost').default(false),
  cost: decimal('cost', { precision: 10, scale: 2 }).default('0.00'),
  isIncluded: boolean('is_included').default(false),
  saleId: uuid('sale_id'),
  status: text('status').default('pending'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  estimatedCompletion: date('estimated_completion'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  registeredBy: uuid('registered_by').references(() => profiles.id, { onDelete: 'set null' }),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const clientTags = pgTable('client_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  color: text('color').default('#6B7280'),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const clientEmailHistory = pgTable('client_email_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  templateName: text('template_name'),
  toEmail: text('to_email').notNull(),
  fromEmail: text('from_email'),
  status: text('status').default('sent'),
  resendId: text('resend_id'),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  sentBy: uuid('sent_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierCode: varchar('supplier_code', { length: 20 }).unique(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  nifCif: text('nif_cif'),
  supplierTypes: text('supplier_types').array(),
  tags: text('tags').array(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  address: text('address'),
  city: text('city'),
  postalCode: text('postal_code'),
  province: text('province'),
  country: text('country').default('España'),
  bankName: text('bank_name'),
  bankIban: text('bank_iban'),
  bankSwift: text('bank_swift'),
  paymentTerms: paymentTermTypeEnum('payment_terms').default('net_30'),
  paymentDays: integer('payment_days').default(30),
  minimumOrder: decimal('minimum_order', { precision: 10, scale: 2 }),
  shippingIncluded: boolean('shipping_included').default(false),
  shippingCost: decimal('shipping_cost', { precision: 10, scale: 2 }),
  emailTemplate: text('email_template'),
  preferredLanguage: text('preferred_language').default('es'),
  deliveryAddress: text('delivery_address'),
  deliveryNotes: text('delivery_notes'),
  isActive: boolean('is_active').default(true).notNull(),
  totalDebt: decimal('total_debt', { precision: 12, scale: 2 }).default('0.00'),
  totalPaid: decimal('total_paid', { precision: 12, scale: 2 }).default('0.00'),
  internalNotes: text('internal_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
})

export const supplierContacts = pgTable('supplier_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: text('position'),
  department: text('department'),
  email: text('email'),
  phone: text('phone'),
  isPrimary: boolean('is_primary').default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const fabricCategories = pgTable('fabric_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const fabrics = pgTable('fabrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  fabricCode: varchar('fabric_code', { length: 30 }).unique(),
  name: text('name').notNull(),
  description: text('description'),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  supplierReference: text('supplier_reference'),
  categoryId: uuid('category_id').references(() => fabricCategories.id, { onDelete: 'set null' }),
  composition: text('composition'),
  weightGsm: integer('weight_gsm'),
  widthCm: integer('width_cm'),
  colorName: text('color_name'),
  colorHex: text('color_hex'),
  pattern: text('pattern'),
  season: text('season'),
  collection: text('collection'),
  year: integer('year'),
  isPermanent: boolean('is_permanent').default(false),
  pricePerMeter: decimal('price_per_meter', { precision: 10, scale: 2 }),
  unit: fabricUnitEnum('unit').default('meters'),
  currency: text('currency').default('EUR'),
  stockMeters: decimal('stock_meters', { precision: 10, scale: 2 }).default('0.00'),
  reservedMeters: decimal('reserved_meters', { precision: 10, scale: 2 }).default('0.00'),
  minStockMeters: decimal('min_stock_meters', { precision: 10, scale: 2 }),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
  imageUrl: text('image_url'),
  swatchUrl: text('swatch_url'),
  status: fabricStatusEnum('status').default('active').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const supplierOrders = pgTable('supplier_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 30 }).notNull().unique(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  status: supplierOrderStatusEnum('status').default('draft').notNull(),
  destinationStoreId: uuid('destination_store_id').references(() => stores.id, { onDelete: 'set null' }),
  destinationWarehouseId: uuid('destination_warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
  orderDate: date('order_date'),
  estimatedDeliveryDate: date('estimated_delivery_date'),
  actualDeliveryDate: date('actual_delivery_date'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).default('0.00'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).default('0.00'),
  shippingCost: decimal('shipping_cost', { precision: 10, scale: 2 }).default('0.00'),
  total: decimal('total', { precision: 12, scale: 2 }).default('0.00'),
  sentByEmail: boolean('sent_by_email').default(false),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  emailConfirmed: boolean('email_confirmed').default(false),
  emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true }),
  internalNotes: text('internal_notes'),
  supplierNotes: text('supplier_notes'),
  tailoringOrderId: uuid('tailoring_order_id'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const supplierOrderLines = pgTable('supplier_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierOrderId: uuid('supplier_order_id').notNull().references(() => supplierOrders.id, { onDelete: 'cascade' }),
  fabricId: uuid('fabric_id').references(() => fabrics.id, { onDelete: 'set null' }),
  productId: uuid('product_id'),
  description: text('description').notNull(),
  reference: text('reference'),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unit: text('unit').default('meters'),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 12, scale: 2 }),
  quantityReceived: decimal('quantity_received', { precision: 10, scale: 2 }).default('0.00'),
  isFullyReceived: boolean('is_fully_received').default(false),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedBy: uuid('received_by').references(() => profiles.id, { onDelete: 'set null' }),
  hasIncident: boolean('has_incident').default(false),
  incidentDescription: text('incident_description'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const supplierInvoices = pgTable('supplier_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  invoiceNumber: text('invoice_number').notNull(),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('21.00'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  amountPaid: decimal('amount_paid', { precision: 12, scale: 2 }).default('0.00'),
  isFullyPaid: boolean('is_fully_paid').default(false),
  supplierOrderId: uuid('supplier_order_id').references(() => supplierOrders.id, { onDelete: 'set null' }),
  documentUrl: text('document_url'),
  notes: text('notes'),
  registeredBy: uuid('registered_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const supplierPayments = pgTable('supplier_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  supplierInvoiceId: uuid('supplier_invoice_id').references(() => supplierInvoices.id, { onDelete: 'set null' }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  paymentDate: date('payment_date').notNull(),
  paymentMethod: text('payment_method').default('transfer'),
  bankReference: text('bank_reference'),
  notes: text('notes'),
  registeredBy: uuid('registered_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const supplierDueDates = pgTable('supplier_due_dates', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  supplierInvoiceId: uuid('supplier_invoice_id').references(() => supplierInvoices.id, { onDelete: 'cascade' }),
  dueDate: date('due_date').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  isPaid: boolean('is_paid').default(false),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentId: uuid('payment_id').references(() => supplierPayments.id, { onDelete: 'set null' }),
  alertSent: boolean('alert_sent').default(false),
  alertDaysBefore: integer('alert_days_before').default(7),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ========== ENUMS 003 ==========

export const productTypeEnum = pgEnum('product_type', ['boutique', 'tailoring_fabric', 'accessory', 'service'])
export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'purchase', 'sale', 'return', 'transfer_in', 'transfer_out',
  'adjustment_positive', 'adjustment_negative', 'inventory',
  'reservation', 'reservation_release', 'initial',
])
export const transferStatusEnum = pgEnum('transfer_status', ['requested', 'approved', 'in_transit', 'received', 'cancelled'])
export const tailoringOrderTypeEnum = pgEnum('tailoring_order_type', ['artesanal', 'industrial'])
export const tailoringOrderStatusEnum = pgEnum('tailoring_order_status', [
  'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
  'in_production', 'fitting', 'adjustments', 'finished',
  'delivered', 'incident', 'cancelled',
])
export const cashSessionStatusEnum = pgEnum('cash_session_status', ['open', 'closed'])
export const saleStatusEnum = pgEnum('sale_status', ['completed', 'partially_returned', 'fully_returned', 'voided'])
export const paymentMethodTypeEnum = pgEnum('payment_method_type', ['cash', 'card', 'bizum', 'transfer', 'voucher', 'mixed'])
export const voucherStatusEnum = pgEnum('voucher_status', ['active', 'partially_used', 'used', 'expired', 'cancelled'])
export const accountTypeEnum = pgEnum('account_type', ['asset', 'liability', 'equity', 'income', 'expense'])
export const entryStatusEnum = pgEnum('entry_status', ['draft', 'posted', 'cancelled'])
export const invoiceTypeEnum = pgEnum('invoice_type', ['issued', 'received'])
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'issued', 'paid', 'partially_paid', 'overdue', 'cancelled', 'rectified'])
export const expenseStatusEnum = pgEnum('expense_status', ['pending', 'approved', 'paid', 'rejected'])

// ========== TABLAS 003a: PRODUCTOS Y STOCK ==========

export const productCategories = pgTable('product_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  parentId: uuid('parent_id').references((): any => productCategories.id, { onDelete: 'set null' }),
  level: integer('level').default(0),
  path: text('path'),
  imageUrl: text('image_url'),
  isVisibleWeb: boolean('is_visible_web').default(true),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  sortOrder: integer('sort_order').default(0),
  icon: text('icon'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku: varchar('sku', { length: 30 }).notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  productType: productTypeEnum('product_type').default('boutique').notNull(),
  categoryId: uuid('category_id').references(() => productCategories.id, { onDelete: 'set null' }),
  brand: text('brand'),
  collection: text('collection'),
  season: text('season'),
  costPrice: decimal('cost_price', { precision: 10, scale: 2 }),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('21.00'),
  priceWithTax: decimal('price_with_tax', { precision: 10, scale: 2 }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierReference: text('supplier_reference'),
  images: jsonb('images').default([]),
  mainImageUrl: text('main_image_url'),
  color: text('color'),
  material: text('material'),
  isVisibleWeb: boolean('is_visible_web').default(false),
  webSlug: text('web_slug').unique(),
  webTitle: text('web_title'),
  webDescription: text('web_description'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  webTags: text('web_tags').array().default([]),
  relatedProductIds: uuid('related_product_ids').array().default([]),
  barcode: text('barcode'),
  barcodeType: text('barcode_type').default('EAN13'),
  labelDescription: text('label_description'),
  minStockAlert: integer('min_stock_alert'),
  staleDaysThreshold: integer('stale_days_threshold').default(90),
  isSample: boolean('is_sample').default(false),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
})

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  size: text('size'),
  color: text('color'),
  colorHex: text('color_hex'),
  variantSku: varchar('variant_sku', { length: 40 }).notNull().unique(),
  barcode: text('barcode').unique(),
  priceOverride: decimal('price_override', { precision: 10, scale: 2 }),
  costPriceOverride: decimal('cost_price_override', { precision: 10, scale: 2 }),
  imageUrl: text('image_url'),
  weightGrams: integer('weight_grams'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const stockLevels = pgTable('stock_levels', {
  id: uuid('id').primaryKey().defaultRandom(),
  productVariantId: uuid('product_variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').default(0).notNull(),
  reserved: integer('reserved').default(0).notNull(),
  available: integer('available'),
  minStock: integer('min_stock'),
  lastMovementAt: timestamp('last_movement_at', { withTimezone: true }),
  lastSaleAt: timestamp('last_sale_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  productVariantId: uuid('product_variant_id').notNull().references(() => productVariants.id, { onDelete: 'restrict' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  movementType: stockMovementTypeEnum('movement_type').notNull(),
  quantity: integer('quantity').notNull(),
  stockBefore: integer('stock_before').notNull(),
  stockAfter: integer('stock_after').notNull(),
  referenceType: text('reference_type'),
  referenceId: uuid('reference_id'),
  reason: text('reason'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const stockTransfers = pgTable('stock_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  transferNumber: varchar('transfer_number', { length: 30 }).notNull().unique(),
  fromWarehouseId: uuid('from_warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  toWarehouseId: uuid('to_warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  status: transferStatusEnum('status').default('requested').notNull(),
  requestedBy: uuid('requested_by').notNull().references(() => profiles.id, { onDelete: 'set null' }),
  approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  receivedBy: uuid('received_by').references(() => profiles.id, { onDelete: 'set null' }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const stockTransferLines = pgTable('stock_transfer_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  transferId: uuid('transfer_id').notNull().references(() => stockTransfers.id, { onDelete: 'cascade' }),
  productVariantId: uuid('product_variant_id').notNull().references(() => productVariants.id, { onDelete: 'restrict' }),
  quantityRequested: integer('quantity_requested').notNull(),
  quantitySent: integer('quantity_sent').default(0),
  quantityReceived: integer('quantity_received').default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const inventories = pgTable('inventories', {
  id: uuid('id').primaryKey().defaultRandom(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  inventoryType: text('inventory_type').default('full'),
  categoryFilter: uuid('category_filter').references(() => productCategories.id, { onDelete: 'set null' }),
  status: text('status').default('in_progress'),
  totalItemsCounted: integer('total_items_counted').default(0),
  totalDifferences: integer('total_differences').default(0),
  totalValueDifference: decimal('total_value_difference', { precision: 12, scale: 2 }).default('0.00'),
  startedBy: uuid('started_by').references(() => profiles.id, { onDelete: 'set null' }),
  completedBy: uuid('completed_by').references(() => profiles.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const inventoryLines = pgTable('inventory_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  inventoryId: uuid('inventory_id').notNull().references(() => inventories.id, { onDelete: 'cascade' }),
  productVariantId: uuid('product_variant_id').notNull().references(() => productVariants.id, { onDelete: 'restrict' }),
  expectedQuantity: integer('expected_quantity').notNull(),
  countedQuantity: integer('counted_quantity'),
  difference: integer('difference'),
  reason: text('reason'),
  countedBy: uuid('counted_by').references(() => profiles.id, { onDelete: 'set null' }),
  countedAt: timestamp('counted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ========== TABLAS 003b: PEDIDOS DE SASTRERÍA ==========

export const tailoringOrders = pgTable('tailoring_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 30 }).notNull().unique(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  orderType: tailoringOrderTypeEnum('order_type').notNull(),
  status: tailoringOrderStatusEnum('status').default('created').notNull(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'restrict' }),
  orderDate: date('order_date').defaultNow().notNull(),
  estimatedDeliveryDate: date('estimated_delivery_date'),
  actualDeliveryDate: date('actual_delivery_date'),
  deliveryMethod: text('delivery_method').default('store'),
  deliveryAddress: text('delivery_address'),
  deliveryCity: text('delivery_city'),
  deliveryPostalCode: text('delivery_postal_code'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).default('0.00'),
  discountAmount: decimal('discount_amount', { precision: 12, scale: 2 }).default('0.00'),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).default('0.00'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).default('0.00'),
  total: decimal('total', { precision: 12, scale: 2 }).default('0.00'),
  totalPaid: decimal('total_paid', { precision: 12, scale: 2 }).default('0.00'),
  totalPending: decimal('total_pending', { precision: 12, scale: 2 }),
  totalMaterialCost: decimal('total_material_cost', { precision: 12, scale: 2 }).default('0.00'),
  totalLaborCost: decimal('total_labor_cost', { precision: 12, scale: 2 }).default('0.00'),
  totalFactoryCost: decimal('total_factory_cost', { precision: 12, scale: 2 }).default('0.00'),
  totalCost: decimal('total_cost', { precision: 12, scale: 2 }),
  signatureUrl: text('signature_url'),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  parentOrderId: uuid('parent_order_id').references((): any => tailoringOrders.id, { onDelete: 'set null' }),
  incidentReason: text('incident_reason'),
  incidentResponsible: uuid('incident_responsible').references(() => profiles.id, { onDelete: 'set null' }),
  incidentCost: decimal('incident_cost', { precision: 10, scale: 2 }),
  invoiceId: uuid('invoice_id'),
  internalNotes: text('internal_notes'),
  clientNotes: text('client_notes'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const tailoringOrderLines = pgTable('tailoring_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tailoringOrderId: uuid('tailoring_order_id').notNull().references(() => tailoringOrders.id, { onDelete: 'cascade' }),
  garmentTypeId: uuid('garment_type_id').notNull().references(() => garmentTypes.id, { onDelete: 'restrict' }),
  status: tailoringOrderStatusEnum('status').default('created').notNull(),
  lineType: tailoringOrderTypeEnum('line_type').notNull(),
  measurementId: uuid('measurement_id').references(() => clientMeasurements.id, { onDelete: 'set null' }),
  configuration: jsonb('configuration').default({}),
  fabricId: uuid('fabric_id').references(() => fabrics.id, { onDelete: 'set null' }),
  fabricDescription: text('fabric_description'),
  fabricMeters: decimal('fabric_meters', { precision: 8, scale: 2 }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierOrderId: uuid('supplier_order_id').references(() => supplierOrders.id, { onDelete: 'set null' }),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).default('0.00'),
  discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0.00'),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('21.00'),
  lineTotal: decimal('line_total', { precision: 10, scale: 2 }),
  materialCost: decimal('material_cost', { precision: 10, scale: 2 }).default('0.00'),
  laborCost: decimal('labor_cost', { precision: 10, scale: 2 }).default('0.00'),
  factoryCost: decimal('factory_cost', { precision: 10, scale: 2 }).default('0.00'),
  modelName: text('model_name'),
  modelSize: text('model_size'),
  finishingNotes: text('finishing_notes'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const tailoringOrderStateHistory = pgTable('tailoring_order_state_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  tailoringOrderId: uuid('tailoring_order_id').notNull().references(() => tailoringOrders.id, { onDelete: 'cascade' }),
  tailoringOrderLineId: uuid('tailoring_order_line_id').references(() => tailoringOrderLines.id, { onDelete: 'cascade' }),
  fromStatus: tailoringOrderStatusEnum('from_status'),
  toStatus: tailoringOrderStatusEnum('to_status').notNull(),
  description: text('description'),
  notes: text('notes'),
  changedBy: uuid('changed_by').notNull().references(() => profiles.id, { onDelete: 'set null' }),
  changedByName: text('changed_by_name'),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
})

export const tailoringFittings = pgTable('tailoring_fittings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tailoringOrderId: uuid('tailoring_order_id').notNull().references(() => tailoringOrders.id, { onDelete: 'cascade' }),
  tailoringOrderLineId: uuid('tailoring_order_line_id').references(() => tailoringOrderLines.id, { onDelete: 'cascade' }),
  fittingNumber: integer('fitting_number').notNull().default(1),
  scheduledDate: date('scheduled_date'),
  scheduledTime: time('scheduled_time'),
  durationMinutes: integer('duration_minutes').default(30),
  status: text('status').default('scheduled'),
  adjustmentsNeeded: text('adjustments_needed'),
  adjustmentDetails: jsonb('adjustment_details'),
  photos: jsonb('photos').default([]),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  tailorId: uuid('tailor_id').references(() => profiles.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ========== TABLAS 003c: TPV Y CAJA ==========

export const cashSessions = pgTable('cash_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'restrict' }),
  openedBy: uuid('opened_by').notNull().references(() => profiles.id, { onDelete: 'set null' }),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  openingAmount: decimal('opening_amount', { precision: 12, scale: 2 }).notNull(),
  closedBy: uuid('closed_by').references(() => profiles.id, { onDelete: 'set null' }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  totalCashSales: decimal('total_cash_sales', { precision: 12, scale: 2 }).default('0.00'),
  totalCardSales: decimal('total_card_sales', { precision: 12, scale: 2 }).default('0.00'),
  totalBizumSales: decimal('total_bizum_sales', { precision: 12, scale: 2 }).default('0.00'),
  totalTransferSales: decimal('total_transfer_sales', { precision: 12, scale: 2 }).default('0.00'),
  totalVoucherSales: decimal('total_voucher_sales', { precision: 12, scale: 2 }).default('0.00'),
  totalSales: decimal('total_sales', { precision: 12, scale: 2 }).default('0.00'),
  totalReturns: decimal('total_returns', { precision: 12, scale: 2 }).default('0.00'),
  totalWithdrawals: decimal('total_withdrawals', { precision: 12, scale: 2 }).default('0.00'),
  totalDepositsCollected: decimal('total_deposits_collected', { precision: 12, scale: 2 }).default('0.00'),
  expectedCash: decimal('expected_cash', { precision: 12, scale: 2 }),
  countedCash: decimal('counted_cash', { precision: 12, scale: 2 }),
  cashDifference: decimal('cash_difference', { precision: 12, scale: 2 }),
  status: cashSessionStatusEnum('status').default('open').notNull(),
  closingNotes: text('closing_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const cashWithdrawals = pgTable('cash_withdrawals', {
  id: uuid('id').primaryKey().defaultRandom(),
  cashSessionId: uuid('cash_session_id').notNull().references(() => cashSessions.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  withdrawnBy: uuid('withdrawn_by').notNull().references(() => profiles.id, { onDelete: 'set null' }),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketNumber: varchar('ticket_number', { length: 30 }).notNull().unique(),
  cashSessionId: uuid('cash_session_id').notNull().references(() => cashSessions.id, { onDelete: 'restrict' }),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'restrict' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  salespersonId: uuid('salesperson_id').notNull().references(() => profiles.id, { onDelete: 'set null' }),
  saleType: text('sale_type').default('boutique'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  discountAmount: decimal('discount_amount', { precision: 12, scale: 2 }).default('0.00'),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).default('0.00'),
  discountCode: text('discount_code'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: paymentMethodTypeEnum('payment_method').notNull(),
  isTaxFree: boolean('is_tax_free').default(false),
  taxFreeProvider: text('tax_free_provider'),
  taxFreeDocumentNumber: text('tax_free_document_number'),
  status: saleStatusEnum('status').default('completed').notNull(),
  tailoringOrderId: uuid('tailoring_order_id').references(() => tailoringOrders.id, { onDelete: 'set null' }),
  onlineOrderId: uuid('online_order_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const saleLines = pgTable('sale_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productVariantId: uuid('product_variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  sku: text('sku'),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).default('0.00'),
  discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0.00'),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('21.00'),
  lineTotal: decimal('line_total', { precision: 10, scale: 2 }).notNull(),
  costPrice: decimal('cost_price', { precision: 10, scale: 2 }),
  quantityReturned: integer('quantity_returned').default(0),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  returnReason: text('return_reason'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const salePayments = pgTable('sale_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  paymentMethod: paymentMethodTypeEnum('payment_method').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  reference: text('reference'),
  voucherId: uuid('voucher_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const vouchers = pgTable('vouchers', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  voucherType: text('voucher_type').default('fixed'),
  originalAmount: decimal('original_amount', { precision: 10, scale: 2 }).notNull(),
  remainingAmount: decimal('remaining_amount', { precision: 10, scale: 2 }).notNull(),
  percentage: decimal('percentage', { precision: 5, scale: 2 }),
  originSaleId: uuid('origin_sale_id').references(() => sales.id, { onDelete: 'set null' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  issuedDate: date('issued_date').defaultNow().notNull(),
  expiryDate: date('expiry_date').notNull(),
  status: voucherStatusEnum('status').default('active').notNull(),
  issuedByStoreId: uuid('issued_by_store_id').references(() => stores.id, { onDelete: 'set null' }),
  issuedBy: uuid('issued_by').references(() => profiles.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const returns = pgTable('returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalSaleId: uuid('original_sale_id').notNull().references(() => sales.id, { onDelete: 'restrict' }),
  returnType: text('return_type').default('exchange'),
  totalReturned: decimal('total_returned', { precision: 12, scale: 2 }).notNull(),
  voucherId: uuid('voucher_id').references(() => vouchers.id, { onDelete: 'set null' }),
  exchangeSaleId: uuid('exchange_sale_id').references(() => sales.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  processedBy: uuid('processed_by').notNull().references(() => profiles.id, { onDelete: 'set null' }),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const discountCodes = pgTable('discount_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  description: text('description'),
  discountType: text('discount_type').default('percentage'),
  discountValue: decimal('discount_value', { precision: 10, scale: 2 }).notNull(),
  minPurchase: decimal('min_purchase', { precision: 10, scale: 2 }),
  maxUses: integer('max_uses'),
  currentUses: integer('current_uses').default(0),
  validFrom: date('valid_from').defaultNow(),
  validUntil: date('valid_until'),
  appliesTo: text('applies_to').default('all'),
  categoryIds: uuid('category_ids').array().default([]),
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ========== TABLAS 003d: CONTABILIDAD ==========

export const chartOfAccounts = pgTable('chart_of_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountCode: varchar('account_code', { length: 20 }).notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  parentCode: varchar('parent_code', { length: 20 }),
  level: integer('level').notNull(),
  accountType: accountTypeEnum('account_type').notNull(),
  normalBalance: text('normal_balance').default('debit'),
  isDetail: boolean('is_detail').default(false),
  isSystem: boolean('is_system').default(false),
  currentBalance: decimal('current_balance', { precision: 14, scale: 2 }).default('0.00'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryNumber: integer('entry_number').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  fiscalMonth: integer('fiscal_month').notNull(),
  entryDate: date('entry_date').notNull(),
  description: text('description').notNull(),
  entryType: text('entry_type').default('manual'),
  referenceType: text('reference_type'),
  referenceId: uuid('reference_id'),
  referenceNumber: text('reference_number'),
  status: entryStatusEnum('status').default('draft').notNull(),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  postedBy: uuid('posted_by').references(() => profiles.id, { onDelete: 'set null' }),
  isPeriodClosed: boolean('is_period_closed').default(false),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  totalDebit: decimal('total_debit', { precision: 14, scale: 2 }).default('0.00'),
  totalCredit: decimal('total_credit', { precision: 14, scale: 2 }).default('0.00'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const journalEntryLines = pgTable('journal_entry_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  accountCode: varchar('account_code', { length: 20 }).notNull(),
  debit: decimal('debit', { precision: 14, scale: 2 }).default('0.00'),
  credit: decimal('credit', { precision: 14, scale: 2 }).default('0.00'),
  description: text('description'),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const fiscalPeriods = pgTable('fiscal_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  fiscalYear: integer('fiscal_year').notNull(),
  fiscalMonth: integer('fiscal_month').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isClosed: boolean('is_closed').default(false),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => profiles.id, { onDelete: 'set null' }),
  totalIncome: decimal('total_income', { precision: 14, scale: 2 }).default('0.00'),
  totalExpenses: decimal('total_expenses', { precision: 14, scale: 2 }).default('0.00'),
  netResult: decimal('net_result', { precision: 14, scale: 2 }).default('0.00'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceNumber: varchar('invoice_number', { length: 30 }).notNull().unique(),
  invoiceSeries: text('invoice_series').default('F').notNull(),
  invoiceType: invoiceTypeEnum('invoice_type').default('issued').notNull(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  clientName: text('client_name').notNull(),
  clientNif: text('client_nif'),
  clientAddress: text('client_address'),
  companyName: text('company_name').notNull(),
  companyNif: text('company_nif').notNull(),
  companyAddress: text('company_address').notNull(),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('21.00'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(),
  irpfRate: decimal('irpf_rate', { precision: 5, scale: 2 }).default('0.00'),
  irpfAmount: decimal('irpf_amount', { precision: 12, scale: 2 }).default('0.00'),
  recargoRate: decimal('recargo_rate', { precision: 5, scale: 2 }).default('0.00'),
  recargoAmount: decimal('recargo_amount', { precision: 12, scale: 2 }).default('0.00'),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  amountPaid: decimal('amount_paid', { precision: 12, scale: 2 }).default('0.00'),
  isFullyPaid: boolean('is_fully_paid').default(false),
  status: invoiceStatusEnum('status').default('draft').notNull(),
  isRectifying: boolean('is_rectifying').default(false),
  rectifiesInvoiceId: uuid('rectifies_invoice_id').references((): any => invoices.id, { onDelete: 'set null' }),
  rectificationReason: text('rectification_reason'),
  quadernoId: text('quaderno_id'),
  verifactuHash: text('verifactu_hash'),
  verifactuSent: boolean('verifactu_sent').default(false),
  verifactuSentAt: timestamp('verifactu_sent_at', { withTimezone: true }),
  pdfUrl: text('pdf_url'),
  sentToClient: boolean('sent_to_client').default(false),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'set null' }),
  tailoringOrderId: uuid('tailoring_order_id').references(() => tailoringOrders.id, { onDelete: 'set null' }),
  onlineOrderId: uuid('online_order_id'),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).default('0.00'),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('21.00'),
  lineTotal: decimal('line_total', { precision: 10, scale: 2 }).notNull(),
  productVariantId: uuid('product_variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  description: text('description').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('21.00'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).default('0.00'),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  expenseDate: date('expense_date').notNull(),
  isRecurring: boolean('is_recurring').default(false),
  recurrencePeriod: text('recurrence_period'),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierInvoiceId: uuid('supplier_invoice_id').references(() => supplierInvoices.id, { onDelete: 'set null' }),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  status: expenseStatusEnum('status').default('pending').notNull(),
  approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  accountCode: varchar('account_code', { length: 20 }),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id, { onDelete: 'set null' }),
  documentUrl: text('document_url'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const salesCommissions = pgTable('sales_commissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  salespersonId: uuid('salesperson_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  targetAmount: decimal('target_amount', { precision: 12, scale: 2 }),
  actualAmount: decimal('actual_amount', { precision: 12, scale: 2 }).default('0.00'),
  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }).notNull(),
  bonusRate: decimal('bonus_rate', { precision: 5, scale: 2 }).default('0.00'),
  commissionAmount: decimal('commission_amount', { precision: 12, scale: 2 }).default('0.00'),
  bonusAmount: decimal('bonus_amount', { precision: 12, scale: 2 }).default('0.00'),
  totalCommission: decimal('total_commission', { precision: 12, scale: 2 }).default('0.00'),
  status: text('status').default('pending'),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ========== RELACIONES ==========

export const profilesRelations = relations(profiles, ({ many }) => ({
  userRoles: many(userRoles),
  userStores: many(userStores),
  rolePermissionsGranted: many(rolePermissions),
  userRolesAssignedBy: many(userRoles),
  activeSessions: many(activeSessions),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
  clientsAsProfile: many(clients, { relationName: 'clientProfile' }),
  clientsAsSalesperson: many(clients, { relationName: 'clientSalesperson' }),
  clientsCreated: many(clients, { relationName: 'clientCreatedBy' }),
  clientNotes: many(clientNotes),
  clientMeasurementsTaken: many(clientMeasurements),
  boutiqueAlterationsRegistered: many(boutiqueAlterations),
  clientEmailsSent: many(clientEmailHistory),
  suppliersCreated: many(suppliers),
  supplierOrdersCreated: many(supplierOrders),
  supplierOrderLinesReceived: many(supplierOrderLines),
  supplierInvoicesRegistered: many(supplierInvoices),
  supplierPaymentsRegistered: many(supplierPayments),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
  grantedByProfile: one(profiles, { fields: [rolePermissions.grantedBy], references: [profiles.id] }),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  profile: one(profiles, { fields: [userRoles.userId], references: [profiles.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  assignedByProfile: one(profiles, { fields: [userRoles.assignedBy], references: [profiles.id] }),
}))

export const storesRelations = relations(stores, ({ many }) => ({
  warehouses: many(warehouses),
  userStores: many(userStores),
  activeSessions: many(activeSessions),
  auditLogs: many(auditLogs),
  clients: many(clients),
  clientMeasurements: many(clientMeasurements),
  boutiqueAlterations: many(boutiqueAlterations),
  supplierOrdersDestination: many(supplierOrders),
}))

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
  store: one(stores, { fields: [warehouses.storeId], references: [stores.id] }),
  fabrics: many(fabrics),
}))

export const userStoresRelations = relations(userStores, ({ one }) => ({
  profile: one(profiles, { fields: [userStores.userId], references: [profiles.id] }),
  store: one(stores, { fields: [userStores.storeId], references: [stores.id] }),
  assignedByProfile: one(profiles, { fields: [userStores.assignedBy], references: [profiles.id] }),
}))

export const activeSessionsRelations = relations(activeSessions, ({ one }) => ({
  profile: one(profiles, { fields: [activeSessions.userId], references: [profiles.id] }),
  store: one(stores, { fields: [activeSessions.storeId], references: [stores.id] }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  profile: one(profiles, { fields: [auditLogs.userId], references: [profiles.id] }),
  store: one(stores, { fields: [auditLogs.storeId], references: [stores.id] }),
}))

export const systemConfigRelations = relations(systemConfig, ({ one }) => ({
  updatedByProfile: one(profiles, { fields: [systemConfig.updatedBy], references: [profiles.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  profile: one(profiles, { fields: [notifications.userId], references: [profiles.id] }),
}))

export const clientsRelations = relations(clients, ({ one, many }) => ({
  profile: one(profiles, { fields: [clients.profileId], references: [profiles.id], relationName: 'clientProfile' }),
  homeStore: one(stores, { fields: [clients.homeStoreId], references: [stores.id] }),
  assignedSalesperson: one(profiles, { fields: [clients.assignedSalespersonId], references: [profiles.id], relationName: 'clientSalesperson' }),
  createdByProfile: one(profiles, { fields: [clients.createdBy], references: [profiles.id], relationName: 'clientCreatedBy' }),
  contacts: many(clientContacts),
  notes: many(clientNotes),
  measurements: many(clientMeasurements),
  alterations: many(boutiqueAlterations),
  emailHistory: many(clientEmailHistory),
}))

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, { fields: [clientContacts.clientId], references: [clients.id] }),
}))

export const clientNotesRelations = relations(clientNotes, ({ one }) => ({
  client: one(clients, { fields: [clientNotes.clientId], references: [clients.id] }),
  createdByProfile: one(profiles, { fields: [clientNotes.createdBy], references: [profiles.id] }),
}))

export const garmentTypesRelations = relations(garmentTypes, ({ many }) => ({
  measurementFields: many(measurementFields),
  configOptions: many(garmentConfigOptions),
  clientMeasurements: many(clientMeasurements),
}))

export const measurementFieldsRelations = relations(measurementFields, ({ one }) => ({
  garmentType: one(garmentTypes, { fields: [measurementFields.garmentTypeId], references: [garmentTypes.id] }),
}))

export const clientMeasurementsRelations = relations(clientMeasurements, ({ one }) => ({
  client: one(clients, { fields: [clientMeasurements.clientId], references: [clients.id] }),
  garmentType: one(garmentTypes, { fields: [clientMeasurements.garmentTypeId], references: [garmentTypes.id] }),
  takenByProfile: one(profiles, { fields: [clientMeasurements.takenBy], references: [profiles.id] }),
  store: one(stores, { fields: [clientMeasurements.storeId], references: [stores.id] }),
}))

export const garmentConfigOptionsRelations = relations(garmentConfigOptions, ({ one }) => ({
  garmentType: one(garmentTypes, { fields: [garmentConfigOptions.garmentTypeId], references: [garmentTypes.id] }),
}))

export const boutiqueAlterationsRelations = relations(boutiqueAlterations, ({ one }) => ({
  client: one(clients, { fields: [boutiqueAlterations.clientId], references: [clients.id] }),
  registeredByProfile: one(profiles, { fields: [boutiqueAlterations.registeredBy], references: [profiles.id] }),
  store: one(stores, { fields: [boutiqueAlterations.storeId], references: [stores.id] }),
}))

export const clientEmailHistoryRelations = relations(clientEmailHistory, ({ one }) => ({
  client: one(clients, { fields: [clientEmailHistory.clientId], references: [clients.id] }),
  sentByProfile: one(profiles, { fields: [clientEmailHistory.sentBy], references: [profiles.id] }),
}))

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  createdByProfile: one(profiles, { fields: [suppliers.createdBy], references: [profiles.id] }),
  contacts: many(supplierContacts),
  fabrics: many(fabrics),
  orders: many(supplierOrders),
  invoices: many(supplierInvoices),
  payments: many(supplierPayments),
  dueDates: many(supplierDueDates),
}))

export const supplierContactsRelations = relations(supplierContacts, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierContacts.supplierId], references: [suppliers.id] }),
}))

export const fabricCategoriesRelations = relations(fabricCategories, ({ many }) => ({
  fabrics: many(fabrics),
}))

export const fabricsRelations = relations(fabrics, ({ one }) => ({
  supplier: one(suppliers, { fields: [fabrics.supplierId], references: [suppliers.id] }),
  category: one(fabricCategories, { fields: [fabrics.categoryId], references: [fabricCategories.id] }),
  warehouse: one(warehouses, { fields: [fabrics.warehouseId], references: [warehouses.id] }),
}))

export const supplierOrdersRelations = relations(supplierOrders, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [supplierOrders.supplierId], references: [suppliers.id] }),
  destinationStore: one(stores, { fields: [supplierOrders.destinationStoreId], references: [stores.id] }),
  destinationWarehouse: one(warehouses, { fields: [supplierOrders.destinationWarehouseId], references: [warehouses.id] }),
  createdByProfile: one(profiles, { fields: [supplierOrders.createdBy], references: [profiles.id] }),
  lines: many(supplierOrderLines),
  invoices: many(supplierInvoices),
}))

export const supplierOrderLinesRelations = relations(supplierOrderLines, ({ one }) => ({
  supplierOrder: one(supplierOrders, { fields: [supplierOrderLines.supplierOrderId], references: [supplierOrders.id] }),
  fabric: one(fabrics, { fields: [supplierOrderLines.fabricId], references: [fabrics.id] }),
  receivedByProfile: one(profiles, { fields: [supplierOrderLines.receivedBy], references: [profiles.id] }),
}))

export const supplierInvoicesRelations = relations(supplierInvoices, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [supplierInvoices.supplierId], references: [suppliers.id] }),
  supplierOrder: one(supplierOrders, { fields: [supplierInvoices.supplierOrderId], references: [supplierOrders.id] }),
  registeredByProfile: one(profiles, { fields: [supplierInvoices.registeredBy], references: [profiles.id] }),
  payments: many(supplierPayments),
  dueDates: many(supplierDueDates),
}))

export const supplierPaymentsRelations = relations(supplierPayments, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [supplierPayments.supplierId], references: [suppliers.id] }),
  supplierInvoice: one(supplierInvoices, { fields: [supplierPayments.supplierInvoiceId], references: [supplierInvoices.id] }),
  registeredByProfile: one(profiles, { fields: [supplierPayments.registeredBy], references: [profiles.id] }),
  dueDates: many(supplierDueDates),
}))

export const supplierDueDatesRelations = relations(supplierDueDates, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierDueDates.supplierId], references: [suppliers.id] }),
  supplierInvoice: one(supplierInvoices, { fields: [supplierDueDates.supplierInvoiceId], references: [supplierInvoices.id] }),
  payment: one(supplierPayments, { fields: [supplierDueDates.paymentId], references: [supplierPayments.id] }),
}))

// ========== RELACIONES 003 ==========

export const productCategoriesRelations = relations(productCategories, ({ one, many }) => ({
  parent: one(productCategories, { fields: [productCategories.parentId], references: [productCategories.id], relationName: 'categoryParent' }),
  children: many(productCategories, { relationName: 'categoryParent' }),
  products: many(products),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, { fields: [products.categoryId], references: [productCategories.id] }),
  supplier: one(suppliers, { fields: [products.supplierId], references: [suppliers.id] }),
  createdByProfile: one(profiles, { fields: [products.createdBy], references: [profiles.id] }),
  variants: many(productVariants),
}))

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  stockLevels: many(stockLevels),
  stockMovements: many(stockMovements),
  saleLines: many(saleLines),
  invoiceLines: many(invoiceLines),
}))

export const stockLevelsRelations = relations(stockLevels, ({ one }) => ({
  productVariant: one(productVariants, { fields: [stockLevels.productVariantId], references: [productVariants.id] }),
  warehouse: one(warehouses, { fields: [stockLevels.warehouseId], references: [warehouses.id] }),
}))

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  productVariant: one(productVariants, { fields: [stockMovements.productVariantId], references: [productVariants.id] }),
  warehouse: one(warehouses, { fields: [stockMovements.warehouseId], references: [warehouses.id] }),
  createdByProfile: one(profiles, { fields: [stockMovements.createdBy], references: [profiles.id] }),
  store: one(stores, { fields: [stockMovements.storeId], references: [stores.id] }),
}))

export const stockTransfersRelations = relations(stockTransfers, ({ one, many }) => ({
  fromWarehouse: one(warehouses, { fields: [stockTransfers.fromWarehouseId], references: [warehouses.id], relationName: 'transferFrom' }),
  toWarehouse: one(warehouses, { fields: [stockTransfers.toWarehouseId], references: [warehouses.id], relationName: 'transferTo' }),
  requestedByProfile: one(profiles, { fields: [stockTransfers.requestedBy], references: [profiles.id] }),
  lines: many(stockTransferLines),
}))

export const stockTransferLinesRelations = relations(stockTransferLines, ({ one }) => ({
  transfer: one(stockTransfers, { fields: [stockTransferLines.transferId], references: [stockTransfers.id] }),
  productVariant: one(productVariants, { fields: [stockTransferLines.productVariantId], references: [productVariants.id] }),
}))

export const inventoriesRelations = relations(inventories, ({ one, many }) => ({
  warehouse: one(warehouses, { fields: [inventories.warehouseId], references: [warehouses.id] }),
  categoryFilter: one(productCategories, { fields: [inventories.categoryFilter], references: [productCategories.id] }),
  startedByProfile: one(profiles, { fields: [inventories.startedBy], references: [profiles.id] }),
  lines: many(inventoryLines),
}))

export const inventoryLinesRelations = relations(inventoryLines, ({ one }) => ({
  inventory: one(inventories, { fields: [inventoryLines.inventoryId], references: [inventories.id] }),
  productVariant: one(productVariants, { fields: [inventoryLines.productVariantId], references: [productVariants.id] }),
}))

export const tailoringOrdersRelations = relations(tailoringOrders, ({ one, many }) => ({
  client: one(clients, { fields: [tailoringOrders.clientId], references: [clients.id] }),
  store: one(stores, { fields: [tailoringOrders.storeId], references: [stores.id] }),
  parentOrder: one(tailoringOrders, { fields: [tailoringOrders.parentOrderId], references: [tailoringOrders.id], relationName: 'orderParent' }),
  childOrders: many(tailoringOrders, { relationName: 'orderParent' }),
  createdByProfile: one(profiles, { fields: [tailoringOrders.createdBy], references: [profiles.id] }),
  lines: many(tailoringOrderLines),
  stateHistory: many(tailoringOrderStateHistory),
  fittings: many(tailoringFittings),
  salesLinked: many(sales),
}))

export const tailoringOrderLinesRelations = relations(tailoringOrderLines, ({ one, many }) => ({
  tailoringOrder: one(tailoringOrders, { fields: [tailoringOrderLines.tailoringOrderId], references: [tailoringOrders.id] }),
  garmentType: one(garmentTypes, { fields: [tailoringOrderLines.garmentTypeId], references: [garmentTypes.id] }),
  measurement: one(clientMeasurements, { fields: [tailoringOrderLines.measurementId], references: [clientMeasurements.id] }),
  fabric: one(fabrics, { fields: [tailoringOrderLines.fabricId], references: [fabrics.id] }),
  supplier: one(suppliers, { fields: [tailoringOrderLines.supplierId], references: [suppliers.id] }),
  supplierOrder: one(supplierOrders, { fields: [tailoringOrderLines.supplierOrderId], references: [supplierOrders.id] }),
  stateHistory: many(tailoringOrderStateHistory),
  fittings: many(tailoringFittings),
}))

export const tailoringOrderStateHistoryRelations = relations(tailoringOrderStateHistory, ({ one }) => ({
  tailoringOrder: one(tailoringOrders, { fields: [tailoringOrderStateHistory.tailoringOrderId], references: [tailoringOrders.id] }),
  tailoringOrderLine: one(tailoringOrderLines, { fields: [tailoringOrderStateHistory.tailoringOrderLineId], references: [tailoringOrderLines.id] }),
  changedByProfile: one(profiles, { fields: [tailoringOrderStateHistory.changedBy], references: [profiles.id] }),
}))

export const tailoringFittingsRelations = relations(tailoringFittings, ({ one }) => ({
  tailoringOrder: one(tailoringOrders, { fields: [tailoringFittings.tailoringOrderId], references: [tailoringOrders.id] }),
  tailoringOrderLine: one(tailoringOrderLines, { fields: [tailoringFittings.tailoringOrderLineId], references: [tailoringOrderLines.id] }),
  store: one(stores, { fields: [tailoringFittings.storeId], references: [stores.id] }),
  tailor: one(profiles, { fields: [tailoringFittings.tailorId], references: [profiles.id] }),
}))

export const cashSessionsRelations = relations(cashSessions, ({ one, many }) => ({
  store: one(stores, { fields: [cashSessions.storeId], references: [stores.id] }),
  openedByProfile: one(profiles, { fields: [cashSessions.openedBy], references: [profiles.id] }),
  withdrawals: many(cashWithdrawals),
  sales: many(sales),
}))

export const cashWithdrawalsRelations = relations(cashWithdrawals, ({ one }) => ({
  cashSession: one(cashSessions, { fields: [cashWithdrawals.cashSessionId], references: [cashSessions.id] }),
  withdrawnByProfile: one(profiles, { fields: [cashWithdrawals.withdrawnBy], references: [profiles.id] }),
}))

export const salesRelations = relations(sales, ({ one, many }) => ({
  cashSession: one(cashSessions, { fields: [sales.cashSessionId], references: [cashSessions.id] }),
  store: one(stores, { fields: [sales.storeId], references: [stores.id] }),
  client: one(clients, { fields: [sales.clientId], references: [clients.id] }),
  salesperson: one(profiles, { fields: [sales.salespersonId], references: [profiles.id] }),
  tailoringOrder: one(tailoringOrders, { fields: [sales.tailoringOrderId], references: [tailoringOrders.id] }),
  lines: many(saleLines),
  payments: many(salePayments),
  returnsOriginal: many(returns),
  invoicesLinked: many(invoices),
}))

export const saleLinesRelations = relations(saleLines, ({ one }) => ({
  sale: one(sales, { fields: [saleLines.saleId], references: [sales.id] }),
  productVariant: one(productVariants, { fields: [saleLines.productVariantId], references: [productVariants.id] }),
}))

export const salePaymentsRelations = relations(salePayments, ({ one }) => ({
  sale: one(sales, { fields: [salePayments.saleId], references: [sales.id] }),
  voucher: one(vouchers, { fields: [salePayments.voucherId], references: [vouchers.id] }),
}))

export const vouchersRelations = relations(vouchers, ({ one }) => ({
  originSale: one(sales, { fields: [vouchers.originSaleId], references: [sales.id] }),
  client: one(clients, { fields: [vouchers.clientId], references: [clients.id] }),
  issuedByStore: one(stores, { fields: [vouchers.issuedByStoreId], references: [stores.id] }),
  issuedByProfile: one(profiles, { fields: [vouchers.issuedBy], references: [profiles.id] }),
}))

export const returnsRelations = relations(returns, ({ one }) => ({
  originalSale: one(sales, { fields: [returns.originalSaleId], references: [sales.id] }),
  voucher: one(vouchers, { fields: [returns.voucherId], references: [vouchers.id] }),
  exchangeSale: one(sales, { fields: [returns.exchangeSaleId], references: [sales.id] }),
  processedByProfile: one(profiles, { fields: [returns.processedBy], references: [profiles.id] }),
  store: one(stores, { fields: [returns.storeId], references: [stores.id] }),
}))

export const discountCodesRelations = relations(discountCodes, ({ one }) => ({
  createdByProfile: one(profiles, { fields: [discountCodes.createdBy], references: [profiles.id] }),
}))

export const chartOfAccountsRelations = relations(chartOfAccounts, ({ many }) => ({
  journalEntryLines: many(journalEntryLines),
}))

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  postedByProfile: one(profiles, { fields: [journalEntries.postedBy], references: [profiles.id] }),
  createdByProfile: one(profiles, { fields: [journalEntries.createdBy], references: [profiles.id] }),
  lines: many(journalEntryLines),
}))

export const journalEntryLinesRelations = relations(journalEntryLines, ({ one }) => ({
  journalEntry: one(journalEntries, { fields: [journalEntryLines.journalEntryId], references: [journalEntries.id] }),
}))

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  sale: one(sales, { fields: [invoices.saleId], references: [sales.id] }),
  tailoringOrder: one(tailoringOrders, { fields: [invoices.tailoringOrderId], references: [tailoringOrders.id] }),
  store: one(stores, { fields: [invoices.storeId], references: [stores.id] }),
  journalEntry: one(journalEntries, { fields: [invoices.journalEntryId], references: [journalEntries.id] }),
  rectifiesInvoice: one(invoices, { fields: [invoices.rectifiesInvoiceId], references: [invoices.id], relationName: 'invoiceRectification' }),
  createdByProfile: one(profiles, { fields: [invoices.createdBy], references: [profiles.id] }),
  lines: many(invoiceLines),
}))

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
  productVariant: one(productVariants, { fields: [invoiceLines.productVariantId], references: [productVariants.id] }),
}))

export const expensesRelations = relations(expenses, ({ one }) => ({
  supplier: one(suppliers, { fields: [expenses.supplierId], references: [suppliers.id] }),
  supplierInvoice: one(supplierInvoices, { fields: [expenses.supplierInvoiceId], references: [supplierInvoices.id] }),
  store: one(stores, { fields: [expenses.storeId], references: [stores.id] }),
  approvedByProfile: one(profiles, { fields: [expenses.approvedBy], references: [profiles.id] }),
  journalEntry: one(journalEntries, { fields: [expenses.journalEntryId], references: [journalEntries.id] }),
  createdByProfile: one(profiles, { fields: [expenses.createdBy], references: [profiles.id] }),
}))

export const salesCommissionsRelations = relations(salesCommissions, ({ one }) => ({
  salesperson: one(profiles, { fields: [salesCommissions.salespersonId], references: [profiles.id] }),
  store: one(stores, { fields: [salesCommissions.storeId], references: [stores.id] }),
}))

// ========== TIPOS INFERIDOS ==========

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
export type Permission = typeof permissions.$inferSelect
export type NewPermission = typeof permissions.$inferInsert
export type RolePermission = typeof rolePermissions.$inferSelect
export type NewRolePermission = typeof rolePermissions.$inferInsert
export type UserRole = typeof userRoles.$inferSelect
export type NewUserRole = typeof userRoles.$inferInsert
export type Store = typeof stores.$inferSelect
export type NewStore = typeof stores.$inferInsert
export type Warehouse = typeof warehouses.$inferSelect
export type NewWarehouse = typeof warehouses.$inferInsert
export type UserStore = typeof userStores.$inferSelect
export type NewUserStore = typeof userStores.$inferInsert
export type ActiveSession = typeof activeSessions.$inferSelect
export type NewActiveSession = typeof activeSessions.$inferInsert
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
export type SystemConfig = typeof systemConfig.$inferSelect
export type NewSystemConfig = typeof systemConfig.$inferInsert
export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert

export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type ClientContact = typeof clientContacts.$inferSelect
export type NewClientContact = typeof clientContacts.$inferInsert
export type ClientNote = typeof clientNotes.$inferSelect
export type NewClientNote = typeof clientNotes.$inferInsert
export type GarmentType = typeof garmentTypes.$inferSelect
export type NewGarmentType = typeof garmentTypes.$inferInsert
export type MeasurementField = typeof measurementFields.$inferSelect
export type NewMeasurementField = typeof measurementFields.$inferInsert
export type ClientMeasurement = typeof clientMeasurements.$inferSelect
export type NewClientMeasurement = typeof clientMeasurements.$inferInsert
export type GarmentConfigOption = typeof garmentConfigOptions.$inferSelect
export type NewGarmentConfigOption = typeof garmentConfigOptions.$inferInsert
export type BoutiqueAlteration = typeof boutiqueAlterations.$inferSelect
export type NewBoutiqueAlteration = typeof boutiqueAlterations.$inferInsert
export type ClientTag = typeof clientTags.$inferSelect
export type NewClientTag = typeof clientTags.$inferInsert
export type ClientEmailHistory = typeof clientEmailHistory.$inferSelect
export type NewClientEmailHistory = typeof clientEmailHistory.$inferInsert
export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert
export type SupplierContact = typeof supplierContacts.$inferSelect
export type NewSupplierContact = typeof supplierContacts.$inferInsert
export type FabricCategory = typeof fabricCategories.$inferSelect
export type NewFabricCategory = typeof fabricCategories.$inferInsert
export type Fabric = typeof fabrics.$inferSelect
export type NewFabric = typeof fabrics.$inferInsert
export type SupplierOrder = typeof supplierOrders.$inferSelect
export type NewSupplierOrder = typeof supplierOrders.$inferInsert
export type SupplierOrderLine = typeof supplierOrderLines.$inferSelect
export type NewSupplierOrderLine = typeof supplierOrderLines.$inferInsert
export type SupplierInvoice = typeof supplierInvoices.$inferSelect
export type NewSupplierInvoice = typeof supplierInvoices.$inferInsert
export type SupplierPayment = typeof supplierPayments.$inferSelect
export type NewSupplierPayment = typeof supplierPayments.$inferInsert
export type SupplierDueDate = typeof supplierDueDates.$inferSelect
export type NewSupplierDueDate = typeof supplierDueDates.$inferInsert

export type ProductCategory = typeof productCategories.$inferSelect
export type NewProductCategory = typeof productCategories.$inferInsert
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductVariant = typeof productVariants.$inferSelect
export type NewProductVariant = typeof productVariants.$inferInsert
export type StockLevel = typeof stockLevels.$inferSelect
export type NewStockLevel = typeof stockLevels.$inferInsert
export type StockMovement = typeof stockMovements.$inferSelect
export type NewStockMovement = typeof stockMovements.$inferInsert
export type StockTransfer = typeof stockTransfers.$inferSelect
export type NewStockTransfer = typeof stockTransfers.$inferInsert
export type StockTransferLine = typeof stockTransferLines.$inferSelect
export type NewStockTransferLine = typeof stockTransferLines.$inferInsert
export type Inventory = typeof inventories.$inferSelect
export type NewInventory = typeof inventories.$inferInsert
export type InventoryLine = typeof inventoryLines.$inferSelect
export type NewInventoryLine = typeof inventoryLines.$inferInsert

export type TailoringOrder = typeof tailoringOrders.$inferSelect
export type NewTailoringOrder = typeof tailoringOrders.$inferInsert
export type TailoringOrderLine = typeof tailoringOrderLines.$inferSelect
export type NewTailoringOrderLine = typeof tailoringOrderLines.$inferInsert
export type TailoringOrderStateHistory = typeof tailoringOrderStateHistory.$inferSelect
export type NewTailoringOrderStateHistory = typeof tailoringOrderStateHistory.$inferInsert
export type TailoringFitting = typeof tailoringFittings.$inferSelect
export type NewTailoringFitting = typeof tailoringFittings.$inferInsert

export type CashSession = typeof cashSessions.$inferSelect
export type NewCashSession = typeof cashSessions.$inferInsert
export type CashWithdrawal = typeof cashWithdrawals.$inferSelect
export type NewCashWithdrawal = typeof cashWithdrawals.$inferInsert
export type Sale = typeof sales.$inferSelect
export type NewSale = typeof sales.$inferInsert
export type SaleLine = typeof saleLines.$inferSelect
export type NewSaleLine = typeof saleLines.$inferInsert
export type SalePayment = typeof salePayments.$inferSelect
export type NewSalePayment = typeof salePayments.$inferInsert
export type Voucher = typeof vouchers.$inferSelect
export type NewVoucher = typeof vouchers.$inferInsert
export type Return = typeof returns.$inferSelect
export type NewReturn = typeof returns.$inferInsert
export type DiscountCode = typeof discountCodes.$inferSelect
export type NewDiscountCode = typeof discountCodes.$inferInsert

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect
export type NewChartOfAccount = typeof chartOfAccounts.$inferInsert
export type JournalEntry = typeof journalEntries.$inferSelect
export type NewJournalEntry = typeof journalEntries.$inferInsert
export type JournalEntryLine = typeof journalEntryLines.$inferSelect
export type NewJournalEntryLine = typeof journalEntryLines.$inferInsert
export type FiscalPeriod = typeof fiscalPeriods.$inferSelect
export type NewFiscalPeriod = typeof fiscalPeriods.$inferInsert
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type InvoiceLine = typeof invoiceLines.$inferSelect
export type NewInvoiceLine = typeof invoiceLines.$inferInsert
export type Expense = typeof expenses.$inferSelect
export type NewExpense = typeof expenses.$inferInsert
export type SalesCommission = typeof salesCommissions.$inferSelect
export type NewSalesCommission = typeof salesCommissions.$inferInsert
