import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'

type Kind = 'success' | 'error'
interface Toast { id: number; kind: Kind; text: string }

interface ToastApi {
  success: (text: string) => void
  error: (text: string) => void
}

const Ctx = createContext<ToastApi>({ success: () => {}, error: () => {} })
export const useToast = () => useContext(Ctx)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq
    setItems((l) => [...l, { id, kind, text }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 6500 : 3500)
  }, [])

  const api: ToastApi = { success: (t) => push('success', t), error: (t) => push('error', t) }

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[360px] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`anim-toast pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-pop ${
              t.kind === 'success' ? 'border-emerald-200' : 'border-red-200'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            )}
            <div className="flex-1 text-[13.5px] leading-snug text-ink-800">{t.text}</div>
            <button className="text-ink-400 hover:text-ink-700" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
