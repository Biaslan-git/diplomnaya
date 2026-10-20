import { eq, sql } from 'drizzle-orm'
import { suppliers } from '../db/schema'
import { getDb, type DbLike } from '../db/client'
import { getWeights } from './settings'
import { round2, round3 } from './util'

export interface RatingResult {
  rating: number | null
  price: number | null
  time: number | null
  quality: number | null
  deliveries: number
}

const EMPTY: RatingResult = { rating: null, price: null, time: null, quality: null, deliveries: 0 }

/**
 * Рейтинг = (w1·Ц + w2·С + w3·К) × 10, где
 *  Ц — среднее по материалам отношение минимальной цены рынка к цене поставщика,
 *  С — доля поставок, принятых не позже ожидаемой даты,
 *  К — средняя оценка качества / 5.
 */
export function computeSupplierRating(db: DbLike, supplierId: number): RatingResult {
  const deliveries = db.all<{ received_at: string; expected_date: string; quality_score: number }>(sql`
    select r.received_at, o.expected_date, r.quality_score
    from receipts r join orders o on o.id = r.order_id
    where o.supplier_id = ${supplierId}`)
  if (deliveries.length === 0) return EMPTY

  const time = deliveries.filter((d) => d.received_at <= d.expected_date).length / deliveries.length
  const quality = deliveries.reduce((s, d) => s + d.quality_score, 0) / deliveries.length / 5

  // материалы, которые поставщик действительно поставлял
  const delivered = db.all<{ material_id: number; last_price: number }>(sql`
    select ri.material_id as material_id,
           (select oi.price from order_items oi join orders o2 on o2.id = oi.order_id
             where o2.supplier_id = ${supplierId} and oi.material_id = ri.material_id
             order by o2.created_at desc, oi.id desc limit 1) as last_price
    from receipt_items ri
    join receipts r on r.id = ri.receipt_id
    join orders o on o.id = r.order_id
    where o.supplier_id = ${supplierId} and ri.quantity > 0
    group by ri.material_id`)

  const ratios: number[] = []
  for (const m of delivered) {
    const own = db.get<{ price: number } | undefined>(
      sql`select price from supplier_materials where supplier_id = ${supplierId} and material_id = ${m.material_id}`
    )
    const price = own?.price ?? m.last_price
    if (!price || price <= 0) continue
    const min = db.get<{ p: number | null }>(sql`select min(price) as p from supplier_materials where material_id = ${m.material_id}`)
    const best = Math.min(min?.p ?? price, price)
    ratios.push(best / price)
  }
  const priceScore = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1

  const w = getWeights(db)
  const rating = (w.price * priceScore + w.time * time + w.quality * quality) * 10
  return {
    rating: round2(rating),
    price: round3(priceScore),
    time: round3(time),
    quality: round3(quality),
    deliveries: deliveries.length
  }
}

export function recomputeSupplierRating(db: DbLike, supplierId: number): void {
  const r = computeSupplierRating(db, supplierId)
  db.update(suppliers)
    .set({
      rating: r.rating,
      ratingPrice: r.price,
      ratingTime: r.time,
      ratingQuality: r.quality,
      deliveriesCount: r.deliveries
    })
    .where(eq(suppliers.id, supplierId))
    .run()
}

export function recomputeAllRatings(db: DbLike = getDb()): void {
  const ids = db.select({ id: suppliers.id }).from(suppliers).all()
  for (const { id } of ids) recomputeSupplierRating(db, id)
}
