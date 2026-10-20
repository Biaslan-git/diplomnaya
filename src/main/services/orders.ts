import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { materials, orderItems, orders, purchaseRequests, receiptItems, receipts, supplierMaterials, suppliers } from '../db/schema'
import { getDb, type DbLike } from '../db/client'
import type { OrderDetail, OrderFilters, OrderItemRow, OrderRow, ReceiptRow, ReceivePreviewItem, SupplierOption } from '@shared/types'
import { orderSchema, receiptSchema, type OrderInput, type ReceiptInput } from '@shared/schemas'
import { ORDER_STATUS_LABEL, type OrderStatus } from '@shared/labels'
import { logAction } from './audit'
import { applyMovement } from './materials'
import { ensureAutoRequest } from './requests'
import { recomputeSupplierRating } from './rating'
import { AppError, addDays, nowStr, round2, round3, todayStr } from './util'

export function nextOrderNumber(db: DbLike, date = todayStr()): string {
  const year = date.slice(0, 4)
  const prefix = `З-${year}-`
  const last = db
    .select({ n: orders.number })
    .from(orders)
    .where(sql`${orders.number} like ${prefix + '%'}`)
    .orderBy(desc(orders.number))
    .limit(1)
    .get()
  const seq = last ? Number(last.n.slice(prefix.length)) + 1 : 1
  return prefix + String(seq).padStart(4, '0')
}

export function isOverdue(status: OrderStatus, expectedDate: string): boolean {
  return (status === 'sent' || status === 'partial') && expectedDate < todayStr()
}

function selectOrders(db: DbLike, where?: ReturnType<typeof and>): OrderRow[] {
  const rows = db
    .select({
      id: orders.id,
      number: orders.number,
      supplierId: orders.supplierId,
      supplierName: suppliers.name,
      requestId: orders.requestId,
      status: orders.status,
      total: orders.total,
      expectedDate: orders.expectedDate,
      comment: orders.comment,
      createdAt: orders.createdAt,
      sentAt: orders.sentAt,
      itemsCount: sql<number>`(select count(*) from order_items oi where oi.order_id = ${orders.id})`,
      itemsSummary: sql<string>`coalesce((select group_concat(m.name, ', ') from order_items oi join materials m on m.id = oi.material_id where oi.order_id = ${orders.id}), '')`
    })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .all()
  return rows.map((r) => ({ ...r, isOverdue: isOverdue(r.status, r.expectedDate) }))
}

export function listOrders(f: OrderFilters = {}): OrderRow[] {
  const conds = []
  if (f.status) conds.push(eq(orders.status, f.status))
  if (f.supplierId) conds.push(eq(orders.supplierId, f.supplierId))
  if (f.from) conds.push(gte(orders.createdAt, f.from))
  if (f.to) conds.push(lte(orders.createdAt, f.to + ' 23:59:59'))
  if (f.overdueOnly) {
    conds.push(inArray(orders.status, ['sent', 'partial']))
    conds.push(sql`${orders.expectedDate} < ${todayStr()}`)
  }
  return selectOrders(getDb(), conds.length ? and(...conds) : undefined)
}

export function getOrderDetail(db: DbLike, id: number): OrderDetail {
  const base = selectOrders(db, eq(orders.id, id))[0]
  if (!base) throw new AppError('Заказ не найден')
  const s = db.select().from(suppliers).where(eq(suppliers.id, base.supplierId)).get()!

  const received = new Map<number, number>()
  for (const r of db.all<{ material_id: number; q: number }>(sql`
    select ri.material_id, sum(ri.quantity) as q from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.order_id = ${id} group by ri.material_id`))
    received.set(r.material_id, r.q)

  const items: OrderItemRow[] = db
    .select({
      id: orderItems.id,
      materialId: orderItems.materialId,
      materialName: materials.name,
      unit: materials.unit,
      quantity: orderItems.quantity,
      price: orderItems.price
    })
    .from(orderItems)
    .innerJoin(materials, eq(materials.id, orderItems.materialId))
    .where(eq(orderItems.orderId, id))
    .orderBy(orderItems.id)
    .all()
    .map((i) => ({ ...i, sum: round2(i.quantity * i.price), received: received.get(i.materialId) ?? 0 }))

  const recs = db.select().from(receipts).where(eq(receipts.orderId, id)).orderBy(receipts.receivedAt, receipts.id).all()
  const receiptRows: ReceiptRow[] = recs.map((r) => ({
    id: r.id,
    receivedAt: r.receivedAt,
    qualityScore: r.qualityScore,
    comment: r.comment,
    isLate: r.receivedAt > base.expectedDate,
    items: db
      .select({ materialId: receiptItems.materialId, materialName: materials.name, unit: materials.unit, quantity: receiptItems.quantity })
      .from(receiptItems)
      .innerJoin(materials, eq(materials.id, receiptItems.materialId))
      .where(eq(receiptItems.receiptId, r.id))
      .all()
  }))

  const req = base.requestId
    ? db.select({ id: purchaseRequests.id, isAuto: purchaseRequests.isAuto }).from(purchaseRequests).where(eq(purchaseRequests.id, base.requestId)).get() ?? null
    : null

  return {
    ...base,
    supplier: { id: s.id, name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email, rating: s.rating },
    items,
    receipts: receiptRows,
    request: req
  }
}

