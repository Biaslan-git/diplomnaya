import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3, Boxes, ClipboardList, FileText, LayoutDashboard, LogOut, ScrollText, Settings as SettingsIcon, Truck, Wheat
} from 'lucide-react'
import type { AuthState, DashboardData } from '@shared/types'
import { navigate, useRoute } from './lib/router'
import { Spinner, cx } from './components/ui'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import RequestsPage from './pages/RequestsPage'
import MaterialsPage from './pages/MaterialsPage'
import MaterialDetailPage from './pages/MaterialDetailPage'
import SuppliersPage from './pages/SuppliersPage'
import SupplierDetailPage from './pages/SupplierDetailPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import AuditPage from './pages/AuditPage'

const NAV = [
  { to: '/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { to: '/orders', label: 'Заказы', icon: ClipboardList },
  { to: '/requests', label: 'Заявки', icon: FileText },
  { to: '/materials', label: 'Материалы', icon: Boxes },
  { to: '/suppliers', label: 'Поставщики', icon: Truck },
  { to: '/reports', label: 'Отчёты', icon: BarChart3 },
  { to: '/settings', label: 'Настройки', icon: SettingsIcon },
  { to: '/audit', label: 'Журнал', icon: ScrollText }
]

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)

  useEffect(() => {
    window.api.auth.state().then(setAuth).catch(() => setAuth({ hasUser: false, user: null }))
  }, [])

  if (!auth) return <Spinner />
  if (!auth.user) return <LoginPage onLogin={setAuth} />
  return (
    <Shell
      user={auth.user.fullName}
      onLogout={async () => {
        await window.api.auth.logout()
        navigate('/dashboard')
        setAuth({ hasUser: true, user: null })
      }}
    />
  )
}

function Shell({ user, onLogout }: { user: string; onLogout: () => void }) {
  const { path, parts } = useRoute()
  const [counters, setCounters] = useState<DashboardData | null>(null)

  const refresh = useCallback(() => {
    window.api.dashboard.get().then(setCounters).catch(() => {})
  }, [])
  useEffect(refresh, [path, refresh])

  const badge = (to: string): { n: number; tone: string } | null => {
    if (!counters) return null
    if (to === '/orders' && counters.overdueOrders) return { n: counters.overdueOrders, tone: 'bg-red-500 text-white' }
    if (to === '/requests' && counters.newRequests) return { n: counters.newRequests, tone: 'bg-amber-400 text-ink-900' }
    if (to === '/materials' && counters.lowStock) return { n: counters.lowStock, tone: 'bg-amber-400 text-ink-900' }
    return null
  }

  const id = Number(parts[1])
  const detail = Number.isFinite(id) && parts[1] !== undefined
  let page
  switch (parts[0]) {
    case 'orders': page = detail ? <OrderDetailPage key={id} id={id} /> : <OrdersPage />; break
    case 'requests': page = <RequestsPage />; break
    case 'materials': page = detail ? <MaterialDetailPage key={id} id={id} /> : <MaterialsPage />; break
    case 'suppliers': page = detail ? <SupplierDetailPage key={id} id={id} /> : <SuppliersPage />; break
    case 'reports': page = <ReportsPage />; break
    case 'settings': page = <SettingsPage />; break
    case 'audit': page = <AuditPage />; break
    default: page = <DashboardPage />
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col bg-ink-900 text-cream-200">
        <div className="flex items-center gap-3 px-5 pb-6 pt-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-ink-900 shadow-lg shadow-amber-900/30">
            <Wheat className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[17px] font-bold text-white">Закупки</div>
            <div className="text-[11.5px] text-ink-300">Карачаевский пивзавод</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to || path.startsWith(to + '/')
            const b = badge(to)
            return (
              <button
                key={to}
                onClick={() => navigate(to)}
                className={cx(
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition',
                  active ? 'bg-amber-500/15 text-amber-200' : 'text-ink-300 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className={cx('h-[18px] w-[18px]', active ? 'text-amber-400' : 'text-ink-400 group-hover:text-ink-200')} />
                <span className="flex-1">{label}</span>
                {b && <span className={cx('min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold', b.tone)}>{b.n}</span>}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-2 truncate text-[12.5px] text-ink-300">{user}</div>
          <button onClick={onLogout} className="flex items-center gap-2 text-[13px] text-ink-300 transition hover:text-white">
            <LogOut className="h-4 w-4" /> Выйти
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] px-8 py-7">{page}</div>
      </main>
    </div>
  )
}
