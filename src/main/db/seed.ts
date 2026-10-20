import { sql } from 'drizzle-orm'
import type { DbLike } from './client'
import {
  auditLog, materials, orderItems, orders, purchaseRequests, receiptItems, receipts, settings, stockMovements, supplierMaterials, suppliers
} from './schema'
import type { Category } from '@shared/labels'
import { addDays, diffDays, round2, round3, todayStr } from '../services/util'
import { ensureAutoRequestsForAll } from '../services/requests'
import { recomputeAllRatings } from '../services/rating'
import { DEFAULT_WEIGHTS } from '../services/settings'

// ---------- детерминированный генератор, чтобы демо-данные были воспроизводимы ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface MatDef { key: string; name: string; category: Category; unit: string; min: number; price: number; cons: number; step: number; desc: string }

const MATERIALS: MatDef[] = [
  { key: 'malt1', name: 'Солод ячменный светлый', category: 'raw', unit: 'кг', min: 2000, price: 62, cons: 90, step: 25, desc: 'Основной базовый солод для всех сортов светлого пива' },
  { key: 'malt2', name: 'Солод карамельный', category: 'raw', unit: 'кг', min: 500, price: 85, cons: 20, step: 25, desc: 'Придаёт цвет и карамельные оттенки вкуса' },
  { key: 'hopB', name: 'Хмель горький (гранулы)', category: 'raw', unit: 'кг', min: 60, price: 1650, cons: 2.2, step: 1, desc: 'Горький хмель, гранулы Т-90' },
  { key: 'hopA', name: 'Хмель ароматный', category: 'raw', unit: 'кг', min: 40, price: 2100, cons: 1.4, step: 1, desc: 'Ароматический хмель для поздней засыпки' },
  { key: 'yeast', name: 'Пивные дрожжи', category: 'raw', unit: 'кг', min: 30, price: 950, cons: 1.1, step: 1, desc: 'Низовые сухие дрожжи (лагер)' },
  { key: 'glass', name: 'Бутылка стеклянная 0,5 л', category: 'container', unit: 'шт', min: 20000, price: 14.5, cons: 700, step: 500, desc: 'Коричневое стекло, венчик под кронен-пробку' },
  { key: 'pet', name: 'ПЭТ-бутылка 1,5 л', category: 'container', unit: 'шт', min: 10000, price: 9.8, cons: 350, step: 500, desc: 'Тёмная ПЭТ-бутылка, горло 28 мм' },
  { key: 'keg', name: 'Кега 30 л', category: 'container', unit: 'шт', min: 60, price: 3400, cons: 1.5, step: 5, desc: 'Нержавеющая кега с фитингом типа A' },
  { key: 'cap', name: 'Кронен-пробка', category: 'packaging', unit: 'шт', min: 30000, price: 0.62, cons: 1000, step: 1000, desc: 'Диаметр 26 мм, с уплотнителем' },
  { key: 'label', name: 'Этикетка', category: 'packaging', unit: 'шт', min: 25000, price: 2.1, cons: 900, step: 1000, desc: 'Самоклеящаяся этикетка, полноцветная печать' },
  { key: 'box', name: 'Гофрокороб', category: 'packaging', unit: 'шт', min: 1500, price: 38, cons: 60, step: 50, desc: 'Короб на 12 бутылок 0,5 л' },
  { key: 'film', name: 'Стрейч-плёнка', category: 'packaging', unit: 'рулон', min: 40, price: 620, cons: 1.6, step: 5, desc: 'Паллетная плёнка 500 мм × 300 м' },
  { key: 'cip', name: 'Моющее средство CIP', category: 'consumable', unit: 'л', min: 200, price: 185, cons: 8, step: 10, desc: 'Щелочное средство для мойки оборудования' }
]

interface SupDef {
  key: string; name: string; inn: string; contact: string; phone: string; email: string; address: string; comment: string
  factor: number; lead: number; lateProb: number; maxLate: number; quality: number; partialProb: number; materials: string[]
}

