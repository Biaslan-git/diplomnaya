import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/api'

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: string
}

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Envelope<T>
  if (!res.ok) throw new Error(res.error ?? 'Неизвестная ошибка')
  return res.data as T
}

const api: Api = {
  auth: {
    state: () => call('auth:state'),
    login: (login, password) => call('auth:login', login, password),
    logout: () => call('auth:logout'),
    changePassword: (oldPassword, newPassword) => call('auth:changePassword', oldPassword, newPassword)
  },
  dashboard: { get: () => call('dashboard:get') },
  materials: {
    list: () => call('materials:list'),
    get: (id) => call('materials:get', id),
    create: (input) => call('materials:create', input),
    update: (id, input) => call('materials:update', id, input),
    remove: (id) => call('materials:remove', id),
    writeOff: (input) => call('materials:writeOff', input)
  },
  suppliers: {
    list: () => call('suppliers:list'),
    get: (id) => call('suppliers:get', id),
    create: (input) => call('suppliers:create', input),
    update: (id, input) => call('suppliers:update', id, input),
    setActive: (id, active) => call('suppliers:setActive', id, active),
    remove: (id) => call('suppliers:remove', id),
    savePrice: (input) => call('suppliers:savePrice', input),
    removePrice: (id) => call('suppliers:removePrice', id)
  },
  requests: {
    list: () => call('requests:list'),
    create: (input) => call('requests:create', input),
    update: (id, input) => call('requests:update', id, input),
    setStatus: (id, status) => call('requests:setStatus', id, status)
  },
  orders: {
    list: (filters) => call('orders:list', filters ?? {}),
    get: (id) => call('orders:get', id),
    supplierOptions: (materialId) => call('orders:supplierOptions', materialId),
    create: (input) => call('orders:create', input),
    update: (id, input) => call('orders:update', id, input),
    changeStatus: (id, status) => call('orders:changeStatus', id, status),
    receivePreview: (id) => call('orders:receivePreview', id),
    receive: (input) => call('orders:receive', input),
    print: (id) => call('orders:print', id),
    savePdf: (id) => call('orders:savePdf', id)
  },
  reports: {
    get: (kind, period) => call('reports:get', kind, period),
    exportExcel: (kind, period) => call('reports:exportExcel', kind, period)
  },
  settings: {
    getWeights: () => call('settings:getWeights'),
    setWeights: (w) => call('settings:setWeights', w),
    backup: () => call('settings:backup'),
    restore: () => call('settings:restore'),
    resetDemo: () => call('settings:resetDemo')
  },
  audit: { list: (filters) => call('audit:list', filters ?? {}) }
}

contextBridge.exposeInMainWorld('api', api)
