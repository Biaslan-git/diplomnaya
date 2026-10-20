import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, MinusCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { MovementRow } from '@shared/types'
import { CATEGORY_LABEL } from '@shared/labels'
import { useLoad } from '../lib/useLoad'
import { navigate } from '../lib/router'
import { useRun } from '../lib/run'
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from '../lib/format'
import { Badge, BackLink, Button, Card, DataTable, EmptyState, ErrorBox, KeyValue, PageHeader, RatingPill, RequestStatusBadge, Spinner, StockBar, useConfirm } from '../components/ui'
import { MaterialFormModal, WriteOffModal } from '../components/MaterialModals'
import { RequestFormModal } from '../components/RequestModals'

export default function MaterialDetailPage({ id }: { id: number }) {
  const { data: m, loading, error, reload } = useLoad(() => window.api.materials.get(id), [id])
  const [edit, setEdit] = useState(false)
  const [writeOff, setWriteOff] = useState(false)
  const [newRequest, setNewRequest] = useState(false)
  const confirm = useConfirm()
  const { run } = useRun()

  const columns = useMemo<ColumnDef<MovementRow, any>[]>(
    () => [
      { id: 'date', header: 'Дата', accessorFn: (r) => r.createdAt, cell: (c) => <span className="text-ink-700">{fmtDateTime(c.getValue())}</span> },
      {
        id: 'type', header: 'Операция', accessorFn: (r) => r.type,
        cell: ({ row: { original: r } }) =>
          r.type === 'in' ? <Badge tone="green"><ArrowDownLeft className="h-3 w-3" />Приход</Badge> : <Badge tone="red"><ArrowUpRight className="h-3 w-3" />Расход</Badge>
      },
      {
        id: 'qty', header: 'Количество', accessorFn: (r) => (r.type === 'in' ? r.quantity : -r.quantity), meta: { align: 'right' },
        cell: ({ row: { original: r } }) => (
          <span className={r.type === 'in' ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>{r.type === 'in' ? '+' : '−'}{fmtNum(r.quantity)} {m?.unit}</span>
        )
      },
      { id: 'comment', header: 'Основание', accessorFn: (r) => r.comment, cell: (c) => <span className="text-ink-600">{c.getValue() || '—'}</span> }
    ],
    [m?.unit]
  )

  if (loading) return <Spinner />
  if (error || !m) return <ErrorBox message={error ?? ''} onRetry={reload} />

  const remove = async () => {
    if (!(await confirm({ title: 'Удалить материал?', message: `«${m.name}» будет удалён. Это возможно только если с ним нет связанных записей.`, confirmLabel: 'Удалить', danger: true }))) return
    const res = await run(() => window.api.materials.remove(m.id), 'Материал удалён')
    if (res.ok) navigate('/materials')
  }

  const openRequests = m.requests.filter((r) => r.status === 'new' || r.status === 'in_progress')

  return (
    <>
      <PageHeader
        back={<BackLink onClick={() => navigate('/materials')}>Все материалы</BackLink>}
        title={m.name}
        subtitle={`${CATEGORY_LABEL[m.category]} · единица: ${m.unit}`}
        actions={
          <>
            <Button variant="dangerGhost" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Удалить</Button>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Изменить</Button>
            <Button variant="primary" icon={<MinusCircle className="h-4 w-4" />} disabled={m.currentStock <= 0} onClick={() => setWriteOff(true)}>Списать</Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-4">
          <Card title="Остаток на складе">
            <div className="flex items-baseline gap-2">
              <span className={`font-display text-[40px] font-bold leading-none tabular-nums ${m.isLow ? 'text-red-600' : 'text-ink-900'}`}>{fmtNum(m.currentStock)}</span>
              <span className="text-ink-500">{m.unit}</span>
              {m.isLow && <Badge tone="red" className="ml-auto"><AlertTriangle className="h-3 w-3" />Ниже минимума</Badge>}
            </div>
            <div className="mt-4"><StockBar current={m.currentStock} min={m.minStock} /></div>
            <div className="mt-1 text-[12px] text-ink-500">Риска — минимальный остаток</div>
            <div className="mt-3 divide-y divide-cream-200">
              <KeyValue label="Минимальный остаток">{fmtNum(m.minStock)} {m.unit}</KeyValue>
              <KeyValue label="Закупка">{m.hasOpenSupply ? <Badge tone="blue">Есть заявка / заказ</Badge> : m.isLow ? <Badge tone="amber">Нет заявки</Badge> : '—'}</KeyValue>
            </div>
            {m.description && <p className="mt-3 border-t border-cream-200 pt-3 text-[13px] leading-relaxed text-ink-600">{m.description}</p>}
          </Card>

          <Card title="Поставщики материала" pad={false}>
            {m.suppliers.length === 0 ? (
              <EmptyState title="Нет поставщиков" hint="Добавьте материал в прайс поставщика" />
            ) : (
              <ul className="divide-y divide-cream-200">
                {m.suppliers.map((s) => (
                  <li key={s.supplierId}>
                    <button onClick={() => navigate(`/suppliers/${s.supplierId}`)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-amber-50/60">
                      <span>
                        <span className="block text-[13.5px] font-medium text-ink-900">{s.supplierName}{!s.isActive && <span className="ml-1 text-ink-400">(неактивен)</span>}</span>
                        <span className="text-[12.5px] text-ink-500">{fmtMoney(s.price, true)} · {s.leadTimeDays} дн.</span>
                      </span>
                      <RatingPill rating={s.rating} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="col-span-2 space-y-4">
          <Card
            title="Заявки на закупку"
            pad={false}
            actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewRequest(true)}>Новая заявка</Button>}
          >
            {m.requests.length === 0 ? (
              <EmptyState title="Заявок нет" />
            ) : (
              <ul className="divide-y divide-cream-200">
                {m.requests.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]">
                    <RequestStatusBadge status={r.status} />
                    {r.isAuto && <Badge tone="violet">Автоматически</Badge>}
                    <span className="font-medium">{fmtNum(r.quantity)} {r.unit}</span>
                    <span className="text-ink-500">к {fmtDate(r.desiredDate)}</span>
                    <span className="flex-1" />
                    {r.orderId && <button className="font-medium text-amber-700 hover:underline" onClick={() => navigate(`/orders/${r.orderId}`)}>{r.orderNumber}</button>}
                  </li>
                ))}
              </ul>
            )}
            {openRequests.length === 0 && m.isLow && <div className="border-t border-cream-200 bg-amber-50 px-5 py-2 text-[12.5px] text-amber-800">Остаток ниже минимума, а открытой заявки нет.</div>}
          </Card>

          <Card title="История движений" pad={false}>
            <div className="p-4">
              <DataTable data={m.movements} columns={columns} pageSize={12} initialSort={[{ id: 'date', desc: true }]} emptyTitle="Движений пока не было" />
            </div>
          </Card>
        </div>
      </div>

      {edit && <MaterialFormModal material={m} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); void reload() }} />}
      {writeOff && <WriteOffModal material={m} onClose={() => setWriteOff(false)} onDone={() => { setWriteOff(false); void reload() }} />}
      {newRequest && <RequestFormModal materialId={m.id} onClose={() => setNewRequest(false)} onSaved={() => { setNewRequest(false); void reload() }} />}
    </>
  )
}