const SUPPLIERS: SupDef[] = [
  {
    key: 'zerno', name: 'ООО «ЗерноТрейд»', inn: '2635112233', contact: 'Алиев Руслан Магомедович', phone: '+7 (8652) 55-10-21', email: 'sales@zernotrade.example',
    address: 'г. Ставрополь, ул. Элеваторная, 14', comment: 'Самые низкие цены, но поставки часто задерживаются',
    factor: 0.86, lead: 5, lateProb: 0.55, maxLate: 8, quality: 3.5, partialProb: 0.2, materials: ['malt1', 'malt2', 'yeast', 'box']
  },
  {
    key: 'kolos', name: 'АО «Золотой колос»', inn: '7708445566', contact: 'Соколова Ирина Викторовна', phone: '+7 (495) 210-45-60', email: 'zakaz@zolotoykolos.example',
    address: 'г. Москва, Варшавское шоссе, 125', comment: 'Дороже рынка, зато всегда вовремя и с отличным качеством',
    factor: 1.14, lead: 4, lateProb: 0.04, maxLate: 2, quality: 4.8, partialProb: 0.03, materials: ['malt1', 'malt2', 'hopB', 'hopA', 'yeast']
  },
  {
    key: 'hmel', name: 'ООО «КавказХмель»', inn: '0901234567', contact: 'Байрамуков Заур Хасанович', phone: '+7 (87879) 2-44-18', email: 'info@kavkazhmel.example',
    address: 'г. Черкесск, пр. Ленина, 62', comment: 'Специализируется на хмеле и дрожжах, средние цены',
    factor: 1.0, lead: 7, lateProb: 0.3, maxLate: 4, quality: 4.1, partialProb: 0.1, materials: ['hopB', 'hopA', 'yeast', 'malt2', 'cip']
  },
  {
    key: 'steklo', name: 'ЗАО «СтеклоПак»', inn: '2310778899', contact: 'Громов Андрей Петрович', phone: '+7 (861) 233-70-05', email: 'order@steklopak.example',
    address: 'г. Краснодар, ул. Промышленная, 3', comment: 'Тара и пробка, стабильное качество',
    factor: 1.0, lead: 6, lateProb: 0.12, maxLate: 3, quality: 4.4, partialProb: 0.08, materials: ['glass', 'pet', 'keg', 'cap']
  },
  {
    key: 'poly', name: 'ООО «ПолиУпак»', inn: '2634556677', contact: 'Мамаева Залина Руслановна', phone: '+7 (8793) 33-21-09', email: 'sales@polyupak.example',
    address: 'г. Пятигорск, ул. Заводская, 41', comment: 'Широкий ассортимент тары и упаковки, цены ниже средних',
    factor: 0.93, lead: 8, lateProb: 0.4, maxLate: 6, quality: 3.8, partialProb: 0.15, materials: ['glass', 'pet', 'keg', 'cap', 'label', 'box', 'film']
  },
  {
    key: 'vektor', name: 'ООО «Вектор Снаб»', inn: '0917889900', contact: 'Хубиев Азамат Борисович', phone: '+7 (87822) 6-18-33', email: 'vs@vektorsnab.example',
    address: 'г. Карачаевск, ул. Октябрьская, 9', comment: 'Химия для мойки, плёнка, этикетки и короба',
    factor: 1.05, lead: 5, lateProb: 0.1, maxLate: 3, quality: 4.6, partialProb: 0.05, materials: ['cip', 'film', 'label', 'box']
  }
]

const WRITEOFF_COMMENTS = ['На производство', 'На производство — варка', 'Розлив', 'Мойка оборудования', 'На производство — плановая партия']

interface ReceiptSpec { date: string; quality: number; comment: string; qty: Map<string, number> }
interface OrderSpec {
  createdAt: string
  sentAt: string | null
  expected: string
  supplier: SupDef
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  items: { mat: MatDef; qty: number; price: number }[]
  receipts: ReceiptSpec[]
  request: { auto: boolean; createdAt: string; status: 'new' | 'in_progress' | 'done' | 'cancelled' } | null
  comment: string
}

export function clearAllData(db: DbLike): void {
  for (const t of [auditLog, stockMovements, receiptItems, receipts, orderItems, orders, purchaseRequests, supplierMaterials, suppliers, materials, settings]) {
    db.delete(t).run()
  }
  db.run(sql`delete from sqlite_sequence where name <> 'users'`)
}

