import ExcelJS from 'exceljs'
import type { AnyReport } from '@shared/types'
import { CATEGORY_LABEL, ORDER_STATUS_LABEL } from '@shared/labels'
import type { Period } from '@shared/schemas'

const ru = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '')

const TITLES: Record<AnyReport['kind'], string> = {
  spending: 'Расходы на закупки',
  rating: 'Рейтинг поставщиков',
  overdue: 'Просроченные поставки',
  movements: 'Движение материалов'
}

export function reportFileName(kind: AnyReport['kind'], p: Period): string {
  return `${TITLES[kind]} ${ru(p.from)}-${ru(p.to)}.xlsx`.replace(/\s+/g, '_')
}

export async function buildReportWorkbook(report: AnyReport, p: Period): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ЗАО «Карачаевский пивзавод»'
  wb.created = new Date()
  const money = '#,##0.00 "₽"'

  function sheet(name: string, headers: string[], widths: number[]) {
    const ws = wb.addWorksheet(name)
    ws.addRow([TITLES[report.kind]]).font = { bold: true, size: 14 }
    ws.addRow([report.kind === 'rating' ? 'Сформирован: ' + ru(new Date().toISOString()) : `Период: ${ru(p.from)} — ${ru(p.to)}`])
    ws.addRow([])
    const h = ws.addRow(headers)
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    h.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A5A1F' } }
      c.alignment = { vertical: 'middle', wrapText: true }
    })
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
    return ws
  }

  if (report.kind === 'spending') {
    const ws = sheet('По месяцам', ['Месяц', 'Расходы, ₽'], [20, 20])
    report.byMonth.forEach((r) => ws.addRow([r.label, r.total]))
    const t = ws.addRow(['Итого', report.total])
    t.font = { bold: true }
    ws.getColumn(2).numFmt = money

    const s2 = sheet('По поставщикам', ['Поставщик', 'Заказов', 'Расходы, ₽'], [36, 12, 20])
    report.bySupplier.forEach((r) => s2.addRow([r.name, r.orders, r.total]))
    s2.getColumn(3).numFmt = money

    const s3 = sheet('По категориям', ['Категория', 'Расходы, ₽'], [28, 20])
    report.byCategory.forEach((r) => s3.addRow([CATEGORY_LABEL[r.category], r.total]))
    s3.getColumn(2).numFmt = money
  } else if (report.kind === 'rating') {
    const ws = sheet('Рейтинг', ['Поставщик', 'Рейтинг (0–10)', 'Цена (0–1)', 'Сроки (0–1)', 'Качество (0–1)', 'Поставок'], [36, 16, 14, 14, 16, 12])
    report.rows.forEach((r) => ws.addRow([r.name, r.rating ?? 'Нет данных', r.price ?? '', r.time ?? '', r.quality ?? '', r.deliveries]))
    ws.addRow([])
    ws.addRow([`Веса: цена ${report.weights.price}, сроки ${report.weights.time}, качество ${report.weights.quality}`])
  } else if (report.kind === 'overdue') {
    const ws = sheet('Просрочки', ['Заказ', 'Поставщик', 'Ожидалось', 'Получено', 'Дней просрочки', 'Статус', 'Сумма, ₽'], [16, 32, 14, 14, 16, 20, 18])
    report.rows.forEach((r) => ws.addRow([r.number, r.supplierName, ru(r.expectedDate), r.receivedAt ? ru(r.receivedAt) : 'не получен', r.daysLate, ORDER_STATUS_LABEL[r.status], r.total]))
    ws.getColumn(7).numFmt = money
  } else {
    const ws = sheet('Движение', ['Материал', 'Категория', 'Ед.', 'Остаток на начало', 'Приход', 'Расход', 'Остаток на конец'], [34, 22, 8, 18, 12, 12, 18])
    report.rows.forEach((r) => ws.addRow([r.name, CATEGORY_LABEL[r.category], r.unit, r.opening, r.incoming, r.outgoing, r.closing]))
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}
