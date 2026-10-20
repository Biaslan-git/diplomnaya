import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { materials, orders, purchaseRequests, supplierMaterials } from '../db/schema'
import { getDb, type DbLike } from '../db/client'
import type { RequestRow } from '@shared/types'
import { requestSchema, type RequestInput } from '@shared/schemas'
import { REQUEST_STATUS_LABEL, type RequestStatus } from '@shared/labels'
import { logAction } from './audit'
import { materialsWithOpenSupply } from './materials'
import { AppError, addDays, nowStr, round3, todayStr } from './util'

function selectRows(db: DbLike, where?: ReturnType<typeof eq>) {
  return db
    .select({
      id: purchaseRequests.id,
      materialId: purchaseRequests.materialId,
      materialName: materials.name,
      unit: materials.unit,
      quantity: purchaseRequests.quantity,
      desiredDate: purchaseRequests.desiredDate,
      status: purchaseRequests.status,
      isAuto: purchaseRequests.isAuto,
      comment: purchaseRequests.comment,
      createdAt: purchaseRequests.createdAt,
      orderId: sql<number | null>`(select o.id from orders o where o.request_id = ${purchaseRequests.id} and o.status <> 'cancelled' order by o.id desc limit 1)`,
      orderNumber: sql<string | null>`(select o.number from orders o where o.request_id = ${purchaseRequests.id} and o.status <> 'cancelled' order by o.id desc limit 1)`
    })
    .from(purchaseRequests)
    .innerJoin(materials, eq(materials.id, purchaseRequests.materialId))
    .where(where)
    .orderBy(desc(purchaseRequests.createdAt), desc(purchaseRequests.id))
    .all() as RequestRow[]
}

export function listRequests(): RequestRow[] {
  return selectRows(getDb())
}

export function getRequestRow(db: DbLike, id: number): RequestRow {
  const r = selectRows(db, eq(purchaseRequests.id, id))[0]
  if (!r) throw new AppError('Заявка не найдена')
  return r
}

export function createRequest(raw: RequestInput): RequestRow {
  const input = requestSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    const m = tx.select().from(materials).where(eq(materials.id, input.materialId)).get()
    if (!m) throw new AppError('Материал не найден')
    const row = tx.insert(purchaseRequests).values({ ...input, status: 'new', isAuto: false, createdAt: nowStr() }).returning().get()
    logAction(tx, 'Создана заявка', 'request', row.id, `${m.name}: ${input.quantity} ${m.unit}`)
    return getRequestRow(tx, row.id)
  })
}

export function updateRequest(id: number, raw: RequestInput): RequestRow {
  const input = requestSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    const cur = tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).get()
    if (!cur) throw new AppError('Заявка не найдена')
    if (cur.status !== 'new') throw new AppError('Редактировать можно только новую заявку')
    tx.update(purchaseRequests).set(input).where(eq(purchaseRequests.id, id)).run()
    logAction(tx, 'Изменена заявка', 'request', id, '')
    return getRequestRow(tx, id)
  })
}

export function setRequestStatus(id: number, status: RequestStatus): void {
  const db = getDb()
  db.transaction((tx) => {
    const cur = tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).get()
    if (!cur) throw new AppError('Заявка не найдена')
    const allowed: Record<RequestStatus, RequestStatus[]> = {
      new: ['cancelled'],
      in_progress: ['cancelled'],
      done: [],
      cancelled: ['new']
    }
    if (!allowed[cur.status].includes(status)) throw new AppError('Недопустимая смена статуса заявки')
    if (status === 'cancelled') {
      const active = tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.requestId, id), inArray(orders.status, ['draft', 'sent', 'partial'])))
        .get()
      if (active) throw new AppError('По заявке есть активный заказ — сначала отмените его')
    }
    tx.update(purchaseRequests).set({ status }).where(eq(purchaseRequests.id, id)).run()
    logAction(tx, 'Изменён статус заявки', 'request', id, `→ ${REQUEST_STATUS_LABEL[status]}`)
  })
}

/**
 * Автозаявка: остаток ниже минимума, а открытой заявки/заказа по материалу нет.
 * Возвращает id созданной заявки или null.
 */
export function ensureAutoRequest(db: DbLike, materialId: number): number | null {
  const m = db.select().from(materials).where(eq(materials.id, materialId)).get()
  if (!m || m.minStock <= 0 || m.currentStock >= m.minStock) return null
  if (materialsWithOpenSupply(db).has(materialId)) return null

  const lead = db
    .select({ d: sql<number | null>`min(${supplierMaterials.leadTimeDays})` })
    .from(supplierMaterials)
    .where(eq(supplierMaterials.materialId, materialId))
    .get()?.d
  const quantity = round3(Math.max(m.minStock * 2 - m.currentStock, m.minStock))
  const row = db
    .insert(purchaseRequests)
    .values({
      materialId,
      quantity,
      desiredDate: addDays(todayStr(), (lead ?? 5) + 2),
      status: 'new',
      isAuto: true,
      comment: `Остаток ${m.currentStock} ${m.unit} ниже минимума ${m.minStock} ${m.unit}`,
      createdAt: nowStr()
    })
    .returning()
    .get()
  logAction(db, 'Автоматически создана заявка', 'request', row.id, `${m.name}: ${quantity} ${m.unit}`)
  return row.id
}

/** Проверка всех материалов (при запуске и после операций, меняющих остатки). */
export function ensureAutoRequestsForAll(db: DbLike = getDb()): number {
  let created = 0
  const ids = db.select({ id: materials.id }).from(materials).all()
  for (const { id } of ids) if (ensureAutoRequest(db, id)) created++
  return created
}
