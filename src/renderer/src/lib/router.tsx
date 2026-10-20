import { useEffect, useState } from 'react'

function current(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/dashboard'
}

export function navigate(path: string): void {
  if (current() !== path) window.location.hash = path
}

/** Мини-роутер на hash: '/orders/12?overdue=1' → parts ['orders','12'], query {overdue:'1'} */
export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const [full, setFull] = useState(current())
  useEffect(() => {
    const on = () => setFull(current())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [path, qs = ''] = full.split('?')
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs) }
}
