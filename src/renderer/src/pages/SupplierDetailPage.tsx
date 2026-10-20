import { useMemo, useState } from 'react'
import { Mail, MapPin, Pencil, Phone, Plus, Power, Trash2, User } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { OrderRow, SupplierPriceRow } from '@shared/types'
import { CATEGORY_LABEL, CRITERIA_LABEL } from '@shared/labels'
import { useLoad } from '../lib/useLoad'
import { navigate } from '../lib/router'
import { useRun } from '../lib/run'
import { fmtDate, fmtMoney } from '../lib/format'
import {
  Badge, BackLink, Button, Card, CriteriaBar, DataTable, EmptyState, ErrorBox, OrderStatusBadge, PageHeader, Spinner, ratingTone, useConfirm
} from '../components/ui'
import { PriceFormModal, SupplierFormModal } from '../components/SupplierModals'

export default function SupplierDetailPage({ id }: { id: number }) {
  const { data: s, loading, error, reload } = useLoad(() => window.api.suppliers.get(id), [id])
  const weights = useLoad(() => window.api.settings.getWeights(), [])
  const [edit, setEdit] = useState(false)
  const [priceModal, setPriceModal] = useState<{ price?: SupplierPriceRow } | null>(null)
  const confirm = useConfirm()
  const { run } = useRun()

  const priceCols = useMemo<ColumnDef<SupplierPriceRow, any>[]>(
    () => [
      { id: 'm', header: 'Материал', accessorFn: (p) => p.materialName, cell: ({ row: { original: p } }) => (
        <div><div className="font-medium text-ink-900">{p.materialName}</div><div className="text-[12px] text-ink-500">{CATEGORY_LABEL[p.category]}</div></div>
      ) },
      { id: 'price', header: 'Цена', accessorFn: (p) => p.price, meta: { align: 'right' }, cell: ({ row: { original: p } }) => (
        <span className="inline-flex items-center gap-2">
          {p.price <= p.minPrice && <Badge tone="green">лучшая</Badge>}
          <span className="font-medium">{fmtMoney(p.price, true)}</span><span className="text-ink-500">/ {p.unit}</span>
        </span>
      ) },
      { id: 'min', header: 'Мин. на рынке', accessorFn: (p) => p.minPrice, meta: { align: 'right' }, cell: (c) => <span className="text-ink-500">{fmtMoney(c.getValue(), true)}</span> },
      { id: 'lead', header: 'Срок, дн.', accessorFn: (p) => p.leadTimeDays, meta: { align: 'right' } },
      {
        id: 'actions', header: '', enableSorting: false,
        cell: ({ row: { original: p } }) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setPriceModal({ price: p }) }} aria-label="Изменить" />
            <Button size="sm" variant="dangerGhost" icon={<Trash2 className="h-4 w-4" />} aria-label="Убрать из прайса" onClick={async (e) => {
              e.stopPropagation()
              if (!(await confirm({ title: 'Убрать из прайса?', message: `«${p.materialName}» будет удалён из прайса поставщика.`, confirmLabel: 'Убрать', danger: true }))) return
              const r = await run(() => window.api.suppliers.removePrice(p.id), 'Позиция удалена')
              if (r.ok) void reload()
            }} />
          </div>
        )
      }
    ],
    [confirm, run, reload]
  )

  const orderCols = useMemo<ColumnDef<OrderRow, any>[]>(
    () => [
      { id: 'n', header: 'Номер', accessorFn: (o) => o.number, cell: (c) => <span className="font-medium text-amber-800">{c.getValue()}</span> },
      { id: 'created', header: 'Создан', accessorFn: (o) => o.createdAt, cell: (c) => fmtDate(c.getValue()) },
      { id: 'items', header: 'Позиции', accessorFn: (o) => o.itemsSummary, cell: (c) => <span className="line-clamp-1 max-w-[260px] text-ink-600">{c.getValue()}</span> },
      { id: 'exp', header: 'Ожидается', accessorFn: (o) => o.expectedDate, cell: (c) => fmtDate(c.getValue()) },
      { id: 'total', header: 'Сумма', accessorFn: (o) => o.total, meta: { align: 'right' }, cell: (c) => fmtMoney(c.getValue()) },
      { id: 'status', header: 'Статус', accessorFn: (o) => o.status, cell: ({ row: { original: o } }) => <OrderStatusBadge status={o.status} overdue={o.isOverdue} /> }
    ],
    []
  )

  if (loading) return <Spinner />
  if (error || !s) return <ErrorBox message={error ?? ''} onRetry={reload} />

  const w = weights.data
  const toggleActive = async () => {
    if (s.isActive && !(await confirm({ title: 'Деактивировать поставщика?', message: 'Он пропадёт из выбора при создании заказов. История и рейтинг сохранятся.', confirmLabel: 'Деактивировать', danger: true }))) return
    const r = await run(() => window.api.suppliers.setActive(s.id, !s.isActive), s.isActive ? 'Поставщик деактивирован' : 'Поставщик активирован')
    if (r.ok) void reload()
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Удалить поставщика?', message: 'Удаление возможно только если по поставщику не было заказов. Иначе используйте деактивацию.', confirmLabel: 'Удалить', danger: true }))) return
    const r = await run(() => window.api.suppliers.remove(s.id), 'Поставщик удалён')
    if (r.ok) navigate('/suppliers')
  }

  return (
    <>
      <PageHeader
        back={<BackLink onClick={() => navigate('/suppliers')}>Все поставщики</BackLink>}
        title={<span className="flex items-center gap-3">{s.name}{!s.isActive && <Badge>Неактивен</Badge>}</span>}
        subtitle={`ИНН ${s.inn || '—'}`}
        actions={
          <>
            <Button variant="dangerGhost" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Удалить</Button>
            <Button icon={<Power className="h-4 w-4" />} onClick={toggleActive}>{s.isActive ? 'Деактивировать' : 'Активировать'}</Button>
            <Button variant="primary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Изменить</Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <Card title="Рейтинг">
          <div className="flex items-center gap-4">
            <div className={`flex h-20 w-20 flex-col items-center justify-center rounded-2xl ${ratingTone(s.rating)}`}>
              <span className="font-display text-[30px] font-bold leading-none tabular-nums">{s.rating === null ? '—' : s.rating.toFixed(1).replace('.', ',')}</span>
              <span className="mt-0.5 text-[11px] opacity-70">из 10</span>
            </div>
            <div className="text-[13px] text-ink-600">
              {s.rating === null ? 'Нет данных: поставок ещё не было.' : <>Рассчитан по <b>{s.deliveriesCount}</b> поставкам.<br />Формула: (w₁·Ц + w₂·С + w₃·К) × 10</>}
            </div>
          </div>
          <div className="mt-5 space-y-3.5">
            <CriteriaBar label={`${CRITERIA_LABEL.price} (Ц)`} value={s.ratingPrice} weight={w?.price} />
            <CriteriaBar label={`${CRITERIA_LABEL.time} (С)`} value={s.ratingTime} weight={w?.time} />
            <CriteriaBar label={`${CRITERIA_LABEL.quality} (К)`} value={s.ratingQuality} weight={w?.quality} />
          </div>
        </Card>

        <Card title="Показатели">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Поставок вовремя" value={s.stats.onTimePct === null ? '—' : `${String(s.stats.onTimePct).replace('.', ',')}%`} sub={s.stats.lateCount ? `опозданий: ${s.stats.lateCount}` : undefined} />
            <Metric label="Средняя оценка качества" value={s.stats.avgQuality === null ? '—' : `${String(s.stats.avgQuality).replace('.', ',')} / 5`} />
            <Metric label="Заказов" value={String(s.ordersCount)} />
            <Metric label="Сумма заказов" value={fmtMoney(s.stats.totalSpend)} />
          </div>
        </Card>

        <Card title="Контакты">
          <ul className="space-y-2.5 text-[13.5px]">
            <Contact icon={<User />} text={s.contactPerson} />
            <Contact icon={<Phone />} text={s.phone} />
            <Contact icon={<Mail />} text={s.email} />
            <Contact icon={<MapPin />} text={s.address} />
          </ul>
          {s.comment && <p className="mt-4 rounded-lg bg-cream-100 px-3 py-2.5 text-[13px] leading-relaxed text-ink-700">{s.comment}</p>}
        </Card>
      </div>

      <Card
        title="Прайс: поставляемые материалы"
        className="mt-4"
        pad={false}
        actions={<Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPriceModal({})}>Добавить материал</Button>}
      >
        <div className="p-4">
          <DataTable data={s.prices} columns={priceCols} pageSize={10} emptyTitle="Прайс пуст" emptyHint="Добавьте материалы, которые поставляет компания" />
        </div>
      </Card>

      <Card title="История заказов" className="mt-4" pad={false}>
        <div className="p-4">
          {s.orders.length === 0 ? (
            <EmptyState title="Заказов пока нет" />
          ) : (
            <DataTable data={s.orders} columns={orderCols} pageSize={10} onRowClick={(o) => navigate(`/orders/${o.id}`)} rowClass={(o) => (o.isOverdue ? 'bg-red-50/50' : undefined)} />
          )}
        </div>
      </Card>

      {edit && <SupplierFormModal supplier={s} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); void reload() }} />}
      {priceModal && (
        <PriceFormModal
          supplierId={s.id}
          price={priceModal.price}
          taken={s.prices.map((p) => p.materialId)}
          onClose={() => setPriceModal(null)}
          onSaved={() => { setPriceModal(null); void reload() }}
        />
      )}
    </>
  )
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-cream-100 px-3.5 py-3">
      <div className="text-[11.5px] text-ink-500">{label}</div>
      <div className="mt-1 font-display text-[20px] font-bold tabular-nums text-ink-900">{value}</div>
      {sub && <div className="text-[11.5px] text-red-600">{sub}</div>}
    </div>
  )
}

function Contact({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 text-amber-500 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className={text ? 'text-ink-800' : 'text-ink-400'}>{text || 'не указано'}</span>
    </li>
  )
}

