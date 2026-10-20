import { useMemo, useState } from 'react'
import { AlertTriangle, MinusCircle, Plus } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { MaterialRow } from '@shared/types'
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@shared/labels'
import { useLoad } from '../lib/useLoad'
import { navigate, useRoute } from '../lib/router'
import { fmtNum } from '../lib/format'
import { Badge, Button, DataTable, ErrorBox, PageHeader, Select, Spinner, StockBar } from '../components/ui'
import { MaterialFormModal, WriteOffModal } from '../components/MaterialModals'

export default function MaterialsPage() {
  const { query } = useRoute()
  const { data, loading, error, reload } = useLoad(() => window.api.materials.list())
  const [category, setCategory] = useState<Category | ''>('')
  const [onlyLow, setOnlyLow] = useState(query.get('low') === '1')
  const [creating, setCreating] = useState(false)
  const [writeOff, setWriteOff] = useState<MaterialRow | null>(null)

  const rows = useMemo(() => (data ?? []).filter((m) => (!category || m.category === category) && (!onlyLow || m.isLow)), [data, category, onlyLow])

  const columns = useMemo<ColumnDef<MaterialRow, any>[]>(
    () => [
      {
        id: 'name', header: 'Материал', accessorFn: (m) => m.name,
        cell: ({ row: { original: m } }) => (
          <span className="flex items-center gap-2 font-medium text-ink-900">
            {m.isLow && <AlertTriangle className="h-4 w-4 text-red-500" />}
            {m.name}
          </span>
        )
      },
      { id: 'category', header: 'Категория', accessorFn: (m) => CATEGORY_LABEL[m.category], cell: (c) => <span className="text-ink-600">{c.getValue()}</span> },
      {
        id: 'stock', header: 'Остаток', accessorFn: (m) => m.currentStock, meta: { align: 'right' },
        cell: ({ row: { original: m } }) => (
          <span className={m.isLow ? 'font-semibold text-red-600' : 'font-medium'}>{fmtNum(m.currentStock)} <span className="font-normal text-ink-500">{m.unit}</span></span>
        )
      },
      { id: 'min', header: 'Минимум', accessorFn: (m) => m.minStock, meta: { align: 'right' }, cell: ({ row: { original: m } }) => <span className="text-ink-500">{fmtNum(m.minStock)} {m.unit}</span> },
      { id: 'bar', header: 'Запас', enableSorting: false, cell: ({ row: { original: m } }) => <div className="w-32"><StockBar current={m.currentStock} min={m.minStock} /></div> },
      {
        id: 'state', header: 'Состояние', accessorFn: (m) => (m.isLow ? 0 : 1),
        cell: ({ row: { original: m } }) =>
          m.isLow ? <Badge tone="red">Ниже минимума</Badge> : <Badge tone="green">В норме</Badge>
      },
      {
        id: 'supply', header: 'Закупка', accessorFn: (m) => (m.hasOpenSupply ? 1 : 0),
        cell: ({ row: { original: m } }) => m.hasOpenSupply ? <Badge tone="blue">Заявка / заказ</Badge> : m.isLow ? <Badge tone="amber">Нет заявки</Badge> : <span className="text-ink-400">—</span>
      },
      {
        id: 'actions', header: '', enableSorting: false,
        cell: ({ row: { original: m } }) => (
          <Button size="sm" variant="ghost" icon={<MinusCircle className="h-4 w-4" />} disabled={m.currentStock <= 0} onClick={(e) => { e.stopPropagation(); setWriteOff(m) }}>
            Списать
          </Button>
        )
      }
    ],
    []
  )

  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error ?? ''} onRetry={reload} />

  return (
    <>
      <PageHeader
        title="Материалы"
        subtitle="Номенклатура и склад. Остаток меняется только приёмкой и списанием."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Добавить материал</Button>}
      />
      <DataTable
        data={rows}
        columns={columns}
        searchText={(m) => `${m.name} ${CATEGORY_LABEL[m.category]} ${m.description}`}
        searchPlaceholder="Поиск по названию или категории"
        onRowClick={(m) => navigate(`/materials/${m.id}`)}
        rowClass={(m) => (m.isLow ? 'bg-red-50/40' : undefined)}
        pageSize={30}
        toolbar={
          <>
            <Select className="w-52" value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
              <option value="">Все категории</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-cream-300 bg-white px-3 py-2 text-[13.5px] text-ink-700">
              <input type="checkbox" className="accent-amber-500" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
              Только ниже минимума
            </label>
          </>
        }
      />
      {creating && <MaterialFormModal onClose={() => setCreating(false)} onSaved={(m) => { setCreating(false); navigate(`/materials/${m.id}`) }} />}
      {writeOff && <WriteOffModal material={writeOff} onClose={() => setWriteOff(null)} onDone={() => { setWriteOff(null); void reload() }} />}
    </>
  )
}