export function getOrder(id: number): OrderDetail {
  return getOrderDetail(getDb(), id)
}

/** Поставщики материала по убыванию рейтинга — для выбора при создании заказа. */
export function supplierOptions(materialId: number): SupplierOption[] {
  const today = todayStr()
  return getDb()
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      rating: suppliers.rating,
      price: supplierMaterials.price,
      leadTimeDays: supplierMaterials.leadTimeDays,
      isActive: suppliers.isActive
    })
    .from(supplierMaterials)
    .innerJoin(suppliers, eq(suppliers.id, supplierMaterials.supplierId))
    .where(eq(supplierMaterials.materialId, materialId))
    .all()
    .filter((o) => o.isActive)
    .map((o) => ({ ...o, expectedDate: addDays(today, o.leadTimeDays) }))
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.price - b.price)
}

function writeItems(tx: DbLike, orderId: number, input: OrderInput): number {
  const seen = new Set<number>()
  let total = 0
  for (const it of input.items) {
    if (seen.has(it.materialId)) throw new AppError('Один и тот же материал указан в заказе дважды')
    seen.add(it.materialId)
    if (!tx.select({ id: materials.id }).from(materials).where(eq(materials.id, it.materialId)).get()) throw new AppError('Материал не найден')
    tx.insert(orderItems).values({ orderId, materialId: it.materialId, quantity: it.quantity, price: it.price }).run()
    total += it.quantity * it.price
  }
  return round2(total)
}

export function createOrder(raw: OrderInput): OrderDetail {
  const input = orderSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    const sup = tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).get()
    if (!sup) throw new AppError('Поставщик не найден')
    if (!sup.isActive) throw new AppError('Поставщик деактивирован — выберите другого')

    if (input.requestId) {
      const req = tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, input.requestId)).get()
      if (!req) throw new AppError('Заявка не найдена')
      if (req.status !== 'new' && req.status !== 'in_progress') throw new AppError('Заявка уже закрыта или отменена')
      tx.update(purchaseRequests).set({ status: 'in_progress' }).where(eq(purchaseRequests.id, req.id)).run()
    }

    const number = nextOrderNumber(tx)
    const row = tx
      .insert(orders)
      .values({
        number,
        supplierId: input.supplierId,
        requestId: input.requestId ?? null,
        status: 'draft',
        total: 0,
        expectedDate: input.expectedDate,
        comment: input.comment,
        createdAt: nowStr()
      })
      .returning()
      .get()
    const total = writeItems(tx, row.id, input)
    tx.update(orders).set({ total }).where(eq(orders.id, row.id)).run()
    logAction(tx, 'Создан заказ', 'order', row.id, `${number}, ${sup.name}, ${total} ₽`)
    return getOrderDetail(tx, row.id)
  })
}

export function updateOrder(id: number, raw: OrderInput): OrderDetail {
  const input = orderSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    const cur = tx.select().from(orders).where(eq(orders.id, id)).get()
    if (!cur) throw new AppError('Заказ не найден')
    if (cur.status !== 'draft') throw new AppError('Изменять можно только черновик заказа')
    const sup = tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).get()
    if (!sup) throw new AppError('Поставщик не найден')
    tx.delete(orderItems).where(eq(orderItems.orderId, id)).run()
    const total = writeItems(tx, id, input)
    tx.update(orders).set({ supplierId: input.supplierId, expectedDate: input.expectedDate, comment: input.comment, total }).where(eq(orders.id, id)).run()
    logAction(tx, 'Изменён заказ', 'order', id, `${cur.number}, ${total} ₽`)
    return getOrderDetail(tx, id)
  })
}

