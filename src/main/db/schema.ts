import { sqliteTable, integer, text, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// Все даты хранятся строками: даты — 'YYYY-MM-DD', моменты времени — 'YYYY-MM-DD HH:mm:ss' (локальное время).

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  login: text('login').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  createdAt: text('created_at').notNull()
})

export const materials = sqliteTable('materials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  category: text('category', { enum: ['raw', 'container', 'packaging', 'consumable'] }).notNull(),
  unit: text('unit').notNull(),
  minStock: real('min_stock').notNull().default(0),
  currentStock: real('current_stock').notNull().default(0),
  description: text('description').notNull().default('')
})

export const suppliers = sqliteTable('suppliers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  inn: text('inn').notNull().default(''),
  contactPerson: text('contact_person').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  comment: text('comment').notNull().default(''),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // кэш рейтинга (null — «нет данных»)
  rating: real('rating'),
  ratingPrice: real('rating_price'),
  ratingTime: real('rating_time'),
  ratingQuality: real('rating_quality'),
  deliveriesCount: integer('deliveries_count').notNull().default(0)
})

export const supplierMaterials = sqliteTable(
  'supplier_materials',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
    materialId: integer('material_id').notNull().references(() => materials.id),
    price: real('price').notNull(),
    leadTimeDays: integer('lead_time_days').notNull()
  },
  (t) => [uniqueIndex('supplier_material_uq').on(t.supplierId, t.materialId), index('sm_material_idx').on(t.materialId)]
)

export const purchaseRequests = sqliteTable(
  'purchase_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    materialId: integer('material_id').notNull().references(() => materials.id),
    quantity: real('quantity').notNull(),
    desiredDate: text('desired_date').notNull(),
    status: text('status', { enum: ['new', 'in_progress', 'done', 'cancelled'] }).notNull().default('new'),
    isAuto: integer('is_auto', { mode: 'boolean' }).notNull().default(false),
    comment: text('comment').notNull().default(''),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('pr_material_idx').on(t.materialId), index('pr_status_idx').on(t.status)]
)

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    number: text('number').notNull().unique(),
    supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
    requestId: integer('request_id').references(() => purchaseRequests.id),
    status: text('status', { enum: ['draft', 'sent', 'partial', 'received', 'cancelled'] }).notNull().default('draft'),
    total: real('total').notNull().default(0),
    expectedDate: text('expected_date').notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: text('created_at').notNull(),
    sentAt: text('sent_at')
  },
  (t) => [index('orders_supplier_idx').on(t.supplierId), index('orders_status_idx').on(t.status), index('orders_created_idx').on(t.createdAt)]
)

export const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id').notNull().references(() => orders.id),
    materialId: integer('material_id').notNull().references(() => materials.id),
    quantity: real('quantity').notNull(),
    price: real('price').notNull()
  },
  (t) => [index('oi_order_idx').on(t.orderId)]
)

export const receipts = sqliteTable(
  'receipts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id').notNull().references(() => orders.id),
    receivedAt: text('received_at').notNull(),
    qualityScore: integer('quality_score').notNull(),
    comment: text('comment').notNull().default('')
  },
  (t) => [index('receipts_order_idx').on(t.orderId)]
)

export const receiptItems = sqliteTable(
  'receipt_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    receiptId: integer('receipt_id').notNull().references(() => receipts.id),
    materialId: integer('material_id').notNull().references(() => materials.id),
    quantity: real('quantity').notNull()
  },
  (t) => [index('ri_receipt_idx').on(t.receiptId)]
)

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    materialId: integer('material_id').notNull().references(() => materials.id),
    type: text('type', { enum: ['in', 'out'] }).notNull(),
    quantity: real('quantity').notNull(),
    source: text('source', { enum: ['receipt', 'writeoff'] }).notNull(),
    refId: integer('ref_id'),
    createdAt: text('created_at').notNull(),
    comment: text('comment').notNull().default('')
  },
  (t) => [index('sm_mat_date_idx').on(t.materialId, t.createdAt)]
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: integer('entity_id'),
    details: text('details').notNull().default(''),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('audit_created_idx').on(t.createdAt)]
)
