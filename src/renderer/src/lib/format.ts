/** Даты в БД: 'YYYY-MM-DD' или 'YYYY-MM-DD HH:mm:ss'. Показываем как ДД.ММ.ГГГГ. */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  return `${fmtDate(s)} ${s.slice(11, 16)}`
}

const moneyFmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const money2Fmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtMoney(n: number | null | undefined, fixed = false): string {
  if (n === null || n === undefined) return '—'
  return (fixed ? money2Fmt : moneyFmt).format(n) + ' ₽'
}

const numFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 })
export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return numFmt.format(n)
}

export function fmtRating(r: number | null | undefined): string {
  return r === null || r === undefined ? 'Нет данных' : r.toFixed(1).replace('.', ',')
}

export function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`
}

const p2 = (n: number) => String(n).padStart(2, '0')
export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
export function todayStr(): string {
  return dateStr(new Date())
}
export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  return dateStr(new Date(y, m - 1, d + n))
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}
