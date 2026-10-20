import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes
} from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, Loader2, Search, Star, X } from 'lucide-react'
import { ORDER_STATUS_LABEL, REQUEST_STATUS_LABEL, type OrderStatus, type RequestStatus } from '@shared/labels'
import { fmtRating } from '../lib/format'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

// ---------- кнопки ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700 focus-visible:ring-amber-300 disabled:bg-amber-200',
  secondary: 'border border-cream-300 bg-white text-ink-800 hover:bg-cream-100 focus-visible:ring-amber-200 disabled:text-ink-400',
  ghost: 'text-ink-700 hover:bg-cream-200 focus-visible:ring-amber-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-200 disabled:bg-red-300',
  dangerGhost: 'text-red-700 hover:bg-red-50 focus-visible:ring-red-200'
}

export function Button({
  variant = 'secondary', size = 'md', icon, loading, children, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; loading?: boolean }) {
  const sz = size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : size === 'lg' ? 'px-5 py-2.5 text-[15px]' : 'px-3.5 py-2 text-[14px]'
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium outline-none transition focus-visible:ring-2 disabled:cursor-not-allowed',
        sz, VARIANT[variant], className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

// ---------- поля форм ----------
export function Field({ label, error, hint, children, className }: { label?: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-[12.5px] font-medium text-ink-600">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-[12px] text-red-600">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-ink-500">{hint}</span> : null}
    </label>
  )
}

export function Input({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} className={cx('input', invalid && 'input-error', className)} />
}

export function Select({ invalid, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select {...rest} className={cx('input pr-8', invalid && 'input-error', className)}>
      {children}
    </select>
  )
}

export function Textarea({ invalid, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} className={cx('input min-h-[72px] resize-y', invalid && 'input-error', className)} />
}

/** Числовое поле: хранит текст, наружу отдаёт число (или NaN при пустом значении). */
export function NumberInput({ value, onChange, ...rest }: { value: number | ''; onChange: (v: number | '') => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { invalid?: boolean }) {
  return (
    <Input
      {...rest}
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    />
  )
}

// ---------- модальное окно ----------
export function Modal({
  title, onClose, children, footer, width = 560
}: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/45 p-6 backdrop-blur-[2px]">
      <div className="anim-pop my-auto w-full rounded-2xl bg-white shadow-pop" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4">
          <h2 className="font-display text-[19px] font-bold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-500 hover:bg-cream-100 hover:text-ink-900" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-cream-200 bg-cream-50 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

// ---------- подтверждение ----------
interface ConfirmOpts { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title}
          width={440}
          onClose={() => close(false)}
          footer={
            <>
              <Button onClick={() => close(false)}>Отмена</Button>
              <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {state.confirmLabel ?? 'Подтвердить'}
              </Button>
            </>
          }
        >
          <div className="text-[14px] leading-relaxed text-ink-700">{state.message}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  )
}

// ---------- бейджи ----------
const TONES = {
  gray: 'bg-stone-100 text-stone-700 ring-stone-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200'
}
export type Tone = keyof typeof TONES

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full font-sans px-2.5 py-0.5 text-[12px] font-medium ring-1 ring-inset', TONES[tone], className)}>
      {children}
    </span>
  )
}

export const ORDER_TONE: Record<OrderStatus, Tone> = { draft: 'gray', sent: 'blue', partial: 'violet', received: 'green', cancelled: 'gray' }
export function OrderStatusBadge({ status, overdue }: { status: OrderStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={ORDER_TONE[status]} className={status === 'cancelled' ? 'line-through decoration-stone-400' : ''}>{ORDER_STATUS_LABEL[status]}</Badge>
      {overdue && <Badge tone="red">Просрочен</Badge>}
    </span>
  )
}

const REQ_TONE: Record<RequestStatus, Tone> = { new: 'amber', in_progress: 'blue', done: 'green', cancelled: 'gray' }
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={REQ_TONE[status]}>{REQUEST_STATUS_LABEL[status]}</Badge>
}

// ---------- рейтинг ----------
export function ratingTone(r: number | null): string {
  if (r === null) return 'text-ink-400 bg-stone-100'
  if (r >= 8.5) return 'text-emerald-800 bg-emerald-50'
  if (r >= 7) return 'text-amber-800 bg-amber-50'
  return 'text-red-700 bg-red-50'
}

export function RatingPill({ rating }: { rating: number | null }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12.5px] font-semibold tabular-nums', ratingTone(rating))}>
      {rating !== null && <Star className="h-3 w-3 fill-current" />}
      {fmtRating(rating)}
    </span>
  )
}

export function CriteriaBar({ label, value, weight }: { label: string; value: number | null; weight?: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
        <span className="text-ink-600">
          {label}
          {weight !== undefined && <span className="ml-1 text-ink-400">· вес {weight.toString().replace('.', ',')}</span>}
        </span>
        <span className="font-semibold tabular-nums text-ink-800">{value === null ? '—' : value.toFixed(2).replace('.', ',')}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-cream-200">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-all" style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
    </div>
  )
}

export function StarsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`Оценка ${n}`} className="rounded p-0.5 transition hover:scale-110">
          <Star className={cx('h-7 w-7', n <= value ? 'fill-amber-400 text-amber-500' : 'text-cream-300')} />
        </button>
      ))}
      <span className="ml-2 text-[13px] text-ink-600">{value ? ['', 'Плохо', 'Ниже нормы', 'Нормально', 'Хорошо', 'Отлично'][value] : 'не выбрано'}</span>
    </div>
  )
}

