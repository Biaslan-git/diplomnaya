import { useMemo, useState } from 'react'
import { Ban, FilePlus2, Pencil, Plus, RotateCcw } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { RequestRow } from '@shared/types'
import { REQUEST_STATUSES, REQUEST_STATUS_LABEL, type RequestStatus } from '@shared/labels'
import { useLoad } from '../lib/useLoad'
import { navigate } from '../lib/router'
import { useRun } from '../lib/run'
import { fmtDate, fmtNum, todayStr } from '../lib/format'
import { Badge, Button, DataTable, ErrorBox, PageHeader, RequestStatusBadge, Select, Spinner, useConfirm } from '../components/ui'
import { RequestFormModal } from '../components/RequestModals'
import { OrderFormModal } from '../components/OrderFormModal'

export default function RequestsPage() {
  const { data, loading, error, reload } = useLoad(() => window.api.requests.list())
  const [filter, setFilter] = useState<'open' | 'all' | RequestStatus>('open')
  const [form, setForm] = useState<{ request?: RequestRow } | null>(null)
  const [orderFor, setOrderFor] = useState<RequestRow | null>(null)
  const confirm = useConfirm()
  const { run } = useRun()

  const rows = useMemo(
    () => (data ?? []).filter((r) => (filter === 'all' ? true : filter === 'open' ? r.status === 'new' || r.status === 'in_progress' : r.status === filter)),
    [data, filter]
  )

  const columns = useMemo<ColumnDef<RequestRow, any>[]>(
    () => [
      { id: 'id', header: '№', accessorFn: (r) => r.id, cell: (c) => <span className="text-ink-500">{c.getValue()}</span> },
      {
        id: 'material', header: 'Материал', accessorFn: (r) => r.materialName,
        cell: ({ row: { original: r } }) => (
          <div>
            <button className="font-medium text-ink-900 hover:text-amber-700 hover:underline" onClick={() => navigate(`/materials/${r.materialId}`)}>{r.materialName}</button>
            {r.comment && <div className="line-clamp-1 max-w-[320px] text-[12px] text-ink-500">{r.comment}</div>}
          </div>
        )
      },
      { id: 'qty', header: 'Количество', accessorFn: (r) => r.quantity, meta: { align: 'right' }, cell: ({ row: { original: r } }) => <span className="font-medium">{fmtNum(r.quantity)} {r.unit}</span> },
      {
        id: 'desired', header: 'Желаемая дата', accessorFn: (r) => r.desiredDate,
        cell: ({ row: { original: r } }) => <span className={(r.status === 'new' || r.status === 'in_progress') && r.desiredDate < todayStr() ? 'font-semibold text-red-600' : ''}>{fmtDate(r.desiredDate)}</span>
      },
      { id: 'status', header: 'Статус', accessorFn: (r) => REQUEST_STATUS_LABEL[r.status], cell: ({ row: { original: r } }) => <RequestStatusBadge status={r.status} /> },
      { id: 'type', header: 'Создание', accessorFn: (r) => (r.isAuto ? 1 : 0), cell: ({ row: { original: r } }) => (r.isAuto ? <Badge tone="violet">Автоматически</Badge> : <span className="text-ink-500">Вручную</span>) },
      {
        id: 'order', header: 'Заказ', accessorFn: (r) => r.orderNumber ?? '',
        cell: ({ row: { original: r } }) => r.orderId ? <button className="font-medium text-amber-800 hover:underline" onClick={() => navigate(`/orders/${r.orderId}`)}>{r.orderNumber}</button> : <span className="text-ink-400">—</span>
      },
      { id: 'created', header: 'Создана', accessorFn: (r) => r.createdAt, cell: (c) => <span className="text-ink-600">{fmtDate(c.getValue())}</span> },
      {
        id: 'actions', header: '', enableSorting: false,
        cell: ({ row: { original: r } }) => {
          const act = async (fn: () => Promise<unknown>, ok: string) => { const x = await run(fn, ok); if (x.ok) void reload() }
          return (
            <div className="flex justify-end gap-1">
              {r.status === 'new' && <Button size="sm" variant="primary" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => setOrderFor(r)}>Создать заказ</Button>}
              {r.status === 'new' && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} aria-label="Изменить" onClick={() => setForm({ request: r })} />}
              {(r.status === 'new' || (r.status === 'in_progress' && !r.orderId)) && (
                <Button size="sm" variant="dangerGhost" icon={<Ban className="h-4 w-4" />} aria-label="Отменить" onClick={async () => {
                  if (await confirm({ title: 'Отменить заявку?', message: `Заявка на «${r.materialName}» будет отменена.`, confirmLabel: 'Отменить заявку', danger: true })) void act(() => window.api.requests.setStatus(r.id, 'cancelled'), 'Заявка отменена')
                }} />
              )}
              {r.status === 'cancelled' && <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => act(() => window.api.requests.setStatus(r.id, 'new'), 'Заявка возвращена')}>Вернуть</Button>}
            </div>
          )
        }
      }
    ],
    [confirm, run, reload]
  )

  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error ?? ''} onRetry={reload} />

  return (
    <>
      <PageHeader
        title="Заявки на закупку"
        subtitle="Заявки создаются вручную или автоматически, когда остаток падает ниже минимума"
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>Новая заявка</Button>}
      />
      <DataTable
        data={rows}
        columns={columns}
        searchText={(r) => `${r.materialName} ${r.comment} ${r.orderNumber ?? ''}`}
        searchPlaceholder="Поиск по материалу, комментарию, заказу"
        initialSort={[{ id: 'created', desc: true }]}
        rowClass={(r) => (r.status === 'new' ? 'bg-amber-50/40' : undefined)}
        toolbar={
          <Select className="w-52" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="open">Открытые</option>
            <option value="all">Все</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>)}
          </Select>
        }
        emptyTitle="Заявок нет"
        emptyHint="Автозаявки появятся сами, когда остаток материала упадёт ниже минимума"
      />
      {form && <RequestFormModal request={form.request} onClose={() => setForm(null)} onSaved={() => { setForm(null); void reload() }} />}
      {orderFor && <OrderFormModal request={orderFor} onClose={() => setOrderFor(null)} onSaved={(o) => { setOrderFor(null); navigate(`/orders/${o.id}`) }} />}
    </>
  )
}
