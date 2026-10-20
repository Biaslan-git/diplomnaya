import { useEffect, useState } from 'react'
import type { OrderDetail, ReceivePreviewItem } from '@shared/types'
import { receiptSchema, zodErrors } from '@shared/schemas'
import { Button, Field, Input, Modal, NumberInput, Spinner, StarsInput, Textarea } from './ui'
import { useRun } from '../lib/run'
import { fmtDate, fmtNum, todayStr } from '../lib/format'

/** Приёмка поставки: фактическое количество по позициям, оценка качества и комментарий. */
export function ReceiveModal({ order, onClose, onDone }: { order: OrderDetail; onClose: () => void; onDone: (o: OrderDetail) => void }) {
  const [items, setItems] = useState<ReceivePreviewItem[] | null>(null)
  const [qty, setQty] = useState<Record<number, number | ''>>({})
  const [date, setDate] = useState(todayStr())
  const [quality, setQuality] = useState(0)
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()

  useEffect(() => {
    window.api.orders.receivePreview(order.id).then((list) => {
      setItems(list)
      setQty(Object.fromEntries(list.map((i) => [i.orderItemId, i.remaining])))
    })
  }, [order.id])

  const submit = async () => {
    const parsed = receiptSchema.safeParse({
      orderId: order.id, receivedAt: date, qualityScore: quality || undefined, comment,
      items: (items ?? []).map((i) => ({ orderItemId: i.orderItemId, quantity: qty[i.orderItemId] === '' ? undefined : qty[i.orderItemId] }))
    })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    const res = await run(() => window.api.orders.receive(parsed.data), 'Поставка принята, остатки обновлены')
    if (res.ok) onDone(res.value)
  }

  const late = date > order.expectedDate
  return (
    <Modal
      title={`Приёмка по заказу ${order.number}`}
      width={680}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Принять поставку</Button>
        </>
      }
    >
      {!items ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <Field label="Дата приёмки" error={errors.receivedAt} hint={late ? `Позже ожидаемой даты (${fmtDate(order.expectedDate)}) — поставка будет засчитана как опоздание` : `Ожидалась ${fmtDate(order.expectedDate)}`}>
              <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} invalid={!!errors.receivedAt} />
            </Field>
            <div className="rounded-lg bg-cream-100 px-4 py-2.5 text-[13px] text-ink-700">
              <div className="font-semibold text-ink-900">{order.supplier.name}</div>
              Если привезли не всё — укажите фактическое количество. Заказ станет «Частично получен», остаток можно принять позже.
            </div>
          </div>

          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="py-2">Материал</th>
                <th className="py-2 text-right">Заказано</th>
                <th className="py-2 text-right">Уже принято</th>
                <th className="w-40 py-2 pl-4">Принять сейчас</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {items.map((i, idx) => (
                <tr key={i.orderItemId}>
                  <td className="py-2.5 font-medium text-ink-900">{i.materialName}</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtNum(i.ordered)} {i.unit}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-500">{fmtNum(i.alreadyReceived)}</td>
                  <td className="py-2 pl-4">
                    <NumberInput value={qty[i.orderItemId] ?? ''} min={0} invalid={!!errors[`items.${idx}.quantity`]}
                      onChange={(v) => setQty((q) => ({ ...q, [i.orderItemId]: v }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {errors.items && <div className="mt-2 text-[12.5px] text-red-600">{errors.items}</div>}

          <div className="mt-5 grid gap-4">
            <Field label="Общая оценка качества поставки" error={errors.qualityScore}>
              <StarsInput value={quality} onChange={setQuality} />
            </Field>
            <Field label="Комментарий">
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: упаковка повреждена, недовоз части позиций…" />
            </Field>
          </div>
        </>
      )}
    </Modal>
  )
}
