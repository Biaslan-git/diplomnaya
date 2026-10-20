import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { AuditRow } from '@shared/types'
import { useLoad } from '../lib/useLoad'
import { navigate } from '../lib/router'
import { fmtDateTime } from '../lib/format'
import { Badge, DataTable, ErrorBox, Input, PageHeader, Select, Spinner, type Tone } from '../components/ui'

const ENTITY: Record<string, { label: string; tone: Tone; link?: (id: number) => string }> = {
  order: { label: 'Заказ', tone: 'amber', link: (id) => `/orders/${id}` },
  request: { label: 'Заявка', tone: 'blue', link: () => '/requests' },
  material: { label: 'Материал', tone: 'green', link: (id) => `/materials/${id}` },
  supplier: { label: 'Поставщик', tone: 'violet', link: (id) => `/suppliers/${id}` },
  settings: { label: 'Настройки', tone: 'gray' }
}

export default function AuditPage() {
  const [entity, setEntity] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { data, loading, error, reload } = useLoad(() => window.api.audit.list({ entity: entity || undefined, from: from || undefined, to: to || undefined }), [entity, from, to])

  const columns = useMemo<ColumnDef<AuditRow, any>[]>(
    () => [
      { id: 'at', header: 'Дата и время', accessorFn: (r) => r.createdAt, cell: (c) => <span className="whitespace-nowrap text-ink-700">{fmtDateTime(c.getValue())}</span> },
      { id: 'action', header: 'Действие', accessorFn: (r) => r.action, cell: (c) => <span className="font-medium text-ink-900">{c.getValue()}</span> },
      {
        id: 'object', header: 'Объект', accessorFn: (r) => r.entity,
        cell: ({ row: { original: r } }) => {
          const e = ENTITY[r.entity] ?? { label: r.entity, tone: 'gray' as Tone }
          const link = r.entityId && e.link ? e.link(r.entityId) : null
          return (
            <span className="flex items-center gap-2">
              <Badge tone={e.tone}>{e.label}</Badge>
              {link ? <button className="text-left text-ink-700 hover:text-amber-700 hover:underline" onClick={() => navigate(link)}>{r.details || `№ ${r.entityId}`}</button> : <span className="text-ink-700">{r.details}</span>}
            </span>
          )
        }
      }
    ],
    []
  )

  return (
    <>
      <PageHeader title="Журнал действий" subtitle="Ключевые операции: заказы, статусы, приёмки, списания, настройки" />
      {loading && !data ? <Spinner /> : error || !data ? <ErrorBox message={error ?? ''} onRetry={reload} /> : (
        <DataTable
          data={data}
          columns={columns}
          searchText={(r) => `${r.action} ${r.details}`}
          searchPlaceholder="Поиск по действию и объекту"
          pageSize={30}
          initialSort={[{ id: 'at', desc: true }]}
          toolbar={
            <>
              <Select className="w-44" value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="">Все объекты</option>
                {Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" />
              <span className="text-ink-400">—</span>
              <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По дату" />
            </>
          }
        />
      )}
    </>
  )
}
