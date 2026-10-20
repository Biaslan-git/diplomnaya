import { useState } from 'react'
import type { MaterialRow } from '@shared/types'
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@shared/labels'
import { materialSchema, writeOffSchema, zodErrors } from '@shared/schemas'
import { Button, Field, Input, Modal, NumberInput, Select, Textarea } from './ui'
import { useRun } from '../lib/run'
import { fmtNum, todayStr } from '../lib/format'

const UNITS = ['кг', 'л', 'шт', 'рулон', 'упак', 'т']

export function MaterialFormModal({ material, onClose, onSaved }: { material?: MaterialRow; onClose: () => void; onSaved: (m: MaterialRow) => void }) {
  const [name, setName] = useState(material?.name ?? '')
  const [category, setCategory] = useState<Category | ''>(material?.category ?? '')
  const [unit, setUnit] = useState(material?.unit ?? 'кг')
  const [minStock, setMinStock] = useState<number | ''>(material?.minStock ?? '')
  const [initial, setInitial] = useState<number | ''>(0)
  const [description, setDescription] = useState(material?.description ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()

  const submit = async () => {
    const parsed = materialSchema.safeParse({
      name, category: category || undefined, unit, minStock: minStock === '' ? undefined : minStock, description,
      initialStock: material ? undefined : initial === '' ? undefined : initial
    })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    const res = await run(
      () => (material ? window.api.materials.update(material.id, parsed.data) : window.api.materials.create(parsed.data)),
      material ? 'Материал сохранён' : 'Материал добавлен'
    )
    if (res.ok) onSaved(res.value)
  }

  return (
    <Modal
      title={material ? 'Изменить материал' : 'Новый материал'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Сохранить</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Название" error={errors.name} className="col-span-2">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
        </Field>
        <Field label="Категория" error={errors.category}>
          <Select value={category} onChange={(e) => setCategory(e.target.value as Category)} invalid={!!errors.category}>
            <option value="">Выберите…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Единица измерения" error={errors.unit}>
          <Input list="units" value={unit} onChange={(e) => setUnit(e.target.value)} invalid={!!errors.unit} />
          <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="Минимальный остаток" error={errors.minStock} hint="Ниже этого значения система создаст заявку">
          <NumberInput value={minStock} onChange={setMinStock} min={0} invalid={!!errors.minStock} />
        </Field>
        {!material && (
          <Field label="Начальный остаток" error={errors.initialStock} hint="Дальше остаток меняется только движениями">
            <NumberInput value={initial} onChange={setInitial} min={0} invalid={!!errors.initialStock} />
          </Field>
        )}
        <Field label="Описание" className="col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export function WriteOffModal({ material, onClose, onDone }: { material: MaterialRow; onClose: () => void; onDone: () => void }) {
  const [quantity, setQuantity] = useState<number | ''>('')
  const [date, setDate] = useState(todayStr())
  const [comment, setComment] = useState('На производство')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()

  const submit = async () => {
    const parsed = writeOffSchema.safeParse({ materialId: material.id, quantity: quantity === '' ? undefined : quantity, date, comment })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    if (parsed.data.quantity > material.currentStock) return setErrors({ quantity: `На складе только ${fmtNum(material.currentStock)} ${material.unit}` })
    setErrors({})
    const res = await run(() => window.api.materials.writeOff(parsed.data), 'Списание оформлено')
    if (res.ok) onDone()
  }

  const rest = quantity === '' ? null : material.currentStock - quantity
  return (
    <Modal
      title="Списание материала"
      width={460}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Списать</Button>
        </>
      }
    >
      <div className="mb-4 rounded-lg bg-cream-100 px-4 py-3 text-[13.5px]">
        <div className="font-semibold text-ink-900">{material.name}</div>
        <div className="text-ink-600">На складе: {fmtNum(material.currentStock)} {material.unit} · минимум {fmtNum(material.minStock)}</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={`Количество, ${material.unit}`} error={errors.quantity} hint={rest !== null && rest >= 0 ? `Останется: ${fmtNum(rest)} ${material.unit}${rest < material.minStock ? ' — ниже минимума' : ''}` : undefined}>
          <NumberInput autoFocus value={quantity} onChange={setQuantity} min={0} invalid={!!errors.quantity} />
        </Field>
        <Field label="Дата" error={errors.date}>
          <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} invalid={!!errors.date} />
        </Field>
        <Field label="Комментарий" className="col-span-2">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