export function seedDemo(db: DbLike, today = todayStr()): void {
  const rnd = mulberry32(20260101)
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]
  const between = (a: number, b: number) => a + rnd() * (b - a)
  const intBetween = (a: number, b: number) => Math.floor(between(a, b + 1))
  const time = (d: string, h1 = 8, h2 = 17) =>
    `${d} ${String(intBetween(h1, h2)).padStart(2, '0')}:${String(intBetween(0, 59)).padStart(2, '0')}:${String(intBetween(0, 59)).padStart(2, '0')}`

  clearAllData(db)
  for (const [k, v] of Object.entries({ weight_price: DEFAULT_WEIGHTS.price, weight_time: DEFAULT_WEIGHTS.time, weight_quality: DEFAULT_WEIGHTS.quality })) {
    db.insert(settings).values({ key: k, value: String(v) }).run()
  }

  // ---------- справочники ----------
  const matId = new Map<string, number>()
  for (const m of MATERIALS) {
    const row = db
      .insert(materials)
      .values({ name: m.name, category: m.category, unit: m.unit, minStock: m.min, currentStock: 0, description: m.desc })
      .returning({ id: materials.id })
      .get()
    matId.set(m.key, row.id)
  }
  const matByKey = new Map(MATERIALS.map((m) => [m.key, m]))

  const supId = new Map<string, number>()
  const priceOf = new Map<string, { price: number; lead: number }>() // `${sup}:${mat}`
  for (const s of SUPPLIERS) {
    const row = db
      .insert(suppliers)
      .values({ name: s.name, inn: s.inn, contactPerson: s.contact, phone: s.phone, email: s.email, address: s.address, comment: s.comment, isActive: true })
      .returning({ id: suppliers.id })
      .get()
    supId.set(s.key, row.id)
    for (const mk of s.materials) {
      const m = matByKey.get(mk)!
      const price = round2(m.price * s.factor * between(0.96, 1.04))
      const lead = s.lead + intBetween(0, 3)
      priceOf.set(`${s.key}:${mk}`, { price, lead })
      db.insert(supplierMaterials).values({ supplierId: row.id, materialId: matId.get(mk)!, price, leadTimeDays: lead }).run()
    }
  }

  // ---------- имитация работы предприятия за последние ~11 месяцев ----------
  const HISTORY_DAYS = 290
  const start = addDays(today, -HISTORY_DAYS)
  const stock = new Map<string, number>()
  const openUntil = new Map<string, string>() // материал «в пути» до этой даты
  const arrivals = new Map<string, { mat: string; qty: number }[]>() // дата → приходы
  const writeoffs: { mat: string; date: string; qty: number; comment: string }[] = []
  const acc = new Map<string, number>()
  for (const m of MATERIALS) {
    stock.set(m.key, round3(m.min * between(2.2, 2.8)))
    acc.set(m.key, 0)
  }
  const initial = new Map(stock)
  const specs: OrderSpec[] = []

  const supplierWeights = (mk: string) => {
    const list = SUPPLIERS.filter((s) => s.materials.includes(mk))
    const w = list.map((s) => Math.pow(1 / priceOf.get(`${s.key}:${mk}`)!.price, 3))
    const sum = w.reduce((a, b) => a + b, 0)
    let r = rnd() * sum
    for (let i = 0; i < list.length; i++) {
      r -= w[i]
      if (r <= 0) return list[i]
    }
    return list[list.length - 1]
  }

  const qualityFor = (s: SupDef) => Math.max(1, Math.min(5, Math.round(s.quality + (rnd() - 0.5) * 1.6)))

  for (let i = 0; i <= HISTORY_DAYS; i++) {
    const day = addDays(start, i)

    for (const a of arrivals.get(day) ?? []) stock.set(a.mat, stock.get(a.mat)! + a.qty)

    // расход (списание накапливается и оформляется раз в несколько дней)
    for (const [idx, m] of MATERIALS.entries()) {
      acc.set(m.key, acc.get(m.key)! + m.cons * between(0.7, 1.3))
      if ((i + idx) % 4 === 0 || day === today) {
        let q = Math.min(Math.round(acc.get(m.key)! / (m.step >= 5 ? 1 : 0.1)) * (m.step >= 5 ? 1 : 0.1), stock.get(m.key)!)
        q = round3(m.cons < 5 ? Math.round(q * 10) / 10 : Math.round(q))
        if (q > 0) {
          writeoffs.push({ mat: m.key, date: day, qty: q, comment: pick(WRITEOFF_COMMENTS) })
          stock.set(m.key, round3(stock.get(m.key)! - q))
          acc.set(m.key, Math.max(0, acc.get(m.key)! - q))
        }
      }
    }

    // заказы по материалам с низким запасом
    const need = MATERIALS.filter((m) => stock.get(m.key)! < m.min * 1.5 && !((openUntil.get(m.key) ?? '') >= day))
    if (i < HISTORY_DAYS - 3 || i === HISTORY_DAYS) {
      const bySup = new Map<string, MatDef[]>()
      for (const m of need) {
        const s = supplierWeights(m.key)
        bySup.set(s.key, [...(bySup.get(s.key) ?? []), m])
      }
      for (const [sk, mats] of bySup) {
        const sup = SUPPLIERS.find((s) => s.key === sk)!
        const sentDay = addDays(day, rnd() < 0.5 ? 0 : 1)
        const items = mats.map((m) => {
          const raw = (m.cons * between(65, 85))
          const qty = Math.max(m.step, Math.round(raw / m.step) * m.step)
          return { mat: m, qty, price: priceOf.get(`${sk}:${m.key}`)!.price }
        })
        const lead = Math.max(...items.map((it) => priceOf.get(`${sk}:${it.mat.key}`)!.lead))
        const sent = sentDay > today ? today : sentDay
        const expected = addDays(sent, lead)
        const late = rnd() < sup.lateProb
        const delay = late ? intBetween(1, sup.maxLate) : -intBetween(0, 1)
        const firstDay = addDays(expected, delay)
        const partial = rnd() < sup.partialProb
        const rcpts: ReceiptSpec[] = []
        let status: OrderSpec['status'] = 'sent'
        if (firstDay <= today) {
          if (partial) {
            const frac = between(0.5, 0.8)
            rcpts.push({
              date: firstDay, quality: qualityFor(sup), comment: 'Недопоставка, остаток по графику',
              qty: new Map(items.map((it) => [it.mat.key, Math.round((it.qty * frac) / it.mat.step) * it.mat.step || it.mat.step]))
            })
            const secondDay = addDays(firstDay, intBetween(3, 9))
            status = 'partial'
            if (secondDay <= today) {
              rcpts.push({
                date: secondDay, quality: qualityFor(sup), comment: 'Довоз остатка',
                qty: new Map(items.map((it) => [it.mat.key, round3(it.qty - rcpts[0].qty.get(it.mat.key)!)]))
              })
              status = 'received'
            }
          } else {
            rcpts.push({
              date: firstDay, quality: qualityFor(sup),
              comment: late ? pick(['Задержка по вине перевозчика', 'Поставка с опозданием', '']) : pick(['', '', 'Без замечаний']),
              qty: new Map(items.map((it) => [it.mat.key, it.qty]))
            })
            status = 'received'
          }
        }
        for (const r of rcpts) {
          for (const [mk, q] of r.qty) {
            if (q <= 0) continue
            arrivals.set(r.date, [...(arrivals.get(r.date) ?? []), { mat: mk, qty: q }])
          }
        }
        const finalDay = rcpts.length && status === 'received' ? rcpts[rcpts.length - 1].date : addDays(expected, 30)
        for (const m of mats) openUntil.set(m.key, finalDay > today ? '9999-12-31' : finalDay)
        specs.push({
          createdAt: time(day, 8, 11), sentAt: time(sent, 9, 15), expected, supplier: sup, status, items, receipts: rcpts,
          request: { auto: rnd() < 0.55, createdAt: time(addDays(day, -intBetween(1, 2)), 8, 17), status: status === 'received' ? 'done' : 'in_progress' },
          comment: rnd() < 0.2 ? pick(['Срочно, до начала варки', 'Согласовано с главным технологом', 'Оплата по факту поставки']) : ''
        })
      }
    }
  }

  // принудительно уводим два-три материала ниже минимума (идёт плановая переработка)
  const forced = ['hopA', 'cap', 'cip'].filter((k) => !((openUntil.get(k) ?? '') > today)).slice(0, 3)
  for (const k of forced) {
    const m = matByKey.get(k)!
    const target = round3(m.min * between(0.45, 0.8))
    const q = round3(stock.get(k)! - target)
    if (q > 0) {
      writeoffs.push({ mat: k, date: today, qty: q, comment: 'Срочная партия на производство' })
      stock.set(k, target)
    }
  }

  // дополнительные заказы: черновики и отменённые
  const idle = MATERIALS.filter((m) => !forced.includes(m.key) && !((openUntil.get(m.key) ?? '') > today) && stock.get(m.key)! >= m.min)
  const takeIdle = (keys?: string[]) => {
    const i = idle.findIndex((m) => !keys || keys.includes(m.key))
    return i < 0 ? undefined : idle.splice(i, 1)[0]
  }

  // просроченные поставки: ненадёжные поставщики не привезли заказ к ожидаемой дате
  const overdueDefs = [
    { sup: 'zerno', keys: ['yeast', 'box', 'malt2', 'malt1'], sentBack: 19, overBy: 6, partial: false },
    { sup: 'poly', keys: ['glass', 'pet', 'keg', 'film', 'label'], sentBack: 22, overBy: 4, partial: true },
    { sup: 'zerno', keys: ['malt1', 'malt2', 'box', 'yeast'], sentBack: 14, overBy: 2, partial: false }
  ]
  for (const d of overdueDefs) {
    const sup = SUPPLIERS.find((s) => s.key === d.sup)!
    const m = takeIdle(d.keys.filter((k) => sup.materials.includes(k)))
    if (!m) continue
    const pr = priceOf.get(`${sup.key}:${m.key}`)!
    const sent = addDays(today, -d.sentBack)
    const qty = Math.max(m.step, Math.round((m.cons * 70) / m.step) * m.step)
    const rc: ReceiptSpec[] = d.partial
      ? [{ date: addDays(today, -d.overBy), quality: 3, comment: 'Привезли часть партии, остальное обещают', qty: new Map([[m.key, Math.round((qty * 0.6) / m.step) * m.step]]) }]
      : []
    specs.push({
      createdAt: time(addDays(sent, -1), 8, 11), sentAt: time(sent, 9, 15), expected: addDays(today, -d.overBy), supplier: sup,
      status: d.partial ? 'partial' : 'sent', items: [{ mat: m, qty, price: pr.price }], receipts: rc,
      request: { auto: false, createdAt: time(addDays(sent, -2), 9, 15), status: 'in_progress' }, comment: 'Поставщик обещал отгрузку'
    })
  }

  const draftSources = [takeIdle(), takeIdle()].filter((m): m is MatDef => !!m)
  for (const m of draftSources) {
    const sup = supplierWeights(m.key)
    const pr = priceOf.get(`${sup.key}:${m.key}`)!
    const qty = Math.round((m.cons * 60) / m.step) * m.step
    specs.push({
      createdAt: time(addDays(today, -intBetween(0, 1)), 8, 12), sentAt: null, expected: addDays(today, pr.lead), supplier: sup, status: 'draft',
      items: [{ mat: m, qty, price: pr.price }], receipts: [],
      request: { auto: false, createdAt: time(addDays(today, -2), 9, 15), status: 'in_progress' }, comment: 'Ожидает согласования'
    })
  }
  for (const [back, mk] of [[75, 'label'], [140, 'film']] as const) {
    const m = matByKey.get(mk)!
    const sup = SUPPLIERS.find((s) => s.materials.includes(mk))!
    const pr = priceOf.get(`${sup.key}:${mk}`)!
    const d = addDays(today, -back)
    specs.push({
      createdAt: time(d, 9, 12), sentAt: null, expected: addDays(d, pr.lead), supplier: sup, status: 'cancelled',
      items: [{ mat: m, qty: Math.round((m.cons * 50) / m.step) * m.step, price: pr.price }], receipts: [],
      request: { auto: false, createdAt: time(addDays(d, -1), 9, 15), status: 'cancelled' }, comment: 'Отменён: найден поставщик выгоднее'
    })
  }
  // пара свободных заявок без заказа
  const looseRequests = [
    { mat: 'box', qty: 1500, back: 1, comment: 'Под новую партию розлива' },
    { mat: 'malt2', qty: 800, back: 3, comment: 'Запуск нового сорта — «Карачаевское тёмное»' }
  ].filter((r) => idle.some((m) => m.key === r.mat))

  // ---------- запись в БД: заказы по хронологии, чтобы номера шли по порядку ----------
  specs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const counters = new Map<string, number>()
  const audit = (action: string, entity: string, id: number | null, details: string, at: string) =>
    db.insert(auditLog).values({ action, entity, entityId: id, details, createdAt: at }).run()

  for (const m of MATERIALS) {
    const q = initial.get(m.key)!
    db.insert(stockMovements)
      .values({ materialId: matId.get(m.key)!, type: 'in', quantity: q, source: 'receipt', refId: null, createdAt: `${start} 08:00:00`, comment: 'Начальный остаток' })
      .run()
  }

  for (const o of specs) {
    const year = o.createdAt.slice(0, 4)
    const n = (counters.get(year) ?? 0) + 1
    counters.set(year, n)
    const number = `З-${year}-${String(n).padStart(4, '0')}`
    const total = round2(o.items.reduce((s, it) => s + it.qty * it.price, 0))

    let requestId: number | null = null
    if (o.request) {
      const first = o.items[0]
      const req = db
        .insert(purchaseRequests)
        .values({
          materialId: matId.get(first.mat.key)!, quantity: first.qty, desiredDate: o.expected, status: o.request.status, isAuto: o.request.auto,
          comment: o.request.auto ? `Остаток ниже минимума ${first.mat.min} ${first.mat.unit}` : 'Плановая закупка', createdAt: o.request.createdAt
        })
        .returning({ id: purchaseRequests.id })
        .get()
      requestId = req.id
      audit(o.request.auto ? 'Автоматически создана заявка' : 'Создана заявка', 'request', req.id, `${first.mat.name}: ${first.qty} ${first.mat.unit}`, o.request.createdAt)
    }

    const row = db
      .insert(orders)
      .values({
        number, supplierId: supId.get(o.supplier.key)!, requestId, status: o.status, total, expectedDate: o.expected,
        comment: o.comment, createdAt: o.createdAt, sentAt: o.sentAt
      })
      .returning({ id: orders.id })
      .get()
    for (const it of o.items) {
      db.insert(orderItems).values({ orderId: row.id, materialId: matId.get(it.mat.key)!, quantity: it.qty, price: it.price }).run()
    }
    audit('Создан заказ', 'order', row.id, `${number}, ${o.supplier.name}, ${total} ₽`, o.createdAt)
    if (o.sentAt) audit('Заказ отправлен поставщику', 'order', row.id, number, o.sentAt)
    if (o.status === 'cancelled') audit('Заказ отменён', 'order', row.id, number, addDays(o.createdAt.slice(0, 10), 2) + ' 10:15:00')

    o.receipts.forEach((r, idx) => {
      const rc = db
        .insert(receipts)
        .values({ orderId: row.id, receivedAt: r.date, qualityScore: r.quality, comment: r.comment })
        .returning({ id: receipts.id })
        .get()
      for (const [mk, q] of r.qty) {
        if (q <= 0) continue
        db.insert(receiptItems).values({ receiptId: rc.id, materialId: matId.get(mk)!, quantity: q }).run()
        db.insert(stockMovements)
          .values({ materialId: matId.get(mk)!, type: 'in', quantity: q, source: 'receipt', refId: rc.id, createdAt: time(r.date, 9, 16), comment: `Приёмка по заказу ${number}` })
          .run()
      }
      const last = idx === o.receipts.length - 1 && o.status === 'received'
      audit(last ? 'Приёмка поставки (заказ получен)' : 'Приёмка поставки (частично)', 'order', row.id, `${number}, оценка качества ${r.quality}${r.date > o.expected ? ', с опозданием' : ''}`, time(r.date, 9, 16))
    })
  }

  for (const w of writeoffs) {
    db.insert(stockMovements)
      .values({ materialId: matId.get(w.mat)!, type: 'out', quantity: w.qty, source: 'writeoff', refId: null, createdAt: time(w.date, 6, 15), comment: w.comment })
      .run()
    if (diffDays(today, w.date) <= 21) {
      audit('Списание материала', 'material', matId.get(w.mat)!, `${matByKey.get(w.mat)!.name}: ${w.qty} ${matByKey.get(w.mat)!.unit} — ${w.comment}`, time(w.date, 6, 15))
    }
  }

  for (const r of looseRequests) {
    const m = matByKey.get(r.mat)!
    const created = `${addDays(today, -r.back)} 10:20:00`
    const row = db
      .insert(purchaseRequests)
      .values({ materialId: matId.get(r.mat)!, quantity: r.qty, desiredDate: addDays(today, 10), status: 'new', isAuto: false, comment: r.comment, createdAt: created })
      .returning({ id: purchaseRequests.id })
      .get()
    audit('Создана заявка', 'request', row.id, `${m.name}: ${r.qty} ${m.unit}`, created)
  }

  // итоговые остатки = сумма движений
  db.run(sql`update materials set current_stock = round(coalesce((select sum(case type when 'in' then quantity else -quantity end) from stock_movements where material_id = materials.id), 0), 3)`)
  recomputeAllRatings(db)
  ensureAutoRequestsForAll(db)
}
