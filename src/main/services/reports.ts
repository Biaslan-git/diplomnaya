import { sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import type { AnyReport, MovementsReport, OverdueReport, RatingReport, ReportKind, SpendingReport } from '@shared/types'
import { periodSchema, type Period } from '@shared/schemas'
import type { Category } from '@shared/labels'
import { getWeights } from './settings'
import { AppError, diffDays, monthLabel, round2, todayStr } from './util'
import { ORDER_MONTH_SQL } from './dashboard'

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ey, em] = to.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

const ORDER_DATE_SQL = sql`substr(coalesce(o.sent_at, o.created_at), 1, 10)`

function spending(p: Period): SpendingReport {
  const db = getDb()
  const base = sql`o.status in ('sent','partial','received') and ${ORDER_DATE_SQL} between ${p.from} and ${p.to}`
  const total = db.get<{ t: number | null; c: number }>(sql`select sum(o.total) as t, count(*) as c from orders o where ${base}`)
  const bySupplier = db.all<{ id: number; name: string; total: number; orders: number }>(sql`
    select s.id, s.name, sum(o.total) as total, count(*) as orders
    from orders o join suppliers s on s.id = o.supplier_id where ${base} group by s.id order by total desc`)
  const byCategory = db.all<{ category: Category; total: number }>(sql`
    select m.category as category, sum(oi.quantity * oi.price) as total
    from order_items oi join orders o on o.id = oi.order_id join materials m on m.id = oi.material_id
    where ${base} group by m.category order by total desc`)
  const monthly = new Map(
    db.all<{ m: string; total: number }>(sql`
      select ${ORDER_MONTH_SQL} as m, sum(o.total) as total from orders o where ${base} group by m`).map((r) => [r.m, r.total])
  )
  return {
    kind: 'spending',
    total: round2(total?.t ?? 0),
    ordersCount: total?.c ?? 0,
    bySupplier: bySupplier.map((r) => ({ ...r, total: round2(r.total) })),
    byCategory: byCategory.map((r) => ({ ...r, total: round2(r.total) })),
    byMonth: monthsBetween(p.from.slice(0, 7), p.to.slice(0, 7)).map((m) => ({ month: m, label: monthLabel(m), total: round2(monthly.get(m) ?? 0) }))
  }
}

function rating(): RatingReport {
  const db = getDb()
  const rows = db.all<RatingReport['rows'][number]>(sql`
    select id, name, rating, rating_price as price, rating_time as time, rating_quality as quality, deliveries_count as deliveries
    from suppliers order by rating is null, rating desc, name`)
  return { kind: 'rating', weights: getWeights(db), rows }
}

function overdue(p: Period): OverdueReport {
  const db = getDb()
  const today = todayStr()
  const rows = db.all<{ id: number; number: string; supplier: string; expected: string; last: string | null; status: OverdueReport['rows'][number]['status']; total: number }>(sql`
    select o.id, o.number, s.name as supplier, o.expected_date as expected, o.status, o.total,
           (select max(r.received_at) from receipts r where r.order_id = o.id) as last
    from orders o join suppliers s on s.id = o.supplier_id
    where o.status in ('sent','partial','received') and o.expected_date between ${p.from} and ${p.to}
    order by o.expected_date`)
  const out: OverdueReport['rows'] = []
  for (const r of rows) {
    const stillOpen = r.status === 'sent' || r.status === 'partial'
    const actual = stillOpen ? null : r.last
    const late = stillOpen ? r.expected < today : !!actual && actual > r.expected
    if (!late) continue
    out.push({
      orderId: r.id,
      number: r.number,
      supplierName: r.supplier,
      expectedDate: r.expected,
      receivedAt: actual,
      daysLate: stillOpen ? diffDays(today, r.expected) : diffDays(actual!, r.expected),
      status: r.status,
      total: r.total
    })
  }
  return { kind: 'overdue', rows: out }
}

function movements(p: Period): MovementsReport {
  const db = getDb()
  const rows = db.all<MovementsReport['rows'][number]>(sql`
    select m.id as materialId, m.name, m.unit, m.category,
      coalesce(sum(case when substr(sm.created_at,1,10) < ${p.from} then (case sm.type when 'in' then sm.quantity else -sm.quantity end) end), 0) as opening,
      coalesce(sum(case when substr(sm.created_at,1,10) between ${p.from} and ${p.to} and sm.type = 'in' then sm.quantity end), 0) as incoming,
      coalesce(sum(case when substr(sm.created_at,1,10) between ${p.from} and ${p.to} and sm.type = 'out' then sm.quantity end), 0) as outgoing,
      0 as closing
    from materials m left join stock_movements sm on sm.material_id = m.id
    group by m.id order by m.name`)
  return {
    kind: 'movements',
    rows: rows.map((r) => ({
      ...r,
      opening: round2(r.opening),
      incoming: round2(r.incoming),
      outgoing: round2(r.outgoing),
      closing: round2(r.opening + r.incoming - r.outgoing)
    }))
  }
}

export function getReport(kind: ReportKind, rawPeriod: Period): AnyReport {
  const p = periodSchema.parse(rawPeriod)
  if (p.from > p.to) throw new AppError('Начало периода позже его конца')
  switch (kind) {
    case 'spending': return spending(p)
    case 'rating': return rating()
    case 'overdue': return overdue(p)
    case 'movements': return movements(p)
  }
}
