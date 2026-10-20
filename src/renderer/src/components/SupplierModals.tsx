import { useEffect, useState } from 'react'
import type { MaterialRow, SupplierPriceRow, SupplierRow } from '@shared/types'
import { supplierPriceSchema, supplierSchema, zodErrors } from '@shared/schemas'
import { Button, Field, Input, Modal, NumberInput, Select, Textarea } from './ui'
import { useRun } from '../lib/run'

export function SupplierFormModal({ supplier, onClose, onSaved }: { supplier?: SupplierRow; onClose: () => void; onSaved: (s: SupplierRow) => void }) {
  const [f, setF] = useState({
    name: supplier?.name ?? '', inn: supplier?.inn ?? '', contactPerson: supplier?.contactPerson ?? '', phone: supplier?.phone ?? '',
    email: supplier?.email ?? '', address: supplier?.address ?? '', comment: supplier?.comment ?? ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    const parsed = supplierSchema.safeParse(f)
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    const res = await run(
      () => (supplier ? window.api.suppliers.update(supplier.id, parsed.data) : window.api.suppliers.create(parsed.data)),
      supplier ? 'Поставщик сохранён' : 'Поставщик добавлен'
    )
    if (res.ok) onSaved(res.value)
  }

  return (
    <Modal
      title={supplier ? 'Изменить поставщика' : 'Новый поставщик'}
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Сохранить</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Название" error={errors.name} className="col-span-2">
          <Input autoFocus value={f.name} onChange={set('name')} invalid={!!errors.name} />
        </Field>
        <Field label="ИНН" error={errors.inn}><Input value={f.inn} onChange={set('inn')} maxLength={12} inputMode="numeric" invalid={!!errors.inn} /></Field>
        <Field label="Контактное лицо"><Input value={f.contactPerson} onChange={set('contactPerson')} /></Field>
        <Field label="Телефон"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email" error={errors.email}><Input value={f.email} onChange={set('email')} invalid={!!errors.email} /></Field>
        <Field label="Адрес" className="col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
        <Field label="Комментарий" className="col-span-2"><Textarea value={f.comment} onChange={set('comment')} /></Field>
      </div>
    </Modal>
  )
}

export function PriceFormModal({ supplierId, price, taken, onClose, onSaved }: {
  supplierId: number; price?: SupplierPriceRow; taken: number[]; onClose: () => void; onSaved: () => void
}) {
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [mid, setMid] = useState<number | ''>(price?.materialId ?? '')
  const [value, setValue] = useState<number | ''>(price?.price ?? '')
  const [lead, setLead] = useState<number | ''>(price?.leadTimeDays ?? 5)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()

  useEffect(() => {
    window.api.materials.list().then(setMaterials).catch(() => {})
  }, [])

  const submit = async () => {
    const parsed = supplierPriceSchema.safeParse({
      supplierId, materialId: mid === '' ? undefined : mid, price: value === '' ? undefined : value, leadTimeDays: lead === '' ? undefined : lead
    })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    const res = await run(() => window.api.suppliers.savePrice(parsed.data), 'Прайс обновлён')
    if (res.ok) onSaved()
  }

  const available = materials.filter((m) => !taken.includes(m.id) || m.id === price?.materialId)
  return (
    <Modal
      title={price ? 'Изменить цену' : 'Материал в прайс'}
      width={480}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Сохранить</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Материал" error={errors.materialId} className="col-span-2">
          <Select value={mid} disabled={!!price} onChange={(e) => setMid(e.target.value ? Number(e.target.value) : '')} invalid={!!errors.materialId}>
            <option value="">Выберите материал…</option>
            {available.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
          </Select>
        </Field>
        <Field label="Цена за единицу, ₽" error={errors.price}>
          <NumberInput value={value} onChange={setValue} min={0} step="0.01" invalid={!!errors.price} />
        </Field>
        <Field label="Срок доставки, дней" error={errors.leadTimeDays}>
          <NumberInput value={lead} onChange={setLead} min={0} step="1" invalid={!!errors.leadTimeDays} />
        </Field>
      </div>
    </Modal>
  )
}
