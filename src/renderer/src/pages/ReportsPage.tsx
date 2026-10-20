import { useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { MovementsReport, OverdueReport, RatingReport, SpendingReport } from '@shared/types'
import { CATEGORY_LABEL, ORDER_STATUS_LABEL } from '@shared/labels'
import type { ReportKind } from '@shared/types'
import { useLoad } from '../lib/useLoad'
import { navigate } from '../lib/router'
import { useRun } from '../lib/run'
import { useToast } from '../lib/toast'
import { dateStr, fmtDate, fmtMoney, fmtNum, fmtPct, todayStr } from '../lib/format'
import { Button, Card, DataTable, ErrorBox, Input, PageHeader, RatingPill, Segmented, Spinner, StatCard } from '../components/ui'
import { MoneyBars } from '../components/charts'

const TABS: { value: ReportKind; label: string }[] = [
  { value: 'spending', label: 'Расходы на закупки' },
  { value: 'rating', label: 'Рейтинг поставщиков' },
  { value: 'overdue', label: 'Просроченные поставки' },
  { value: 'movements', label: 'Движение материалов' }
]

function monthsAgoStart(n: number): string {
  const d = new Date()
  return dateStr(new Date(d.getFullYear(), d.getMonth() - n, 1))
}

export default function ReportsPage() {
  const [kind, setKind] = useState<ReportKind>('spending')
  const [from, setFrom] = useState(monthsAgoStart(11))
  const [to, setTo] = useState(todayStr())
  const { run, busy } = useRun()
  const toast = useToast()

  const { data, loading, error, reload } = useLoad(() => window.api.reports.get(kind, { from, to }), [kind, from, to])

  const preset = (f: string, t = todayStr()) => { setFrom(f); setTo(t) }
  const exportExcel = async () => {
    const r = await run(() => window.api.reports.exportExcel(kind, { from, to }))
    if (r.ok && r.value.saved) toast.success('Отчёт сохранён в Excel')
  }

  return (
    <>
      <PageHeader
        title="Отчёты"
        subtitle="Любой отчёт можно выгрузить в Excel"
        actions={<Button variant="primary" icon={<FileSpreadsheet className="h-4 w-4" />} loading={busy} onClick={exportExcel}>Экспорт в Excel</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={kind} onChange={setKind} options={TABS} />
        {kind !== 'rating' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => preset(monthsAgoStart(0))}>Этот месяц</Button>
            <Button size="sm" variant="ghost" onClick={() => preset(monthsAgoStart(2))}>3 месяца</Button>
            <Button size="sm" variant="ghost" onClick={() => preset(monthsAgoStart(11))}>12 месяцев</Button>
            <Input type="date" className="w-40" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="Начало периода" />
            <span className="text-ink-400">—</span>
            <Input type="date" className="w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Конец периода" />
          </div>
        )}
      </div>

      {loading && !data ? <Spinner /> : error || !data ? <ErrorBox message={error ?? ''} onRetry={reload} /> : (
        <>
          {data.kind === 'spending' && <Spending r={data} />}
          {data.kind === 'rating' && <Rating r={data} />}
          {data.kind === 'overdue' && <Overdue r={data} />}
          {data.kind === 'movements' && <Movements r={data} />}
        </>
      )}
    </>
  )
}