// ---------- прочее ----------
export function Spinner({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-500">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
      <div className="font-semibold">Не удалось загрузить данные</div>
      <div className="mt-1 text-[13px]">{message}</div>
      {onRetry && <Button className="mt-3" onClick={onRetry}>Повторить</Button>}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cream-200 text-ink-500">
        <Inbox className="h-6 w-6" />
      </div>
      <div className="font-semibold text-ink-800">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-[13px] text-ink-500">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5">
      {back && <div className="mb-2">{back}</div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink-900">{title}</h1>
          {subtitle && <div className="mt-0.5 text-[13.5px] text-ink-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-cream-200 px-5 py-3">
          <h3 className="text-[14px] font-semibold text-ink-900">{title}</h3>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13.5px]">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-medium text-ink-900">{children}</span>
    </div>
  )
}

export function StatCard({ label, value, hint, tone = 'default', icon, onClick }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'danger' | 'warn'; icon?: ReactNode; onClick?: () => void
}) {
  const ring = tone === 'danger' ? 'border-red-200 bg-red-50/60' : tone === 'warn' ? 'border-amber-200 bg-amber-50/70' : 'border-cream-300/80 bg-white'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cx('rounded-xl border p-5 text-left shadow-card', ring, onClick && 'transition hover:-translate-y-0.5 hover:shadow-md')}>
      <div className="flex items-start justify-between">
        <span className="kicker">{label}</span>
        {icon && <span className={tone === 'danger' ? 'text-red-500' : 'text-amber-500'}>{icon}</span>}
      </div>
      <div className={cx('mt-2 font-display text-[30px] font-bold leading-none tabular-nums', tone === 'danger' ? 'text-red-700' : 'text-ink-900')}>{value}</div>
      {hint && <div className="mt-2 text-[12.5px] text-ink-500">{hint}</div>}
    </Tag>
  )
}

export function StockBar({ current, min }: { current: number; min: number }) {
  const low = current < min
  const pct = min > 0 ? Math.min(100, (current / (min * 2.5)) * 100) : 100
  const minPct = min > 0 ? Math.min(100, (min / (min * 2.5)) * 100) : 0
  return (
    <div className="relative h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-cream-200">
      <div className={cx('h-full rounded-full', low ? 'bg-red-500' : 'bg-amber-400')} style={{ width: `${pct}%` }} />
      <div className="absolute top-0 h-full w-px bg-ink-700/60" style={{ left: `${minPct}%` }} title="Минимальный остаток" />
    </div>
  )
}

// ---------- таблица ----------
export function DataTable<T>({
  data, columns, searchText, searchPlaceholder = 'Поиск…', toolbar, onRowClick, rowClass, pageSize = 25, initialSort, emptyTitle = 'Ничего не найдено', emptyHint, emptyAction
}: {
  data: T[]
  columns: ColumnDef<T, any>[]
  searchText?: (row: T) => string
  searchPlaceholder?: string
  toolbar?: ReactNode
  onRowClick?: (row: T) => void
  rowClass?: (row: T) => string | undefined
  pageSize?: number
  initialSort?: SortingState
  emptyTitle?: string
  emptyHint?: string
  emptyAction?: ReactNode
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? [])
  const [filter, setFilter] = useState('')
  const globalFilterFn = useMemo(
    () => (row: { original: T }, _id: string, value: string) => (searchText ? searchText(row.original) : '').toLowerCase().includes(String(value).toLowerCase().trim()),
    [searchText]
  )
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    globalFilterFn: globalFilterFn as never,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } }
  })
  const topRef = useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const total = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize: ps } = table.getState().pagination

  useEffect(() => {
    table.setPageIndex(0)
  }, [filter, data.length, table])

  return (
    <div ref={topRef}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {searchText && (
          <div className="relative w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder={searchPlaceholder} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        )}
        {toolbar}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead className="border-b border-cream-200 bg-cream-50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sortable = h.column.getCanSort()
                    const dir = h.column.getIsSorted()
                    const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align
                    return (
                      <th key={h.id} className={cx('th select-none', align === 'right' && 'text-right', sortable && 'cursor-pointer hover:text-ink-900')} onClick={sortable ? h.column.getToggleSortingHandler() : undefined}>
                        <span className={cx('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sortable && (dir === 'asc' ? <ArrowUp className="h-3 w-3 text-amber-600" /> : dir === 'desc' ? <ArrowDown className="h-3 w-3 text-amber-600" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />)}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-cream-200/80">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={onRowClick ? () => onRowClick(r.original) : undefined}
                  className={cx('transition-colors', onRowClick && 'cursor-pointer hover:bg-amber-50/60', rowClass?.(r.original))}
                >
                  {r.getVisibleCells().map((c) => {
                    const align = (c.column.columnDef.meta as { align?: string } | undefined)?.align
                    return (
                      <td key={c.id} className={cx('td', align === 'right' && 'whitespace-nowrap text-right tabular-nums')}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />}
        {total > ps && (
          <div className="flex items-center justify-between border-t border-cream-200 bg-cream-50 px-4 py-2.5 text-[13px] text-ink-600">
            <span>
              {pageIndex * ps + 1}–{Math.min(total, (pageIndex + 1) * ps)} из {total}
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} icon={<ChevronLeft className="h-4 w-4" />} aria-label="Назад" />
              <span className="px-2 tabular-nums">
                {pageIndex + 1} / {table.getPageCount()}
              </span>
              <Button size="sm" variant="ghost" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} icon={<ChevronRight className="h-4 w-4" />} aria-label="Вперёд" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Мини-хелпер для сегментированного переключателя. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-cream-300 bg-cream-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition', value === o.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-amber-700">
      <ChevronLeft className="h-4 w-4" /> {children}
    </button>
  )
}
