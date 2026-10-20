import { and, eq, sql } from 'drizzle-orm'
import { materials, orders, supplierMaterials, suppliers } from '../db/schema'
import { getDb, type DbLike } from '../db/client'
import type { SupplierDetail, SupplierPriceRow, SupplierRow } from '@shared/types'
import { supplierPriceSchema, supplierSchema, type SupplierInput, type SupplierPriceInput } from '@shared/schemas'
import { logAction } from './audit'
import { listOrders } from './orders'
import { recomputeAllRatings } from './rating'
import { AppError, round2 } from './util'

function selectSuppliers(db: DbLike, id?: number): SupplierRow[] {
  const q = db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      inn: suppliers.inn,
      contactPerson: suppliers.contactPerson,
      phone: suppliers.phone,
      email: suppliers.email,
      address: suppliers.address,
      comment: suppliers.comment,
      isActive: suppliers.isActive,
      rating: suppliers.rating,
      ratingPrice: suppliers.ratingPrice,
      ratingTime: suppliers.ratingTime,
      ratingQuality: suppliers.ratingQuality,
      deliveriesCount: suppliers.deliveriesCount,
      materialsCount: sql<number>`(select count(*) from supplier_materials sm where sm.supplier_id = ${suppliers.id})`,
      ordersCount: sql<number>`(select count(*) from orders o where o.supplier_id = ${suppliers.id} and o.status <> 'draft')`
    })
    .from(suppliers)
  return (id === undefined ? q.orderBy(suppliers.name) : q.where(eq(suppliers.id, id))).all()
}

export function listSuppliers(): SupplierRow[] {
  return selectSuppliers(getDb())
}

export function getSupplier(id: number): SupplierDetail {
  const db = getDb()
  const base = selectSuppliers(db, id)[0]
  if (!base) throw new AppError('Поставщик не найден')

  const prices: SupplierPriceRow[] = db
    .select({
      id: supplierMaterials.id,
      materialId: materials.id,
      materialName: materials.name,
      unit: materials.unit,
      category: materials.category,
      price: supplierMaterials.price,
      leadTimeDays: supplierMaterials.leadTimeDays,
      minPrice: sql<number>`(select min(s2.price) from supplier_materials s2 where s2.material_id = ${materials.id})`
    })
    .from(supplierMaterials)
    .innerJoin(materials, eq(materials.id, supplierMaterials.materialId))
    .where(eq(supplierMaterials.supplierId, id))
    .orderBy(materials.name)
    .all()

  const supplierOrders = listOrders({ supplierId: id })

  const del = db.all<{ late: number; total: number; q: number | null }>(sql`
    select sum(case when r.received_at > o.expected_date then 1 else 0 end) as late, count(*) as total, avg(r.quality_score) as q
    from receipts r join orders o on o.id = r.order_id where o.supplier_id = ${id}`)[0]
  const spend =
    db.get<{ s: number | null }>(sql`select sum(total) as s from orders where supplier_id = ${id} and status in ('sent','partial','received')`)?.s ?? 0

  return {
    ...base,
    prices,
    orders: supplierOrders,
    stats: {
      onTimePct: del.total ? Math.round(((del.total - (del.late ?? 0)) / del.total) * 1000) / 10 : null,
      avgQuality: del.q === null || del.total === 0 ? null : round2(del.q),
      totalSpend: spend,
      lateCount: del.late ?? 0
    }
  }
}

export function createSupplier(raw: SupplierInput): SupplierRow {
  const input = supplierSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    checkDuplicate(tx, input, null)
    const row = tx.insert(suppliers).values({ ...input, isActive: true }).returning().get()
    logAction(tx, 'Создан поставщик', 'supplier', row.id, row.name)
    return selectSuppliers(tx, row.id)[0]
  })
}

export function updateSupplier(id: number, raw: SupplierInput): SupplierRow {
  const input = supplierSchema.parse(raw)
  const db = getDb()
  return db.transaction((tx) => {
    if (!tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, id)).get()) throw new AppError('Поставщик не найден')
    checkDuplicate(tx, input, id)
    tx.update(suppliers).set(input).where(eq(suppliers.id, id)).run()
    logAction(tx, 'Изменён поставщик', 'supplier', id, input.name)
    return selectSuppliers(tx, id)[0]
  })
}

function checkDuplicate(db: DbLike, input: SupplierInput, selfId: number | null) {
  if (!input.inn) return
  const dup = db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.inn, input.inn)).get()
  if (dup && dup.id !== selfId) throw new AppError('Поставщик с таким ИНН уже есть в справочнике')
}

export function setSupplierActive(id: number, active: boolean): void {
  const db = getDb()
  db.transaction((tx) => {
    const s = tx.select().from(suppliers).where(eq(suppliers.id, id)).get()
    if (!s) throw new AppError('Поставщик не найден')
    tx.update(suppliers).set({ isActive: active }).where(eq(suppliers.id, id)).run()
    logAction(tx, active ? 'Поставщик активирован' : 'Поставщик деактивирован', 'supplier', id, s.name)
  })
}

export function removeSupplier(id: number): void {
  const db = getDb()
  db.transaction((tx) => {
    const s = tx.select().from(suppliers).where(eq(suppliers.id, id)).get()
    if (!s) throw new AppError('Поставщик не найден')
    const hasOrders = tx.select({ id: orders.id }).from(orders).where(eq(orders.supplierId, id)).get()
    if (hasOrders) throw new AppError('Удаление запрещено: у поставщика есть заказы. Деактивируйте его.')
    tx.delete(supplierMaterials).where(eq(supplierMaterials.supplierId, id)).run()
    tx.delete(suppliers).where(eq(suppliers.id, id)).run()
    logAction(tx, 'Удалён поставщик', 'supplier', id, s.name)
  })
}

export function saveSupplierPrice(raw: SupplierPriceInput): void {
  const input = supplierPriceSchema.parse(raw)
  const db = getDb()
  db.transaction((tx) => {
    const s = tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).get()
    const m = tx.select().from(materials).where(eq(materials.id, input.materialId)).get()
    if (!s || !m) throw new AppError('Поставщик или материал не найден')
    const cur = tx
      .select()
      .from(supplierMaterials)
      .where(and(eq(supplierMaterials.supplierId, input.supplierId), eq(supplierMaterials.materialId, input.materialId)))
      .get()
    if (cur) {
      tx.update(supplierMaterials).set({ price: input.price, leadTimeDays: input.leadTimeDays }).where(eq(supplierMaterials.id, cur.id)).run()
    } else {
      tx.insert(supplierMaterials).values(input).run()
    }
    logAction(tx, cur ? 'Изменён прайс поставщика' : 'Добавлен материал в прайс', 'supplier', s.id, `${s.name}: ${m.name} — ${input.price} ₽, ${input.leadTimeDays} дн.`)
    // цены влияют на критерий «Цена» у всех поставщиков этого материала
    recomputeAllRatings(tx)
  })
}

export function removeSupplierPrice(id: number): void {
  const db = getDb()
  db.transaction((tx) => {
    const row = tx.select().from(supplierMaterials).where(eq(supplierMaterials.id, id)).get()
    if (!row) throw new AppError('Позиция прайса не найдена')
    tx.delete(supplierMaterials).where(eq(supplierMaterials.id, id)).run()
    logAction(tx, 'Удалён материал из прайса', 'supplier', row.supplierId, `материал #${row.materialId}`)
    recomputeAllRatings(tx)
  })
}

