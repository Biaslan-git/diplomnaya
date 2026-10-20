import { useCallback, useState } from 'react'
import { useToast } from './toast'

/** Выполняет действие через API: показывает ошибку тостом, при успехе — сообщение. */
export function useRun() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<{ ok: true; value: T } | { ok: false }> => {
      setBusy(true)
      try {
        const value = await fn()
        if (success) toast.success(success)
        return { ok: true, value }
      } catch (e) {
        toast.error((e as Error).message)
        return { ok: false }
      } finally {
        setBusy(false)
      }
    },
    [toast]
  )
  return { run, busy }
}
