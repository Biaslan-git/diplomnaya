import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { SupplierRow } from '@shared/types'
import { useLoad } from '../lib/useLoad'
import { navigate } from '../lib/router'
import { Badge, Button, DataTable, ErrorBox, PageHeader, RatingPill, Select, Spinner } from '../components/ui'
import { SupplierFormModal } from '../components/SupplierModals'
import { fmtPct } from '../lib/format'

export default function SuppliersPage() {
  const { data, loading, error, reload } = useLoad(() => window.api.suppliers.list())
  const [show, setShow] = useState<'active' | 'all' | 'inactive'>('active')
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => (data ?? []).filter((s) => show === 'all' || (show === 'active') === s.isActive), [data, show])

  const columns = useMemo<ColumnDef<SupplierRow, any>[]>(
    () => [
      {
        id: 'name', header: 'Поставщик', accessorFn: (s) => s.name,
        cell: ({ row: { original: s } }) => (
          <div>
            <div className="font-medium text-ink-900">{s.name}</div>
            <div className="text-[12.5px] text-ink-500">ИНН {s.inn || '—'}</div>
          </div>
        )
      },
      {
        id: 'contact', header: 'Контакты', accessorFn: (s) => s.contactPerson,
        cell: ({ row: { original: s } }) => (
          <div className="text-[13px]">
            <div className="text-ink-800">{s.contactPerson || '—'}</div>
            <div className="text-ink-500">{s.phone}</div>
          </div>
        )
      },
      { id: 'materials', header: 'Материалов', accessorFn: (s) => s.materialsCount, meta: { align: 'right' } },
      { id: 'orders', header: 'Заказов', accessorFn: (s) => s.ordersCount, meta: { align: 'right' } },
      {
        id: 'time', header: 'Вовремя', accessorFn: (s) => s.ratingTime ?? -1, meta: { align: 'right' },
        cell: ({ row: { original: s } }) => <span className="text-ink-700">{fmtPct(s.ratingTime)}</span>
      },
      {
        id: 'rating', header: 'Рейтинг', accessorFn: (s) => s.rating ?? -1,
        cell: ({ row: { original: s } }) => <RatingPill rating={s.rating} />
      },
      {
        id: 'active', header: 'Статус', accessorFn: (s) => (s.isActive ? 1 : 0),
        cell: ({ row: { original: s } }) => (s.isActive ? <Badge tone="green">Активен</Badge> : <Badge>Неактивен</Badge>)
      }
    ],
    []
  )

  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error ?? ''} onRetry={reload} />

  return (
    <>
      <PageHeader
        title="Поставщики"
        subtitle="Справочник поставщиков, прайсы и рейтинг"
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Добавить поставщика</Button>}
      />
      <DataTable
        data={rows}
        columns={columns}
        searchText={(s) => `${s.name} ${s.inn} ${s.contactPerson} ${s.phone} ${s.email}`}
        searchPlaceholder="Поиск по названию, ИНН, контактам"
        onRowClick={(s) => navigate(`/suppliers/${s.id}`)}
        initialSort={[{ id: 'rating', desc: true }]}
        rowClass={(s) => (s.isActive ? undefined : 'opacity-60')}
        toolbar={
          <Select className="w-44" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
            <option value="all">Все</option>
          </Select>
        }
      />
      {creating && <SupplierFormModal onClose={() => setCreating(false)} onSaved={(s) => { setCreating(false); navigate(`/suppliers/${s.id}`) }} />}
    </>
  )
}
