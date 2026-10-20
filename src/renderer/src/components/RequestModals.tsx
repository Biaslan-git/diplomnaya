import { useEffect, useState } from 'react'
import type { MaterialRow, RequestRow } from '@shared/types'
import { requestSchema, zodErrors } from '@shared/schemas'
import { Button, Field, Input, Modal, NumberInput, Select, Textarea } from './ui'
import { useRun } from '../lib/run'
import { addDays, fmtNum, todayStr } from '../lib/format'

export function RequestFormModal({ request, materialId, onClose, onSaved }: {
  request?: RequestRow; materialId?: number; onClose: () => void; onSaved: (r: RequestRow) => void
}) {
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [mid, setMid] = useState<number | ''>(request?.materialId ?? materialId ?? '')
  const [quantity, setQuantity] = useState<number | ''>(request?.quantity ?? '')
  const [desiredDate, setDesiredDate] = useState(request?.desiredDate ?? addDays(todayStr(), 7))
  const [comment, setComment] = useState(request?.comment ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()

  useEffect(() => {
    window.api.materials.list().then(setMaterials).catch(() => {})
  }, [])

  const material = materials.find((m) => m.id === mid)

  // автозаполнение: количество, чтобы вернуть остаток к двум минимумам
  useEffect(() => {
    if (!request && material && quantity === '') {
      const need = Math.max(material.minStock * 2 - material.currentStock, material.minStock)
      if (need > 0) setQuantity(Math.ceil(need))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material?.id])

  const submit = async () => {
    const parsed = requestSchema.safeParse({ materialId: mid === '' ? undefined : mid, quantity: quantity === '' ? undefined : quantity, desiredDate, comment })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    const res = await run(
      () => (request ? window.api.requests.update(request.id, parsed.data) : window.api.requests.create(parsed.data)),
      request ? 'Заявка сохранена' : 'Заявка создана'
    )
    if (res.ok) onSaved(res.value)
  }

  return (
    <Modal
      title={request ? 'Изменить заявку' : 'Новая заявка на закупку'}
      onClose={onClose}
      width={500}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Сохранить</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Материал" error={errors.materialId} className="col-span-2" hint={material ? `На складе ${fmtNum(material.currentStock)} ${material.unit}, минимум ${fmtNum(material.minStock)}` : undefined}>
          <Select value={mid} disabled={!!request} onChange={(e) => setMid(e.target.value ? Number(e.target.value) : '')} invalid={!!errors.materialId}>
            <option value="">Выберите материал…</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label={`Количество${material ? ', ' + material.unit : ''}`} error={errors.quantity}>
          <NumberInput value={quantity} onChange={setQuantity} min={0} invalid={!!errors.quantity} />
        </Field>
        <Field label="Желаемая дата" error={errors.desiredDate}>
          <Input type="date" value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} invalid={!!errors.desiredDate} />
        </Field>
        <Field label="Комментарий" className="col-span-2">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
