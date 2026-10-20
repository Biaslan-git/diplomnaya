/* Самопроверка бизнес-логики (без Electron): npm test */
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sql } from 'drizzle-orm'
import { openDb, getDb } from '../src/main/db/client'
import { seedDemo, clearAllData } from '../src/main/db/seed'
import * as auth from '../src/main/services/auth'
import * as materials from '../src/main/services/materials'
import * as suppliers from '../src/main/services/suppliers'
import * as requests from '../src/main/services/requests'
import * as orders from '../src/main/services/orders'
import * as settings from '../src/main/services/settings'
import * as reports from '../src/main/services/reports'
import * as backup from '../src/main/services/backup'
import { getDashboard } from '../src/main/services/dashboard'
import { buildReportWorkbook } from '../src/main/services/excel'
import { addDays, todayStr } from '../src/main/services/util'

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log('  ✓', name)
  } catch (e) {
    console.error('  ✗', name)
    throw e
  }
}
const throws = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: Error) => re.test(e.message))

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'zakupki-test-'))
  const db = openDb(join(dir, 'test.sqlite'), 'drizzle')
  const today = todayStr()

  console.log('Авторизация')
  await test('создаётся admin, вход по паролю, хеш вместо пароля', () => {
    auth.ensureDefaultUser(db)
    const hash = db.get<{ password_hash: string }>(sql`select password_hash from users where login = 'admin'`)!.password_hash
    assert.notEqual(hash, 'admin')
    assert.match(hash, /^\$2[aby]\$/)
    throws(() => auth.login('admin', 'wrong'), /Неверный логин или пароль/)
    assert.equal(auth.login('admin', 'admin').user?.login, 'admin')
    auth.changePassword('admin', 'secret1')
    throws(() => auth.login('admin', 'admin'), /Неверный/)
    auth.login('admin', 'secret1')
  })

  console.log('Материалы, склад, автозаявки')
  const m1 = materials.createMaterial({ name: 'Солод', category: 'raw', unit: 'кг', minStock: 100, description: '', initialStock: 150 })
  const m2 = materials.createMaterial({ name: 'Этикетка', category: 'packaging', unit: 'шт', minStock: 1000, description: '' })
  await test('начальный остаток — через движение; дубликат названия запрещён', () => {
    assert.equal(materials.getMaterial(m1.id).currentStock, 150)
    assert.equal(materials.getMaterial(m1.id).movements.length, 1)
    throws(() => materials.createMaterial({ name: 'солод', category: 'raw', unit: 'кг', minStock: 1, description: '' }), /уже существует/)
  })
  await test('материал с нулевым остатком ниже минимума получает автозаявку при создании', () => {
    const reqs = requests.listRequests().filter((r) => r.materialId === m2.id)
    assert.equal(reqs.length, 1)
    assert.equal(reqs[0].isAuto, true)
    assert.equal(reqs[0].status, 'new')
  })
  await test('списание: нельзя уйти в минус; падение ниже минимума создаёт ровно одну автозаявку', () => {
    throws(() => materials.writeOff({ materialId: m1.id, quantity: 999, date: today, comment: '' }), /Недостаточно/)
    materials.writeOff({ materialId: m1.id, quantity: 70, date: today, comment: 'На производство' })
    assert.equal(materials.getMaterial(m1.id).currentStock, 80)
    materials.writeOff({ materialId: m1.id, quantity: 5, date: today, comment: '' })
    assert.equal(requests.listRequests().filter((r) => r.materialId === m1.id).length, 1)
  })

  console.log('Поставщики и прайсы')
  const sA = suppliers.createSupplier({ name: 'Дешёвый', inn: '1234567890', contactPerson: '', phone: '', email: '', address: '', comment: '' })
  const sB = suppliers.createSupplier({ name: 'Надёжный', inn: '', contactPerson: '', phone: '', email: 'a@b.ru', address: '', comment: '' })
  suppliers.saveSupplierPrice({ supplierId: sA.id, materialId: m1.id, price: 50, leadTimeDays: 10 })
  suppliers.saveSupplierPrice({ supplierId: sB.id, materialId: m1.id, price: 100, leadTimeDays: 3 })
  await test('валидация ИНН/email, дубликат ИНН', () => {
    throws(() => suppliers.createSupplier({ name: 'X', inn: '123', contactPerson: '', phone: '', email: '', address: '', comment: '' }), /ИНН/)
    throws(() => suppliers.createSupplier({ name: 'X', inn: '', contactPerson: '', phone: '', email: 'bad', address: '', comment: '' }), /email/i)
    throws(() => suppliers.createSupplier({ name: 'X', inn: '1234567890', contactPerson: '', phone: '', email: '', address: '', comment: '' }), /ИНН/)
  })
  await test('без поставок рейтинг «нет данных»', () => {
    assert.equal(suppliers.getSupplier(sA.id).rating, null)
  })

  console.log('Заказы и приёмка')
  const req = requests.listRequests().find((r) => r.materialId === m1.id)!
  let order = orders.createOrder({
    supplierId: sA.id, requestId: req.id, expectedDate: addDays(today, -2), comment: '',
    items: [{ materialId: m1.id, quantity: 100, price: 50 }]
  })
  await test('номер З-ГГГГ-NNNN, сумма, заявка «В работе»', () => {
    assert.match(order.number, new RegExp(`^З-${today.slice(0, 4)}-0001$`))
    assert.equal(order.total, 5000)
    assert.equal(order.status, 'draft')
    assert.equal(requests.listRequests().find((r) => r.id === req.id)!.status, 'in_progress')
  })
  await test('варианты поставщиков отсортированы по рейтингу, дата = сегодня + срок', () => {
    const opts = orders.supplierOptions(m1.id)
    assert.equal(opts.length, 2)
    assert.equal(opts[0].expectedDate, addDays(today, opts[0].leadTimeDays))
  })
  await test('нельзя принять черновик; нельзя править после отправки', () => {
    throws(() => orders.receiveOrder({ orderId: order.id, receivedAt: today, qualityScore: 4, comment: '', items: [{ orderItemId: order.items[0].id, quantity: 1 }] }), /Принять можно только/)
    order = orders.changeOrderStatus(order.id, 'sent')
    assert.ok(order.sentAt)
    throws(() => orders.updateOrder(order.id, { supplierId: sA.id, expectedDate: today, comment: '', items: [{ materialId: m1.id, quantity: 1, price: 1 }] }), /только черновик/)
  })
  await test('просрочка вычисляется по ожидаемой дате', () => {
    assert.equal(orders.getOrder(order.id).isOverdue, true)
    assert.equal(orders.listOrders({ overdueOnly: true }).length, 1)
    assert.equal(getDashboard().overdueOrders, 1)
  })
  await test('частичная приёмка: остаток растёт, статус «Частично», заявка в работе', () => {
    order = orders.receiveOrder({ orderId: order.id, receivedAt: today, qualityScore: 3, comment: 'часть', items: [{ orderItemId: order.items[0].id, quantity: 60 }] })
    assert.equal(order.status, 'partial')
    assert.equal(order.items[0].received, 60)
    assert.equal(materials.getMaterial(m1.id).currentStock, 75 + 60)
    assert.equal(requests.listRequests().find((r) => r.id === req.id)!.status, 'in_progress')
  })
  await test('полная приёмка: «Получен», заявка закрыта, рейтинг пересчитан по формуле', () => {
    order = orders.receiveOrder({ orderId: order.id, receivedAt: today, qualityScore: 5, comment: '', items: [{ orderItemId: order.items[0].id, quantity: 40 }] })
    assert.equal(order.status, 'received')
    assert.equal(requests.listRequests().find((r) => r.id === req.id)!.status, 'done')
    // Ц=1 (дешевле всех), С=0 (обе приёмки позже ожидаемой даты), К=(3+5)/2/5=0.8 ; веса 0.4/0.3/0.3
    const s = suppliers.getSupplier(sA.id)
    assert.equal(s.ratingPrice, 1)
    assert.equal(s.ratingTime, 0)
    assert.equal(s.ratingQuality, 0.8)
    assert.equal(s.rating, 6.4)
    assert.equal(s.stats.onTimePct, 0)
    assert.equal(s.deliveriesCount, 2)
  })
  await test('смена весов пересчитывает рейтинг; сумма весов должна быть 1', () => {
    throws(() => settings.setWeights({ price: 0.5, time: 0.5, quality: 0.5 }), /Сумма весов/)
    settings.setWeights({ price: 0.2, time: 0.2, quality: 0.6 })
    assert.equal(suppliers.getSupplier(sA.id).rating, 6.8)
    settings.setWeights({ price: 0.4, time: 0.3, quality: 0.3 })
    assert.equal(suppliers.getSupplier(sA.id).rating, 6.4)
  })
  await test('цена конкурента влияет на критерий «Цена»', () => {
    suppliers.saveSupplierPrice({ supplierId: sB.id, materialId: m1.id, price: 25, leadTimeDays: 3 })
    assert.equal(suppliers.getSupplier(sA.id).ratingPrice, 0.5)
  })
  await test('отмена заказа возвращает заявку в «Новая»; запрет удаления связанных записей', () => {
    const r2 = requests.createRequest({ materialId: m2.id, quantity: 10, desiredDate: today, comment: '' })
    suppliers.saveSupplierPrice({ supplierId: sB.id, materialId: m2.id, price: 2, leadTimeDays: 2 })
    const o2 = orders.createOrder({ supplierId: sB.id, requestId: r2.id, expectedDate: addDays(today, 2), comment: '', items: [{ materialId: m2.id, quantity: 10, price: 2 }] })
    assert.equal(o2.number.endsWith('0002'), true)
    orders.changeOrderStatus(o2.id, 'cancelled')
    assert.equal(requests.listRequests().find((r) => r.id === r2.id)!.status, 'new')
    throws(() => orders.changeOrderStatus(o2.id, 'sent'), /Нельзя перевести/)
    throws(() => materials.removeMaterial(m1.id), /Удаление запрещено/)
    throws(() => suppliers.removeSupplier(sA.id), /Удаление запрещено/)
    suppliers.setSupplierActive(sB.id, false)
    throws(() => orders.createOrder({ supplierId: sB.id, expectedDate: today, comment: '', items: [{ materialId: m2.id, quantity: 1, price: 1 }] }), /деактивирован/)
  })
  await test('журнал действий заполняется', async () => {
    const { listAudit } = await import('../src/main/services/audit')
    const actions = listAudit({}).map((a) => a.action)
    for (const a of ['Создан заказ', 'Заказ отправлен поставщику', 'Списание материала', 'Изменены веса рейтинга', 'Изменён пароль']) assert.ok(actions.includes(a), a)
  })

  console.log('Демо-данные, отчёты, экспорт, резервная копия')
  clearAllData(db)
  seedDemo(db)
  await test('демо-данные: 40–60 заказов, просрочки, остатки ниже минимума, остатки = сумма движений', () => {
    const all = orders.listOrders()
    assert.ok(all.length >= 40 && all.length <= 65, `заказов ${all.length}`)
    assert.ok(all.some((o) => o.isOverdue))
    assert.ok(materials.listMaterials().filter((m) => m.isLow).length >= 2)
    const bad = db.all(sql`select m.id from materials m where abs(m.current_stock - coalesce((select sum(case type when 'in' then quantity else -quantity end) from stock_movements where material_id = m.id),0)) > 0.001 or m.current_stock < 0`)
    assert.equal(bad.length, 0)
    const sup = suppliers.listSuppliers()
    assert.equal(sup.length, 6)
    assert.ok(sup.every((s) => s.rating !== null && s.rating >= 0 && s.rating <= 10))
    const rs = sup.map((s) => s.rating!)
    assert.ok(Math.max(...rs) - Math.min(...rs) > 1.5)
  })
  const period = { from: addDays(today, -365), to: today }
  for (const kind of ['spending', 'rating', 'overdue', 'movements'] as const) {
    await test(`отчёт «${kind}» + Excel`, async () => {
      const rep = reports.getReport(kind, period)
      assert.equal(rep.kind, kind)
      const buf = await buildReportWorkbook(rep, period)
      assert.ok(buf.length > 2000)
    })
  }
  await test('дашборд', () => {
    const d = getDashboard()
    assert.equal(d.monthly.length, 12)
    assert.ok(d.topSuppliers.length === 5)
    assert.ok(d.attention.length > 0)
    const rep = reports.getReport('spending', period)
    assert.ok(rep.kind === 'spending' && rep.total > 0)
  })
  await test('резервная копия и проверка файла', async () => {
    const file = await backup.backupTo(dir)
    assert.ok(existsSync(file))
    backup.validateBackup(file)
    throws(() => backup.validateBackup(join(dir, 'test.sqlite-nonexistent')), /Не удалось/)
  })
  void getDb
  console.log(`\nВсе проверки пройдены: ${passed}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
