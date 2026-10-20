import { useCallback, useEffect, useRef, useState } from 'react'

export interface Loaded<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** Загрузка данных из window.api с перезагрузкой по запросу. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): Loaded<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const id = ++seq.current
    try {
      const res = await fnRef.current()
      if (id === seq.current) {
        setData(res)
        setError(null)
      }
    } catch (e) {
      if (id === seq.current) setError((e as Error).message)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload }
}
