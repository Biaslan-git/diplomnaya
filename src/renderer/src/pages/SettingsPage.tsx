import { useEffect, useState } from 'react'
import { DatabaseBackup, DatabaseZap, KeyRound, RotateCcw, Scale } from 'lucide-react'
import { changePasswordSchema, weightsSchema, zodErrors } from '@shared/schemas'
import { useLoad } from '../lib/useLoad'
import { useRun } from '../lib/run'
import { useToast } from '../lib/toast'
import { Button, Card, Field, Input, NumberInput, PageHeader, Spinner, useConfirm } from '../components/ui'

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Настройки" subtitle="Учётная запись, расчёт рейтинга, резервные копии" />
      <div className="grid grid-cols-2 items-start gap-4">
        <PasswordCard />
        <WeightsCard />
        <BackupCard />
        <DemoCard />
      </div>
    </>
  )
}

function PasswordCard() {
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [repeat, setRepeat] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()

  const submit = async () => {
    const parsed = changePasswordSchema.safeParse({ oldPassword, newPassword, repeat })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    const r = await run(() => window.api.auth.changePassword(oldPassword, newPassword), 'Пароль изменён')
    if (r.ok) { setOld(''); setNew(''); setRepeat('') }
  }
  return (
    <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber-500" />Смена пароля</span>}>
      <div className="space-y-3">
        <Field label="Текущий пароль" error={errors.oldPassword}><Input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} invalid={!!errors.oldPassword} autoComplete="current-password" /></Field>
        <Field label="Новый пароль" error={errors.newPassword}><Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} invalid={!!errors.newPassword} autoComplete="new-password" /></Field>
        <Field label="Повторите новый пароль" error={errors.repeat}><Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} invalid={!!errors.repeat} autoComplete="new-password" /></Field>
        <Button variant="primary" loading={busy} onClick={submit}>Сменить пароль</Button>
      </div>
    </Card>
  )
}

function WeightsCard() {
  const { data, loading } = useLoad(() => window.api.settings.getWeights(), [])
  const [w, setW] = useState<{ price: number | ''; time: number | ''; quality: number | '' }>({ price: '', time: '', quality: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()

  useEffect(() => { if (data) setW(data) }, [data])
  const sum = (Number(w.price) || 0) + (Number(w.time) || 0) + (Number(w.quality) || 0)
  const ok = Math.abs(sum - 1) < 0.0005

  const submit = async () => {
    const parsed = weightsSchema.safeParse({ price: w.price === '' ? undefined : w.price, time: w.time === '' ? undefined : w.time, quality: w.quality === '' ? undefined : w.quality })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    await run(() => window.api.settings.setWeights(parsed.data), 'Веса сохранены, рейтинги пересчитаны')
  }
  const reset = () => setW({ price: 0.4, time: 0.3, quality: 0.3 })

  return (
    <Card title={<span className="flex items-center gap-2"><Scale className="h-4 w-4 text-amber-500" />Веса критериев рейтинга</span>}>
      {loading ? <Spinner /> : (
        <>
          <p className="mb-4 text-[13px] leading-relaxed text-ink-600">Рейтинг = (w₁·Цена + w₂·Сроки + w₃·Качество) × 10. Сумма весов должна быть равна 1. После сохранения рейтинги всех поставщиков пересчитываются.</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="w₁ · Цена" error={errors.price}><NumberInput value={w.price} step="0.05" min={0} max={1} onChange={(v) => setW((s) => ({ ...s, price: v }))} invalid={!!errors.price} /></Field>
            <Field label="w₂ · Сроки" error={errors.time}><NumberInput value={w.time} step="0.05" min={0} max={1} onChange={(v) => setW((s) => ({ ...s, time: v }))} invalid={!!errors.time} /></Field>
            <Field label="w₃ · Качество" error={errors.quality}><NumberInput value={w.quality} step="0.05" min={0} max={1} onChange={(v) => setW((s) => ({ ...s, quality: v }))} invalid={!!errors.quality} /></Field>
          </div>
          <div className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
            Сумма весов: <b>{sum.toFixed(2).replace('.', ',')}</b> {ok ? '— всё верно' : '— должна быть равна 1'}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" loading={busy} disabled={!ok} onClick={submit}>Сохранить</Button>
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>По умолчанию (0,4 / 0,3 / 0,3)</Button>
          </div>
        </>
      )}
    </Card>
  )
}

function BackupCard() {
  const { run, busy } = useRun()
  const toast = useToast()
  return (
    <Card title={<span className="flex items-center gap-2"><DatabaseBackup className="h-4 w-4 text-amber-500" />Резервная копия</span>}>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-600">Копия содержит всю базу: справочники, заказы, склад и журнал. Файл можно хранить на флешке или в сетевой папке. При восстановлении программа перезапустится.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} onClick={async () => {
          const r = await run(() => window.api.settings.backup())
          if (r.ok && r.value.saved) toast.success(`Копия сохранена: ${r.value.path}`)
        }}>Сохранить копию…</Button>
        <Button loading={busy} onClick={async () => { await run(() => window.api.settings.restore()) }}>Восстановить из копии…</Button>
      </div>
    </Card>
  )
}

function DemoCard() {
  const confirm = useConfirm()
  const { run, busy } = useRun()
  return (
    <Card title={<span className="flex items-center gap-2"><DatabaseZap className="h-4 w-4 text-amber-500" />Демонстрационные данные</span>}>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-600">Заменяет все текущие данные тестовой историей закупок за последние месяцы (6 поставщиков, 13 материалов, около 60 заказов). Учётная запись и пароль сохраняются.</p>
      <Button variant="danger" loading={busy} onClick={async () => {
        if (!(await confirm({ title: 'Заменить все данные демонстрационными?', message: 'Все текущие материалы, поставщики, заказы и журнал будут удалены. Сначала сделайте резервную копию, если данные важны.', confirmLabel: 'Заменить данные', danger: true }))) return
        const r = await run(() => window.api.settings.resetDemo(), 'Демонстрационные данные загружены')
        if (r.ok) window.location.hash = '/dashboard'
      }}>Загрузить демо-данные</Button>
    </Card>
  )
}