function Spending({ r }: { r: SpendingReport }) {
  const supCols = useMemo<ColumnDef<SpendingReport['bySupplier'][number], any>[]>(() => [
    { id: 'name', header: 'Поставщик', accessorFn: (x) => x.name, cell: ({ row: { original: x } }) => <button className="font-medium hover:text-amber-700 hover:underline" onClick={() => navigate(`/suppliers/${x.id}`)}>{x.name}</button> },
    { id: 'orders', header: 'Заказов', accessorFn: (x) => x.orders, meta: { align: 'right' } },
    { id: 'total', header: 'Сумма', accessorFn: (x) => x.total, meta: { align: 'right' }, cell: (c) => <span className="font-medium">{fmtMoney(c.getValue())}</span> },
    { id: 'share', header: 'Доля', accessorFn: (x) => x.total, cell: ({ row: { original: x } }) => (
      <div className="flex items-center gap-2"><div className="h-2 w-24 rounded-full bg-cream-200"><div className="h-full rounded-full bg-amber-400" style={{ width: `${r.total ? (x.total / r.total) * 100 : 0}%` }} /></div><span className="w-10 text-[12px] text-ink-500">{r.total ? Math.round((x.total / r.total) * 100) : 0}%</span></div>
    ) }
  ], [r.total])
  const catCols = useMemo<ColumnDef<SpendingReport['byCategory'][number], any>[]>(() => [
    { id: 'cat', header: 'Категория', accessorFn: (x) => CATEGORY_LABEL[x.category], cell: (c) => <span className="font-medium">{c.getValue()}</span> },
    { id: 'total', header: 'Сумма', accessorFn: (x) => x.total, meta: { align: 'right' }, cell: (c) => fmtMoney(c.getValue()) },
    { id: 'share', header: 'Доля', accessorFn: (x) => x.total, meta: { align: 'right' }, cell: ({ row: { original: x } }) => `${r.total ? Math.round((x.total / r.total) * 100) : 0}%` }
  ], [r.total])
  const monthCols = useMemo<ColumnDef<SpendingReport['byMonth'][number], any>[]>(() => [
    { id: 'm', header: 'Месяц', accessorFn: (x) => x.month, cell: ({ row: { original: x } }) => x.label },
    { id: 't', header: 'Расходы', accessorFn: (x) => x.total, meta: { align: 'right' }, cell: (c) => fmtMoney(c.getValue()) }
  ], [])
  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Расходы за период" value={fmtMoney(r.total)} />
        <StatCard label="Заказов" value={r.ordersCount} hint="Отправленные, частично и полностью полученные" />
        <StatCard label="Средний заказ" value={fmtMoney(r.ordersCount ? r.total / r.ordersCount : 0)} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Card title="По месяцам" className="col-span-2"><MoneyBars data={r.byMonth} height={250} highlightLast={false} /></Card>
        <Card title="Таблица по месяцам" pad={false}><div className="p-4"><DataTable data={r.byMonth} columns={monthCols} pageSize={6} /></div></Card>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Card title="По поставщикам" className="col-span-2" pad={false}><div className="p-4"><DataTable data={r.bySupplier} columns={supCols} pageSize={8} initialSort={[{ id: 'total', desc: true }]} /></div></Card>
        <Card title="По категориям материалов" pad={false}><div className="p-4"><DataTable data={r.byCategory} columns={catCols} pageSize={8} /></div></Card>
      </div>
    </>
  )
}

function Rating({ r }: { r: RatingReport }) {
  const cols = useMemo<ColumnDef<RatingReport['rows'][number], any>[]>(() => [
    { id: 'name', header: 'Поставщик', accessorFn: (x) => x.name, cell: ({ row: { original: x } }) => <button className="font-medium hover:text-amber-700 hover:underline" onClick={() => navigate(`/suppliers/${x.id}`)}>{x.name}</button> },
    { id: 'rating', header: 'Рейтинг', accessorFn: (x) => x.rating ?? -1, cell: ({ row: { original: x } }) => <RatingPill rating={x.rating} /> },
    { id: 'price', header: `Цена (w=${r.weights.price})`, accessorFn: (x) => x.price ?? -1, meta: { align: 'right' }, cell: ({ row: { original: x } }) => fmtPct(x.price) },
    { id: 'time', header: `Сроки (w=${r.weights.time})`, accessorFn: (x) => x.time ?? -1, meta: { align: 'right' }, cell: ({ row: { original: x } }) => fmtPct(x.time) },
    { id: 'quality', header: `Качество (w=${r.weights.quality})`, accessorFn: (x) => x.quality ?? -1, meta: { align: 'right' }, cell: ({ row: { original: x } }) => fmtPct(x.quality) },
    { id: 'n', header: 'Поставок', accessorFn: (x) => x.deliveries, meta: { align: 'right' } }
  ], [r.weights])
  return (
    <>
      <p className="mb-3 text-[13px] text-ink-600">Рейтинг = (w₁·Ц + w₂·С + w₃·К) × 10. Веса меняются в «Настройках».</p>
      <DataTable data={r.rows} columns={cols} searchText={(x) => x.name} initialSort={[{ id: 'rating', desc: true }]} />
    </>
  )
}

