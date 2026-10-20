import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, Clock, Plus, Trash2 } from 'lucide-react'
import type { OrderDetail, RequestRow, SupplierOption, SupplierPriceRow, SupplierRow } from '@shared/types'
import { orderSchema, zodErrors } from '@shared/schemas'
import { Button, Field, Input, Modal, NumberInput, RatingPill, Select, Textarea, cx } from './ui'
import { useRun } from '../lib/run'
import { addDays, fmtDate, fmtMoney, fmtNum, todayStr } from '../lib/format'

interface Line { key: number; materialId: number | ''; quantity: number | ''; price: number | '' }
let keySeq = 0
const newLine = (p?: Partial<Line>): Line => ({ key: ++keySeq, materialId: '', quantity: '', price: '', ...p })

/**
 * Создание заказа (в том числе из заявки с выбором поставщика) и правка черновика.
 * Цена, срок поставки и количество подставляются автоматически.
 */
export function OrderFormModal({ request, order, onClose, onSaved }: {
  request?: RequestRow
  order?: OrderDetail
  onClose: () => void
  onSaved: (o: OrderDetail) => void
}) {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [options, setOptions] = useState<SupplierOption[] | null>(null)
  const [prices, setPrices] = useState<SupplierPriceRow[]>([])
  const [supplierId, setSupplierId] = useState<number | ''>(order?.supplierId ?? '')
  const [lines, setLines] = useState<Line[]>(
    order ? order.items.map((i) => newLine({ materialId: i.materialId, quantity: i.quantity, price: i.price })) : request ? [newLine({ materialId: request.materialId, quantity: request.quantity })] : [newLine()]
  )
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? addDays(todayStr(), 7))
  const dateTouched = useRef(!!order)
  const [comment, setComment] = useState(order?.comment ?? (request ? request.comment : ''))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()
  const linesRef = useRef(lines)
  linesRef.current = lines

  // справочники
  useEffect(() => {
    window.api.suppliers.list().then((l) => setSuppliers(l.filter((s) => s.isActive || s.id === order?.supplierId))).catch(() => {})
    if (request) window.api.orders.supplierOptions(request.materialId).then(setOptions).catch(() => setOptions([]))
  }, [request, order?.supplierId])

  // выбор поставщика: загрузить прайс, подставить цены и срок
  const applySupplier = async (id: number, keepPrices = false) => {
    setSupplierId(id)
    const detail = await window.api.suppliers.get(id)
    setPrices(detail.prices)
    const byMat = new Map(detail.prices.map((p) => [p.materialId, p]))
    const next = linesRef.current
      .filter((l) => l.materialId === '' || byMat.has(l.materialId))
      .map((l) => (l.materialId === '' || keepPrices ? l : { ...l, price: byMat.get(l.materialId)!.price }))
    const dropped = linesRef.current.length - next.length
    setLines(next.length ? next : [newLine()])
    if (dropped > 0 && !keepPrices) setErrors({ items: `Позиции, которых нет в прайсе выбранного поставщика, убраны (${dropped})` })
    if (!dateTouched.current) {
      const lead = Math.max(0, ...next.filter((l) => l.materialId !== '').map((l) => byMat.get(l.materialId as number)?.leadTimeDays ?? 0))
      setExpectedDate(addDays(todayStr(), lead))
    }
  }

  // начальный выбор: при правке — текущий поставщик, при заявке — лучший по рейтингу
  const initialised = useRef(false)
  useEffect(() => {
    if (initialised.current) return
    if (order) {
      initialised.current = true
      void applySupplier(order.supplierId, true)
    } else if (request && options) {
      initialised.current = true
      if (options.length) void applySupplier(options[0].supplierId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options])

  const priceOf = useMemo(() => new Map(prices.map((p) => [p.materialId, p])), [prices])
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0)

  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))
  const pickMaterial = (key: number, mid: number | '') => {
    const pr = mid === '' ? undefined : priceOf.get(mid)
    patch(key, { materialId: mid, price: pr ? pr.price : '' })
    if (pr && !dateTouched.current) {
      const lead = Math.max(pr.leadTimeDays, ...lines.filter((l) => l.key !== key && l.materialId !== '').map((l) => priceOf.get(l.materialId as number)?.leadTimeDays ?? 0))
      setExpectedDate(addDays(todayStr(), lead))
    }
  }

  const submit = async () => {
    const parsed = orderSchema.safeParse({
      supplierId: supplierId === '' ? undefined : supplierId,
      requestId: request?.id ?? null,
      expectedDate,
      comment,
      items: lines.map((l) => ({
        materialId: l.materialId === '' ? undefined : l.materialId,
        quantity: l.quantity === '' ? undefined : l.quantity,
        price: l.price === '' ? undefined : l.price
      }))
    })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    const res = await run(
      () => (order ? window.api.orders.update(order.id, parsed.data) : window.api.orders.create(parsed.data)),
      order ? 'Заказ сохранён' : 'Заказ создан (черновик)'
    )
    if (res.ok) onSaved(res.value)
  }

  const usedIds = new Set(lines.map((l) => l.materialId))
  const title = order ? `Изменить заказ ${order.number}` : request ? 'Создать заказ из заявки' : 'Новый заказ'

  return (
    <Modal
      title={title}
      width={780}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[13px] text-ink-600">Итого: <b className="font-display text-[18px] text-ink-900">{fmtMoney(total, true)}</b></span>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{order ? 'Сохранить' : 'Создать черновик'}</Button>
        </>
      }
    >
      {request && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-cream-100 px-4 py-3 text-[13.5px]">
          <span>
            <span className="kicker mr-2">Заявка</span>
            <b>{request.materialName}</b> — {fmtNum(request.quantity)} {request.unit}, желаемая дата {fmtDate(request.desiredDate)}
          </span>
        </div>
      )}

      {request && !order && (
        <div className="mb-5">
          <div className="mb-2 text-[12.5px] font-medium text-ink-600">Выберите поставщика (отсортированы по рейтингу)</div>
          {options === null ? (
            <div className="text-ink-500">Загрузка…</div>
          ) : options.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Нет активных поставщиков с этим материалом. Добавьте материал в прайс поставщика и вернитесь к заявке.
            </div>
          ) : (
            <div className="space-y-2">
              {options.map((o, i) => {
                const selected = o.supplierId === supplierId
                const orderQty = Number(lines[0]?.quantity) || request.quantity
                return (
                  <button
                    type="button"
                    key={o.supplierId}
                    onClick={() => void applySupplier(o.supplierId)}
                    className={cx('flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition',
                      selected ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-cream-300 bg-white hover:border-amber-300')}
                  >
                    <span className={cx('flex h-5 w-5 items-center justify-center rounded-full border', selected ? 'border-amber-500 bg-amber-500 text-white' : 'border-cream-300')}>
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[14px] font-semibold text-ink-900">{o.supplierName}{i === 0 && <span className="ml-2 text-[11px] font-medium text-amber-700">лучший рейтинг</span>}</span>
                      <span className="mt-0.5 flex items-center gap-3 text-[12.5px] text-ink-600">
                        <span>{fmtMoney(o.price, true)} / {request.unit}</span>
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{o.leadTimeDays} дн. → {fmtDate(o.expectedDate)}</span>
                      </span>
                    </span>
                    <span className="text-right">
                      <RatingPill rating={o.rating} />
                      <span className="mt-1 block text-[12.5px] text-ink-600">≈ {fmtMoney(o.price * orderQty)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {errors.supplierId && <div className="mt-1 text-[12px] text-red-600">{errors.supplierId}</div>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {!request && (
          <Field label="Поставщик" error={errors.supplierId} className="col-span-2">
            <Select value={supplierId} onChange={(e) => e.target.value && void applySupplier(Number(e.target.value))} invalid={!!errors.supplierId}>
              <option value="">Выберите поставщика…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.rating !== null ? ` — рейтинг ${s.rating.toFixed(1).replace('.', ',')}` : ''}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Ожидаемая дата поставки" error={errors.expectedDate} hint="По умолчанию: сегодня + срок доставки поставщика">
          <Input type="date" value={expectedDate} onChange={(e) => { dateTouched.current = true; setExpectedDate(e.target.value) }} invalid={!!errors.expectedDate} />
        </Field>
        <Field label="Комментарий"><Input value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-ink-600">Позиции заказа</span>
          <Button size="sm" icon={<Plus className="h-4 w-4" />} disabled={supplierId === ''} onClick={() => setLines((l) => [...l, newLine()])}>Добавить позицию</Button>
        </div>
        {errors.items && <div className="mb-2 text-[12.5px] text-red-600">{errors.items}</div>}
        {supplierId === '' && !request && <div className="rounded-lg border border-dashed border-cream-300 px-4 py-6 text-center text-[13px] text-ink-500">Сначала выберите поставщика — позиции берутся из его прайса.</div>}
        {(supplierId !== '' || request) && (
          <div className="space-y-2">
            {lines.map((l, i) => {
              const pr = l.materialId === '' ? undefined : priceOf.get(l.materialId)
              const sum = (Number(l.quantity) || 0) * (Number(l.price) || 0)
              return (
                <div key={l.key} className="grid grid-cols-[1fr_120px_130px_120px_32px] items-start gap-2">
                  <Field error={errors[`items.${i}.materialId`]}>
                    <Select value={l.materialId} onChange={(e) => pickMaterial(l.key, e.target.value ? Number(e.target.value) : '')} invalid={!!errors[`items.${i}.materialId`]}>
                      <option value="">Материал…</option>
                      {prices.filter((p) => !usedIds.has(p.materialId) || p.materialId === l.materialId).map((p) => <option key={p.materialId} value={p.materialId}>{p.materialName}</option>)}
                    </Select>
                  </Field>
                  <Field error={errors[`items.${i}.quantity`]}>
                    <div className="relative">
                      <NumberInput value={l.quantity} onChange={(v) => patch(l.key, { quantity: v })} min={0} placeholder="Кол-во" invalid={!!errors[`items.${i}.quantity`]} className="pr-10" />
                      {pr && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-400">{pr.unit}</span>}
                    </div>
                  </Field>
                  <Field error={errors[`items.${i}.price`]}>
                    <NumberInput value={l.price} onChange={(v) => patch(l.key, { price: v })} min={0} step="0.01" placeholder="Цена" invalid={!!errors[`items.${i}.price`]} />
                  </Field>
                  <div className="pt-2 text-right text-[13.5px] font-medium tabular-nums text-ink-800">{fmtMoney(sum, true)}</div>
                  <button type="button" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="mt-1.5 rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Убрать позицию">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
