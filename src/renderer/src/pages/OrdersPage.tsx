import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Kanban as KanbanIcon, Plus, Table2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { OrderFilters, OrderRow } from '@shared/types'
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from '@shared/labels'
import { useLoad } from '../lib/useLoad'
import { navigate, useRoute } from '../lib/router'
import { fmtDate, fmtMoney } from '../lib/format'
import { Badge, Button, DataTable, ErrorBox, Input, OrderStatusBadge, PageHeader, Segmented, Select, Spinner, cx } from '../components/ui'
import { OrderFormModal } from '../components/OrderFormModal'

type View = 'table' | 'kanban'

function loadView(): View {
  try {
    return localStorage.getItem('orders.view') === 'kanban' ? 'kanban' : 'table'
  } catch {
    return 'table'
  }
}

const COLUMN_TONE: Record<OrderStatus, string> = {
  draft: 'border-t-stone-400', sent: 'border-t-sky-500', partial: 'border-t-violet-500', received: 'border-t-emerald-500', cancelled: 'border-t-stone-300'
}

export default function OrdersPage() {
  const { query } = useRoute()
  const [view, setView] = useState<View>(loadView)
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(query.get('overdue') === '1')
  const [creating, setCreating] = useState(false)

  const filters: OrderFilters = { status: view === 'table' ? status : '', supplierId: supplierId || null, from: from || undefined, to: to || undefined, overdueOnly }
  const { data, loading, error, reload } = useLoad(() => window.api.orders.list(filters), [view === 'table' ? status : '', supplierId, from, to, overdueOnly, view])
  const suppliers = useLoad(() => window.api.suppliers.list(), [])

  const changeView = (v: View) => {
    setView(v)
    try { localStorage.setItem('orders.view', v) } catch { /* необязательно */ }
  }

  const columns = useMemo<ColumnDef<OrderRow, any>[]>(
    () => [
      { id: 'number', header: 'Номер', accessorFn: (o) => o.number, cell: (c) => <span className="whitespace-nowrap font-semibold text-amber-800">{c.getValue()}</span> },
      { id: 'supplier', header: 'Поставщик', accessorFn: (o) => o.supplierName, cell: (c) => <span className="font-medium text-ink-900">{c.getValue()}</span> },
      { id: 'items', header: 'Позиции', accessorFn: (o) => o.itemsSummary, cell: (c) => <span className="line-clamp-1 max-w-[280px] text-ink-600" title={c.getValue()}>{c.getValue()}</span> },
      { id: 'created', header: 'Создан', accessorFn: (o) => o.createdAt, cell: (c) => <span className="text-ink-700">{fmtDate(c.getValue())}</span> },
      {
        id: 'expected', header: 'Ожидается', accessorFn: (o) => o.expectedDate,
        cell: ({ row: { original: o } }) => <span className={o.isOverdue ? 'font-semibold text-red-600' : 'text-ink-700'}>{fmtDate(o.expectedDate)}</span>
      },
      { id: 'total', header: 'Сумма', accessorFn: (o) => o.total, meta: { align: 'right' }, cell: (c) => <span className="font-medium">{fmtMoney(c.getValue())}</span> },
      { id: 'status', header: 'Статус', accessorFn: (o) => ORDER_STATUS_LABEL[o.status], cell: ({ row: { original: o } }) => <OrderStatusBadge status={o.status} overdue={o.isOverdue} /> }
    ],
    []
  )

  return (
    <>
      <PageHeader
        title="Заказы поставщикам"
        subtitle="Черновик → Отправлен → Частично получен → Получен"
        actions={
          <>
            <Segmented
              value={view}
              onChange={changeView}
              options={[
                { value: 'table', label: <><Table2 className="h-4 w-4" />Таблица</> },
                { value: 'kanban', label: <><KanbanIcon className="h-4 w-4" />Канбан</> }
              ]}
            />
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Новый заказ</Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {view === 'table' && (
          <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">Все статусы</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
          </Select>
        )}
        <Select className="w-56" value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Все поставщики</option>
          {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="flex items-center gap-1.5 text-[13px] text-ink-500">
          <CalendarClock className="h-4 w-4" />
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Создан с" />
          —
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Создан по" />
        </div>
        <label className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13.5px]', overdueOnly ? 'border-red-300 bg-red-50 text-red-700' : 'border-cream-300 bg-white text-ink-700')}>
          <input type="checkbox" className="accent-red-600" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Только просроченные
        </label>
        {(status || supplierId || from || to || overdueOnly) && (
          <Button variant="ghost" size="sm" onClick={() => { setStatus(''); setSupplierId(''); setFrom(''); setTo(''); setOverdueOnly(false) }}>Сбросить</Button>
        )}
      </div>

      {loading && !data ? <Spinner /> : error || !data ? <ErrorBox message={error ?? ''} onRetry={reload} /> : view === 'table' ? (
        <DataTable
          data={data}
          columns={columns}
          searchText={(o) => `${o.number} ${o.supplierName} ${o.itemsSummary} ${o.comment}`}
          searchPlaceholder="Поиск по номеру, поставщику, материалу"
          onRowClick={(o) => navigate(`/orders/${o.id}`)}
          rowClass={(o) => (o.isOverdue ? 'bg-red-50/70 hover:!bg-red-100/70' : undefined)}
          initialSort={[{ id: 'created', desc: true }]}
          pageSize={25}
          emptyTitle="Заказов не найдено"
          emptyHint="Измените фильтры или создайте новый заказ"
        />
      ) : (
        <Kanban data={data} />
      )}

      {creating && <OrderFormModal onClose={() => setCreating(false)} onSaved={(o) => { setCreating(false); navigate(`/orders/${o.id}`) }} />}
    </>
  )
}

function Kanban({ data }: { data: OrderRow[] }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const rows = q ? data.filter((o) => `${o.number} ${o.supplierName} ${o.itemsSummary}`.toLowerCase().includes(q)) : data
  return (
    <>
      <Input className="mb-3 w-72" placeholder="Поиск по доске" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="grid grid-cols-5 gap-3">
        {ORDER_STATUSES.map((st) => {
          const all = rows.filter((o) => o.status === st)
          const shown = st === 'received' || st === 'cancelled' ? all.slice(0, 15) : all
          const sum = all.reduce((s, o) => s + o.total, 0)
          return (
            <div key={st} className={cx('flex min-h-[420px] flex-col rounded-xl border border-t-4 border-cream-300/80 bg-cream-50', COLUMN_TONE[st])}>
              <div className="px-3 pb-2 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink-900">{ORDER_STATUS_LABEL[st]}</span>
                  <Badge>{all.length}</Badge>
                </div>
                <div className="mt-0.5 text-[12px] text-ink-500">{fmtMoney(sum)}</div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: 640 }}>
                {shown.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => navigate(`/orders/${o.id}`)}
                    className={cx('w-full rounded-lg border bg-white p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md',
                      o.isOverdue ? 'border-red-300 bg-red-50/60' : 'border-cream-300/70')}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="whitespace-nowrap text-[13px] font-semibold text-amber-800">{o.number}</span>
                      {o.isOverdue && <Badge tone="red"><AlertTriangle className="h-3 w-3" />Просрочен</Badge>}
                    </div>
                    <div className="mt-1 text-[13px] font-medium text-ink-900">{o.supplierName}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12px] text-ink-500">{o.itemsSummary}</div>
                    <div className="mt-2 flex items-center justify-between text-[12px]">
                      <span className={cx('whitespace-nowrap', o.isOverdue ? 'font-semibold text-red-600' : 'text-ink-500')}>до {fmtDate(o.expectedDate)}</span>
                      <span className="whitespace-nowrap font-semibold text-ink-900">{fmtMoney(o.total)}</span>
                    </div>
                  </button>
                ))}
                {all.length > shown.length && <div className="py-1 text-center text-[12px] text-ink-400">и ещё {all.length - shown.length}… (см. таблицу)</div>}
                {all.length === 0 && <div className="py-8 text-center text-[12.5px] text-ink-400">Пусто</div>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