function Overdue({ r }: { r: OverdueReport }) {
  const cols = useMemo<ColumnDef<OverdueReport['rows'][number], any>[]>(() => [
    { id: 'n', header: 'Заказ', accessorFn: (x) => x.number, cell: ({ row: { original: x } }) => <button className="font-semibold text-amber-800 hover:underline" onClick={() => navigate(`/orders/${x.orderId}`)}>{x.number}</button> },
    { id: 's', header: 'Поставщик', accessorFn: (x) => x.supplierName },
    { id: 'e', header: 'Ожидалось', accessorFn: (x) => x.expectedDate, cell: (c) => fmtDate(c.getValue()) },
    { id: 'r', header: 'Получено', accessorFn: (x) => x.receivedAt ?? '', cell: ({ row: { original: x } }) => x.receivedAt ? fmtDate(x.receivedAt) : <span className="font-medium text-red-600">не получен</span> },
    { id: 'd', header: 'Просрочка, дн.', accessorFn: (x) => x.daysLate, meta: { align: 'right' }, cell: (c) => <span className="font-semibold text-red-600">{c.getValue()}</span> },
    { id: 'st', header: 'Статус', accessorFn: (x) => ORDER_STATUS_LABEL[x.status] },
    { id: 't', header: 'Сумма', accessorFn: (x) => x.total, meta: { align: 'right' }, cell: (c) => fmtMoney(c.getValue()) }
  ], [])
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-4">
        <StatCard label="Просроченных поставок" value={r.rows.length} tone={r.rows.length ? 'danger' : 'default'} />
        <StatCard label="Средняя просрочка" value={r.rows.length ? `${Math.round(r.rows.reduce((s, x) => s + x.daysLate, 0) / r.rows.length)} дн.` : '—'} />
        <StatCard label="Ещё не получены" value={r.rows.filter((x) => !x.receivedAt).length} />
      </div>
      <DataTable data={r.rows} columns={cols} searchText={(x) => `${x.number} ${x.supplierName}`} initialSort={[{ id: 'e', desc: true }]} emptyTitle="Просрочек за период нет" />
    </>
  )
}

function Movements({ r }: { r: MovementsReport }) {
  const cols = useMemo<ColumnDef<MovementsReport['rows'][number], any>[]>(() => [
    { id: 'name', header: 'Материал', accessorFn: (x) => x.name, cell: ({ row: { original: x } }) => <button className="font-medium hover:text-amber-700 hover:underline" onClick={() => navigate(`/materials/${x.materialId}`)}>{x.name}</button> },
    { id: 'cat', header: 'Категория', accessorFn: (x) => CATEGORY_LABEL[x.category], cell: (c) => <span className="text-ink-600">{c.getValue()}</span> },
    { id: 'o', header: 'Остаток на начало', accessorFn: (x) => x.opening, meta: { align: 'right' }, cell: ({ row: { original: x } }) => `${fmtNum(x.opening)} ${x.unit}` },
    { id: 'i', header: 'Приход', accessorFn: (x) => x.incoming, meta: { align: 'right' }, cell: ({ row: { original: x } }) => <span className="text-emerald-700">+{fmtNum(x.incoming)}</span> },
    { id: 'u', header: 'Расход', accessorFn: (x) => x.outgoing, meta: { align: 'right' }, cell: ({ row: { original: x } }) => <span className="text-red-600">−{fmtNum(x.outgoing)}</span> },
    { id: 'c', header: 'Остаток на конец', accessorFn: (x) => x.closing, meta: { align: 'right' }, cell: ({ row: { original: x } }) => <span className="font-semibold">{fmtNum(x.closing)} {x.unit}</span> }
  ], [])
  return <DataTable data={r.rows} columns={cols} searchText={(x) => `${x.name} ${CATEGORY_LABEL[x.category]}`} pageSize={30} />
}
