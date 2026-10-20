import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, ClipboardCheck, FileClock, PackageMinus } from 'lucide-react'
import { useLoad } from '../lib/useLoad'
import { navigate } from '../lib/router'
import { fmtMoney, plural } from '../lib/format'
import { Card, EmptyState, ErrorBox, PageHeader, RatingPill, Spinner, StatCard, cx } from '../components/ui'
import { MoneyBars } from '../components/charts'

const KIND = {
  overdue: { icon: AlertTriangle, cls: 'bg-red-50 text-red-600' },
  draft: { icon: FileClock, cls: 'bg-stone-100 text-stone-600' },
  low_stock: { icon: PackageMinus, cls: 'bg-amber-50 text-amber-600' }
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useLoad(() => window.api.dashboard.get())
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error ?? ''} onRetry={reload} />

  const diff = data.spendPrevMonth > 0 ? ((data.spendThisMonth - data.spendPrevMonth) / data.spendPrevMonth) * 100 : null
  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <PageHeader title="Дашборд" subtitle={today.charAt(0).toUpperCase() + today.slice(1)} />

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Расходы за месяц"
          icon={<Banknote className="h-5 w-5" />}
          value={fmtMoney(data.spendThisMonth)}
          onClick={() => navigate('/reports')}
          hint={
            diff === null ? 'В прошлом месяце заказов не было' : (
              <span className="inline-flex items-center gap-1">
                {diff >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(Math.round(diff))}% к прошлому месяцу
              </span>
            )
          }
        />
        <StatCard label="Активные заказы" icon={<ClipboardCheck className="h-5 w-5" />} value={data.activeOrders} hint="Отправлены и ожидают поставки" onClick={() => navigate('/orders')} />
        <StatCard
          label="Просроченные заказы"
          icon={<AlertTriangle className="h-5 w-5" />}
          value={data.overdueOrders}
          tone={data.overdueOrders ? 'danger' : 'default'}
          hint={data.overdueOrders ? 'Срок поставки истёк' : 'Все поставки идут по графику'}
          onClick={() => navigate('/orders?overdue=1')}
        />
        <StatCard
          label="Ниже минимума"
          icon={<PackageMinus className="h-5 w-5" />}
          value={data.lowStock}
          tone={data.lowStock ? 'warn' : 'default'}
          hint={data.lowStock ? `${data.lowStock} ${plural(data.lowStock, 'материал', 'материала', 'материалов')} требуют пополнения` : 'Остатки в норме'}
          onClick={() => navigate('/materials?low=1')}
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <Card title="Расходы по месяцам" className="col-span-2" actions={<span className="text-[12px] text-ink-500">последние 12 месяцев</span>}>
          <MoneyBars data={data.monthly} />
        </Card>
        <Card title="Топ-5 поставщиков по рейтингу" pad={false}>
          {data.topSuppliers.length === 0 ? (
            <EmptyState title="Пока нет оценок" hint="Рейтинг появится после первой приёмки" />
          ) : (
            <ol className="divide-y divide-cream-200">
              {data.topSuppliers.map((s, i) => (
                <li key={s.id}>
                  <button onClick={() => navigate(`/suppliers/${s.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-amber-50/60">
                    <span className={cx('flex h-7 w-7 items-center justify-center rounded-full font-display text-[14px] font-bold', i === 0 ? 'bg-amber-400 text-ink-900' : 'bg-cream-200 text-ink-600')}>{i + 1}</span>
                    <span className="flex-1 text-[13.5px] font-medium text-ink-900">{s.name}</span>
                    <RatingPill rating={s.rating} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="Требует внимания" className="mt-5" pad={false} actions={<span className="text-[12px] text-ink-500">{data.attention.length}</span>}>
        {data.attention.length === 0 ? (
          <EmptyState title="Всё в порядке" hint="Просрочек, черновиков и низких остатков нет" />
        ) : (
          <ul className="max-h-[360px] divide-y divide-cream-200 overflow-y-auto">
            {data.attention.map((a, i) => {
              const k = KIND[a.kind]
              const Icon = k.icon
              return (
                <li key={i}>
                  <button onClick={() => navigate(a.link)} className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-amber-50/60">
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', k.cls)}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[14px] font-medium text-ink-900">{a.title}</span>
                      <span className="block text-[12.5px] text-ink-500">{a.subtitle}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
