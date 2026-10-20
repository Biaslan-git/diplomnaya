import { useState, type FormEvent } from 'react'
import { Wheat } from 'lucide-react'
import type { AuthState } from '@shared/types'
import { loginSchema, zodErrors } from '@shared/schemas'
import { Button, Field, Input } from '../components/ui'
import { useRun } from '../lib/run'

export default function LoginPage({ onLogin }: { onLogin: (s: AuthState) => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { run, busy } = useRun()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const parsed = loginSchema.safeParse({ login, password })
    if (!parsed.success) return setErrors(zodErrors(parsed.error))
    setErrors({})
    const res = await run(() => window.api.auth.login(parsed.data.login, parsed.data.password))
    if (res.ok) onLogin(res.value)
  }

  return (
    <div className="flex h-full items-center justify-center bg-ink-900 bg-[radial-gradient(ellipse_at_top_left,rgba(232,137,12,.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(204,106,7,.18),transparent_50%)] p-6">
      <form onSubmit={submit} className="anim-pop w-full max-w-[400px] rounded-2xl bg-cream-50 p-8 shadow-pop">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-ink-900 shadow-lg shadow-amber-900/20">
            <Wheat className="h-7 w-7" />
          </div>
          <div>
            <div className="font-display text-[22px] font-bold leading-tight text-ink-900">Отдел закупок</div>
            <div className="text-[13px] text-ink-500">ЗАО «Карачаевский пивзавод»</div>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Логин" error={errors.login}>
            <Input autoFocus value={login} onChange={(e) => setLogin(e.target.value)} invalid={!!errors.login} autoComplete="username" />
          </Field>
          <Field label="Пароль" error={errors.password}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} autoComplete="current-password" />
          </Field>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-6 w-full">
          Войти
        </Button>
      </form>
    </div>
  )
}
