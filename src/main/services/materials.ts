import { eq, desc, sql, inArray } from 'drizzle-orm'
import { materials, orders, orderItems, purchaseRequests, stockMovements, supplierMaterials, suppliers, receiptItems } from '../db/schema'
import { getDb, type DbLike } from '../db/client'
import type { MaterialDetail, MaterialRow, MovementRow, MaterialSupplierRow } from '@shared/types'
import { materialSchema, writeOffSchema, type MaterialInput, type WriteOffInput } from '@shared/schemas'
import { CATEGORY_LABEL } from '@shared/labels'
import { logAction } from './audit'
import { ensureAutoRequest } from './requests'
import { listRequests } from './requests'
import { AppError, nowStr, round3 } from './util'

const OPEN_REQUEST = ['new', 'in_progress'] as const
const ACTIVE_ORDER = ['draft', 'sent', 'partial'] as const

/** id материалов, по которым есть открытая заявка или активный заказ */
export function materialsWithOpenSupply(db: DbLike): Set<number> {
  const a = db
    .select({ id: purchaseRequests.materialId })
    .from(purchaseRequests)
    .where(inArray(purchaseRequests.status, [...OPEN_REQUEST]))
    .all()
  const b = db
    .select({ id: orderItems.materialId })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(inArray(orders.status, [...ACTIVE_ORDER]))
    .all()
  return new Set([...a, ...b].map((r) => r.id))
}

function toRow(m: typeof materials.$inferSelect, open: Set<number>): MaterialRow {
  return { ...m, isLow: m.currentStock < m.minStock, hasOpenSupply: open.has(m.id) }
}

export function listMaterials(): MaterialRow[] {
  const db = getDb()
  const open = materialsWithOpenSupply(db)
  return db.select().from(materials).orderBy(materials.name).all().map((m) => toRow(m, open))
}

export function getMaterial(id: number): MaterialDetail {
  const db = getDb()
  const m = db.select().from(materials).where(eq(materials.id, id)).get()
  if (!m) throw new AppError('Материал не найден')
  const open = materialsWithOpenSupply(db)

  const movements: MovementRow[] = db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      source: stockMovements.source,
      refId: stockMovements.refId,
      createdAt: stockMovements.createdAt,
      comment: stockMovements.comment,
      refLabel: sql<string | null>`(select o.number from receipts r join orders o on o.id = r.order_id where r.id = ${stockMovements.refId} and ${stockMovements.source} = 'receipt')`
    })
    .from(stockMovements)
    .where(eq(stockMovements.materialId, id))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(500)
    .all()

  const sup: MaterialSupplierRow[] = db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      price: supplierMaterials.price,
      leadTimeDays: supplierMaterials.leadTimeDays,
      rating: suppliers.rating,
      isActive: suppliers.isActive
    })
    .from(supplierMaterials)
    .innerJoin(suppliers, eq(suppliers.id, supplierMaterials.supplierId))
    .where(eq(supplierMaterials.materialId, id))
    .all()
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))

  const requests = listRequests().filter((r) => r.materialId === id)
  return { ...toRow(m, open), movements, suppliers: sup, requests }
}

// lower() в SQLite не понимает кириллицу, поэтому сравниваем в коде
function checkDuplicateName(db: DbLike, name: string, selfId: number | null): void {
  const key = name.trim().toLowerCase()
  const dup = db.select({ id: materials.id, name: materials.name }).from(materials).all().find((m) => m.id !== selfId && m.name.trim().toLowerCase() === key)
  if (dup) throw new AppError('Материал с таким названием уже существует')
}