export function changeOrderStatus(id: number, status: OrderStatus): OrderDetail {
  const db = getDb()
  return db.transaction((tx) => {
    const cur = tx.select().from(orders).where(eq(orders.id, id)).get()
    if (!cur) throw new AppError('Заказ не найден')
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      draft: ['sent', 'cancelled'],
      sent: ['cancelled'],
      partial: ['cancelled'],
      received: [],
      cancelled: []
    }
    if (!allowed[cur.status].includes(status)) {
      throw new AppError(`Нельзя перевести заказ из «${ORDER_STATUS_LABEL[cur.status]}» в «${ORDER_STATUS_LABEL[status]}»`)
    }
    if (status === 'sent') {
      const sup = tx.select().from(suppliers).where(eq(suppliers.id, cur.supplierId)).get()!
      if (!sup.isActive) throw new AppError('Поставщик деактивирован — отправка невозможна')
      const cnt = tx.select({ c: sql<number>`count(*)` }).from(orderItems).where(eq(orderItems.orderId, id)).get()!.c
      if (!cnt) throw new AppError('В заказе нет позиций')
      tx.update(orders).set({ status, sentAt: nowStr() }).where(eq(orders.id, id)).run()
    } else {
      tx.update(orders).set({ status }).where(eq(orders.id, id)).run()
    }
    logAction(tx, status === 'sent' ? 'Заказ отправлен поставщику' : 'Заказ отменён', 'order', id, cur.number)

    if (status === 'cancelled') releaseRequest(tx, cur.requestId)
    if (status === 'cancelled') {
      for (const it of tx.select().from(orderItems).where(eq(orderItems.orderId, id)).all()) ensureAutoRequest(tx, it.materialId)
    }
    return getOrderDetail(tx, id)
  })
}

/** Если по заявке не осталось активных заказов — вернуть её в «Новая». */
function releaseRequest(tx: DbLike, requestId: number | null): void {
  if (!requestId) return
  const req = tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, requestId)).get()
  if (!req || req.status !== 'in_progress') return
  const active = tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.requestId, requestId), inArray(orders.status, ['draft', 'sent', 'partial'])))
    .get()
  if (!active) tx.update(purchaseRequests).set({ status: 'new' }).where(eq(purchaseRequests.id, requestId)).run()
}

export function receivePreview(orderId: number): ReceivePreviewItem[] {
  const o = getOrder(orderId)
  return o.items.map((i) => ({
    orderItemId: i.id,
    materialName: i.materialName,
    unit: i.unit,
    ordered: i.quantity,
    alreadyReceived: i.received,
    remaining: Math.max(0, round3(i.quantity - i.received))
  }))
}

export function receiveOrder(raw: ReceiptInput): OrderDetail {
  const input = receiptSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    const order = tx.select().from(orders).where(eq(orders.id, input.orderId)).get()
    if (!order) throw new AppError('Заказ не найден')
    if (order.status !== 'sent' && order.status !== 'partial') {
      throw new AppError(`Принять можно только отправленный или частично полученный заказ (сейчас: «${ORDER_STATUS_LABEL[order.status]}»)`)
    }
    if (input.receivedAt > todayStr()) throw new AppError('Дата приёмки не может быть в будущем')

    const items = tx.select().from(orderItems).where(eq(orderItems.orderId, order.id)).all()
    const byId = new Map(items.map((i) => [i.id, i]))
    const receipt = tx
      .insert(receipts)
      .values({ orderId: order.id, receivedAt: input.receivedAt, qualityScore: input.qualityScore, comment: input.comment })
      .returning()
      .get()

    const stamp = `${input.receivedAt} ${nowStr().slice(11)}`
    for (const line of input.items) {
      if (line.quantity <= 0) continue
      const item = byId.get(line.orderItemId)
      if (!item) throw new AppError('Позиция не относится к этому заказу')
      tx.insert(receiptItems).values({ receiptId: receipt.id, materialId: item.materialId, quantity: line.quantity }).run()
      applyMovement(tx, {
        materialId: item.materialId,
        type: 'in',
        quantity: line.quantity,
        source: 'receipt',
        refId: receipt.id,
        createdAt: stamp,
        comment: `Приёмка по заказу ${order.number}`
      })
    }

    // полностью ли закрыт заказ
    const rec = new Map<number, number>()
    for (const r of tx.all<{ material_id: number; q: number }>(sql`
      select ri.material_id, sum(ri.quantity) as q from receipt_items ri join receipts r on r.id = ri.receipt_id
      where r.order_id = ${order.id} group by ri.material_id`))
      rec.set(r.material_id, r.q)
    const complete = items.every((i) => (rec.get(i.materialId) ?? 0) + 1e-9 >= i.quantity)
    const status: OrderStatus = complete ? 'received' : 'partial'
    tx.update(orders).set({ status }).where(eq(orders.id, order.id)).run()

    if (complete && order.requestId) {
      tx.update(purchaseRequests).set({ status: 'done' }).where(eq(purchaseRequests.id, order.requestId)).run()
    }
    recomputeSupplierRating(tx, order.supplierId)
    logAction(
      tx,
      complete ? 'Приёмка поставки (заказ получен)' : 'Приёмка поставки (частично)',
      'order',
      order.id,
      `${order.number}, оценка качества ${input.qualityScore}${input.receivedAt > order.expectedDate ? ', с опозданием' : ''}`
    )
    return getOrderDetail(tx, order.id)
  })
}
