import { sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import type { AttentionItem, DashboardData } from '@shared/types'
import { ORDER_STATUS_LABEL } from '@shared/labels'
import { lastMonths, monthLabel } from './util'
import { listOrders } from './orders'
import { listMaterials } from './materials'

/** Месяц расхода заказа — по дате отправки (для черновиков — по дате создания). */
export const ORDER_MONTH_SQL = sql`substr(coalesce(sent_at, created_at), 1, 7)`

export function getDashboard(): DashboardData {
  const db = getDb()
  const months = lastMonths(12)
  const rows = db.all<{ m: string; total: number }>(sql`
    select ${ORDER_MONTH_SQL} as m, sum(total) as total from orders
    where status in ('sent','partial','received') group by m`)
  const byMonth = new Map(rows.map((r) => [r.m, r.total]))
  const cur = months[months.length - 1]
  const prev = months[months.length - 2]

  const all = listOrders()
  const overdue = all.filter((o) => o.isOverdue)
  const drafts = all.filter((o) => o.status === 'draft')
  const lowMaterials = listMaterials().filter((m) => m.isLow)

  const attention: AttentionItem[] = [
    ...overdue.map((o) => ({
      kind: 'overdue' as const,
      title: `Просрочен заказ ${o.number}`,
      subtitle: `${o.supplierName} · ожидался ${o.expectedDate.split('-').reverse().join('.')}`,
      link: `/orders/${o.id}`
    })),
    ...drafts.map((o) => ({
      kind: 'draft' as const,
      title: `Черновик заказа ${o.number}`,
      subtitle: `${o.supplierName} · ${ORDER_STATUS_LABEL[o.status].toLowerCase()}, ждёт отправки`,
      link: `/orders/${o.id}`
    })),
    ...lowMaterials.map((m) => ({
      kind: 'low_stock' as const,
      title: `Низкий остаток: ${m.name}`,
      subtitle: `${m.currentStock} из минимума ${m.minStock} ${m.unit}${m.hasOpenSupply ? '' : ' · нет заявки'}`,
      link: `/materials/${m.id}`
    }))
  ]

  const top = db.all<{ id: number; name: string; rating: number }>(sql`
    select id, name, rating from suppliers where rating is not null and is_active = 1 order by rating desc limit 5`)

  return {
    spendThisMonth: byMonth.get(cur) ?? 0,
    spendPrevMonth: byMonth.get(prev) ?? 0,
    activeOrders: all.filter((o) => o.status === 'sent' || o.status === 'partial').length,
    overdueOrders: overdue.length,
    lowStock: lowMaterials.length,
    newRequests: db.get<{ c: number }>(sql`select count(*) as c from purchase_requests where status = 'new'`)?.c ?? 0,
    monthly: months.map((m) => ({ month: m, label: monthLabel(m), total: byMonth.get(m) ?? 0 })),
    topSuppliers: top,
    attention
  }
}
