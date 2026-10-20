import type { OrderDetail } from '@shared/types'
import { ORDER_STATUS_LABEL } from '@shared/labels'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const date = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '—')
const money = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'
const qty = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })

/** Печатная форма заказа поставщику (для печати и PDF). */
export function orderHtml(o: OrderDetail): string {
  const rows = o.items
    .map(
      (i, n) => `<tr><td class="c">${n + 1}</td><td>${esc(i.materialName)}</td><td class="c">${esc(i.unit)}</td>
      <td class="r">${qty(i.quantity)}</td><td class="r">${money(i.price)}</td><td class="r">${money(i.sum)}</td></tr>`
    )
    .join('')
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заказ ${esc(o.number)}</title>
<style>
  @page { size: A4; margin: 18mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; color: #1d1710; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #6b5a47; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #cc6a07; padding-bottom: 10px; margin-bottom: 16px; }
  .parties { display: flex; gap: 24px; margin-bottom: 16px; }
  .parties > div { flex: 1; border: 1px solid #d8cdbb; border-radius: 6px; padding: 10px 12px; }
  .parties h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8a5a1f; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f3e9d6; text-align: left; font-weight: 600; }
  th, td { border: 1px solid #cfc3ae; padding: 6px 8px; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  .total { text-align: right; font-size: 14px; font-weight: 700; margin-bottom: 20px; }
  .sign { display: flex; gap: 40px; margin-top: 44px; }
  .sign div { flex: 1; border-top: 1px solid #1d1710; padding-top: 4px; font-size: 11px; }
</style></head><body>
<div class="head">
  <div><h1>Заказ поставщику № ${esc(o.number)}</h1><div class="muted">Статус: ${ORDER_STATUS_LABEL[o.status]}</div></div>
  <div style="text-align:right"><div>Дата создания: <b>${date(o.createdAt)}</b></div><div>Ожидаемая поставка: <b>${date(o.expectedDate)}</b></div></div>
</div>
<div class="parties">
  <div><h3>Заказчик</h3><b>ЗАО «Карачаевский пивзавод»</b><br>Отдел закупок</div>
  <div><h3>Поставщик</h3><b>${esc(o.supplier.name)}</b><br>${esc(o.supplier.contactPerson)}<br>${esc(o.supplier.phone)}${o.supplier.email ? '<br>' + esc(o.supplier.email) : ''}</div>
</div>
<table><thead><tr><th class="c" style="width:32px">№</th><th>Наименование</th><th class="c" style="width:50px">Ед.</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="total">Итого: ${money(o.total)}</div>
${o.comment ? `<div><b>Комментарий:</b> ${esc(o.comment)}</div>` : ''}
<div class="sign"><div>Сотрудник отдела закупок / подпись</div><div>Поставщик / подпись, дата</div></div>
</body></html>`
}