export function createMaterial(raw: MaterialInput): MaterialRow {
  const input = materialSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    checkDuplicateName(tx, input.name, null)
    const { initialStock, ...rest } = input
    const row = tx.insert(materials).values({ ...rest, currentStock: 0 }).returning().get()
    if (initialStock && initialStock > 0) {
      tx.insert(stockMovements)
        .values({ materialId: row.id, type: 'in', quantity: initialStock, source: 'receipt', refId: null, createdAt: nowStr(), comment: 'Начальный остаток' })
        .run()
      tx.update(materials).set({ currentStock: initialStock }).where(eq(materials.id, row.id)).run()
    }
    logAction(tx, 'Создан материал', 'material', row.id, `${row.name} (${CATEGORY_LABEL[row.category]})`)
    ensureAutoRequest(tx, row.id)
    return toRow(tx.select().from(materials).where(eq(materials.id, row.id)).get()!, materialsWithOpenSupply(tx))
  })
}

export function updateMaterial(id: number, raw: MaterialInput): MaterialRow {
  const input = materialSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    const cur = tx.select().from(materials).where(eq(materials.id, id)).get()
    if (!cur) throw new AppError('Материал не найден')
    checkDuplicateName(tx, input.name, id)
    const { initialStock: _ignored, ...rest } = input
    tx.update(materials).set(rest).where(eq(materials.id, id)).run()
    logAction(tx, 'Изменён материал', 'material', id, rest.name)
    ensureAutoRequest(tx, id)
    return toRow(tx.select().from(materials).where(eq(materials.id, id)).get()!, materialsWithOpenSupply(tx))
  })
}

export function removeMaterial(id: number): void {
  const db = getDb()
  db.transaction((tx) => {
    const m = tx.select().from(materials).where(eq(materials.id, id)).get()
    if (!m) throw new AppError('Материал не найден')
    const links =
      (tx.select({ c: sql<number>`count(*)` }).from(stockMovements).where(eq(stockMovements.materialId, id)).get()?.c ?? 0) +
      (tx.select({ c: sql<number>`count(*)` }).from(orderItems).where(eq(orderItems.materialId, id)).get()?.c ?? 0) +
      (tx.select({ c: sql<number>`count(*)` }).from(purchaseRequests).where(eq(purchaseRequests.materialId, id)).get()?.c ?? 0) +
      (tx.select({ c: sql<number>`count(*)` }).from(supplierMaterials).where(eq(supplierMaterials.materialId, id)).get()?.c ?? 0) +
      (tx.select({ c: sql<number>`count(*)` }).from(receiptItems).where(eq(receiptItems.materialId, id)).get()?.c ?? 0)
    if (links > 0) throw new AppError('Удаление запрещено: у материала есть связанные записи (движения, заявки, заказы, прайсы)')
    tx.delete(materials).where(eq(materials.id, id)).run()
    logAction(tx, 'Удалён материал', 'material', id, m.name)
  })
}

/** Приход/расход: единственный способ изменить остаток. */
export function applyMovement(
  db: DbLike,
  p: { materialId: number; type: 'in' | 'out'; quantity: number; source: 'receipt' | 'writeoff'; refId: number | null; createdAt: string; comment: string }
): void {
  const m = db.select().from(materials).where(eq(materials.id, p.materialId)).get()
  if (!m) throw new AppError('Материал не найден')
  const next = round3(m.currentStock + (p.type === 'in' ? p.quantity : -p.quantity))
  if (next < 0) throw new AppError(`Недостаточно на складе: «${m.name}» — доступно ${m.currentStock} ${m.unit}`)
  db.insert(stockMovements).values(p).run()
  db.update(materials).set({ currentStock: next }).where(eq(materials.id, p.materialId)).run()
}

export function writeOff(raw: WriteOffInput): void {
  const input = writeOffSchema.parse(raw)
  const db = getDb()
  db.transaction((tx) => {
    const m = tx.select().from(materials).where(eq(materials.id, input.materialId)).get()
    if (!m) throw new AppError('Материал не найден')
    applyMovement(tx, {
      materialId: m.id,
      type: 'out',
      quantity: input.quantity,
      source: 'writeoff',
      refId: null,
      createdAt: `${input.date} ${nowStr().slice(11)}`,
      comment: input.comment
    })
    logAction(tx, 'Списание материала', 'material', m.id, `${m.name}: ${input.quantity} ${m.unit}${input.comment ? ' — ' + input.comment : ''}`)
    ensureAutoRequest(tx, m.id)
  })
}
