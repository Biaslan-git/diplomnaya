import { useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, FileDown, PackageCheck, Pencil, Printer, Send } from 'lucide-react'
import { useLoad } from '../lib/useLoad'
import { navigate } from '../lib/router'
import { useRun } from '../lib/run'
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, todayStr } from '../lib/format'
import { Badge, BackLink, Button, Card, ErrorBox, KeyValue, OrderStatusBadge, PageHeader, RatingPill, Spinner, useConfirm, cx } from '../components/ui'
import { OrderFormModal } from '../components/OrderFormModal'
import { ReceiveModal } from '../components/ReceiveModal'
import { useToast } from '../lib/toast'
import { Star } from 'lucide-react'

function daysBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).getTime() }
  return Math.round((p(a) - p(b)) / 86400000)
}

export default function OrderDetailPage({ id }: { id: number }) {
  const { data: o, loading, error, reload } = useLoad(() => window.api.orders.get(id), [id])
  const [edit, setEdit] = useState(false)
  const [receive, setReceive] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()
  const { run, busy } = useRun()

  if (loading) return <Spinner />
  if (error || !o) return <ErrorBox message={error ?? ''} onRetry={reload} />

  const today = todayStr()
  const canReceive = o.status === 'sent' || o.status === 'partial'
  const canCancel = o.status === 'draft' || o.status === 'sent' || o.status === 'partial'

  const send = async () => {
    if (!(await confirm({ title: 'Отправить заказ поставщику?', message: <>Заказ <b>{o.number}</b> на сумму <b>{fmtMoney(o.total)}</b> будет отправлен «{o.supplier.name}». После отправки состав изменить нельзя.</>, confirmLabel: 'Отправить' }))) return
    const r = await run(() => window.api.orders.changeStatus(o.id, 'sent'), 'Заказ отправлен поставщику')
    if (r.ok) void reload()
  }
  const cancel = async () => {
    const partial = o.status === 'partial'
    if (!(await confirm({
      title: 'Отменить заказ?',
      message: partial ? 'Часть поставки уже принята и останется на складе. Недопоставленное будет аннулировано.' : `Заказ ${o.number} будет отменён. Связанная заявка вернётся в статус «Новая».`,
      confirmLabel: 'Отменить заказ', danger: true
    }))) return
    const r = await run(() => window.api.orders.changeStatus(o.id, 'cancelled'), 'Заказ отменён')
    if (r.ok) void reload()
  }
  const savePdf = async () => {
    const r = await run(() => window.api.orders.savePdf(o.id))
    if (r.ok && r.value.saved) toast.success('PDF сохранён')
  }

  const lastReceipt = o.receipts[o.receipts.length - 1]
  const daysLate = o.isOverdue ? daysBetween(today, o.expectedDate) : 0

  return (
    <>
      <PageHeader
        back={<BackLink onClick={() => navigate('/orders')}>Все заказы</BackLink>}
        title={<span className="flex items-center gap-3">Заказ <span className="font-sans">{o.number}</span><OrderStatusBadge status={o.status} overdue={o.isOverdue} /></span>}
        subtitle={<>Создан {fmtDateTime(o.createdAt)} · {o.supplier.name}</>}
        actions={
          <>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => run(() => window.api.orders.print(o.id))}>Печать</Button>
            <Button icon={<FileDown className="h-4 w-4" />} onClick={savePdf}>PDF</Button>
            {o.status === 'draft' && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Изменить</Button>}
            {canCancel && <Button variant="dangerGhost" icon={<Ban className="h-4 w-4" />} loading={busy} onClick={cancel}>Отменить</Button>}
            {o.status === 'draft' && <Button variant="primary" size="lg" icon={<Send className="h-4 w-4" />} loading={busy} onClick={send}>Отправить поставщику</Button>}
            {canReceive && <Button variant="primary" size="lg" icon={<PackageCheck className="h-5 w-5" />} onClick={() => setReceive(true)}>Принять</Button>}
          </>
        }
      />

      {o.isOverdue && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-[14px]">Поставка просрочена на <b>{daysLate}</b> дн. Ожидалась {fmtDate(o.expectedDate)}. Свяжитесь с поставщиком: {o.supplier.phone || 'телефон не указан'}.</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Card title="Позиции заказа" pad={false}>
            <table className="w-full text-[13.5px]">
              <thead className="border-b border-cream-200 bg-cream-50">
                <tr>
                  <th className="th">Материал</th>
                  <th className="th text-right">Количество</th>
                  <th className="th text-right">Цена</th>
                  <th className="th text-right">Сумма</th>
                  {o.status !== 'draft' && o.status !== 'cancelled' && <th className="th text-right">Принято</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {o.items.map((i) => (
                  <tr key={i.id}>
                    <td className="td font-medium text-ink-900"><button className="hover:text-amber-700 hover:underline" onClick={() => navigate(`/materials/${i.materialId}`)}>{i.materialName}</button></td>
                    <td className="td text-right tabular-nums">{fmtNum(i.quantity)} {i.unit}</td>
                    <td className="td text-right tabular-nums">{fmtMoney(i.price, true)}</td>
                    <td className="td text-right font-medium tabular-nums">{fmtMoney(i.sum, true)}</td>
                    {o.status !== 'draft' && o.status !== 'cancelled' && (
                      <td className={cx('td text-right tabular-nums', i.received >= i.quantity ? 'text-emerald-700' : 'text-violet-700')}>
                        {fmtNum(i.received)} / {fmtNum(i.quantity)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-cream-300 bg-cream-50">
                  <td className="td font-semibold" colSpan={3}>Итого</td>
                  <td className="td text-right font-display text-[18px] font-bold tabular-nums">{fmtMoney(o.total, true)}</td>
                  {o.status !== 'draft' && o.status !== 'cancelled' && <td />}
                </tr>
              </tfoot>
            </table>
          </Card>

          <Card title="Приёмки" pad={false}>
            {o.receipts.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-ink-500">
                {canReceive ? 'Поставка ещё не принималась. Нажмите «Принять», когда товар приедет.' : 'Приёмок нет.'}
              </div>
            ) : (
              <ul className="divide-y divide-cream-200">
                {o.receipts.map((r) => (
                  <li key={r.id} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span className="font-medium text-ink-900">{fmtDate(r.receivedAt)}</span>
                      {r.isLate ? <Badge tone="red">С опозданием</Badge> : <Badge tone="green">В срок</Badge>}
                      <span className="ml-auto inline-flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cx('h-4 w-4', n <= r.qualityScore ? 'fill-amber-400 text-amber-500' : 'text-cream-300')} />)}
                      </span>
                    </div>
                    <div className="ml-8 mt-1 text-[13px] text-ink-600">{r.items.map((i) => `${i.materialName}: ${fmtNum(i.quantity)} ${i.unit}`).join(' · ')}</div>
                    {r.comment && <div className="ml-8 mt-1 text-[13px] italic text-ink-500">«{r.comment}»</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Поставщик">
            <button onClick={() => navigate(`/suppliers/${o.supplier.id}`)} className="text-left font-semibold text-ink-900 hover:text-amber-700 hover:underline">{o.supplier.name}</button>
            <div className="mt-1"><RatingPill rating={o.supplier.rating} /></div>
            <div className="mt-3 space-y-0.5 text-[13px] text-ink-600">
              {o.supplier.contactPerson && <div>{o.supplier.contactPerson}</div>}
              {o.supplier.phone && <div>{o.supplier.phone}</div>}
              {o.supplier.email && <div>{o.supplier.email}</div>}
            </div>
          </Card>

          <Card title="Сроки">
            <div className="divide-y divide-cream-200">
              <KeyValue label="Создан">{fmtDate(o.createdAt)}</KeyValue>
              <KeyValue label="Отправлен">{fmtDate(o.sentAt)}</KeyValue>
              <KeyValue label="Ожидается"><span className={o.isOverdue ? 'text-red-600' : ''}>{fmtDate(o.expectedDate)}</span></KeyValue>
              {lastReceipt && <KeyValue label={o.status === 'received' ? 'Получен' : 'Последняя приёмка'}>{fmtDate(lastReceipt.receivedAt)}</KeyValue>}
            </div>
          </Card>

          {(o.request || o.comment) && (
            <Card title="Прочее">
              <div className="divide-y divide-cream-200">
                {o.request && <KeyValue label="Заявка">{o.request.isAuto ? <Badge tone="violet">Автоматически</Badge> : <span>№ {o.request.id}</span>} <button className="ml-1 text-amber-700 hover:underline" onClick={() => navigate('/requests')}>открыть</button></KeyValue>}
              </div>
              {o.comment && <p className="mt-2 text-[13px] leading-relaxed text-ink-700">{o.comment}</p>}
            </Card>
          )}
        </div>
      </div>

      {edit && <OrderFormModal order={o} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); void reload() }} />}
      {receive && <ReceiveModal order={o} onClose={() => setReceive(false)} onDone={() => { setReceive(false); void reload() }} />}
    </>
  )
}
