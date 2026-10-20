import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import { ZodError } from 'zod'
import { AppError } from './services/util'
import * as auth from './services/auth'
import * as materials from './services/materials'
import * as suppliers from './services/suppliers'
import * as requests from './services/requests'
import * as orders from './services/orders'
import * as reports from './services/reports'
import * as settings from './services/settings'
import * as audit from './services/audit'
import * as backup from './services/backup'
import * as demo from './services/demo'
import { getDashboard } from './services/dashboard'
import { buildReportWorkbook, reportFileName } from './services/excel'
import { printOrder, saveOrderPdf } from './pdf'

function message(e: unknown): string {
  if (e instanceof AppError) return e.message
  if (e instanceof ZodError) return e.issues[0]?.message ?? 'Некорректные данные'
  console.error(e)
  const text = e instanceof Error ? e.message : String(e)
  if (/UNIQUE constraint/i.test(text)) return 'Запись с такими данными уже существует'
  if (/FOREIGN KEY/i.test(text)) return 'Операция невозможна: запись связана с другими данными'
  return 'Внутренняя ошибка: ' + text
}

type Handler = (...args: any[]) => unknown

function handle(channel: string, fn: Handler, isPublic = false): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      if (!isPublic && !auth.isAuthenticated()) throw new AppError('Требуется вход в систему')
      return { ok: true, data: (await fn(...args)) ?? null }
    } catch (e) {
      return { ok: false, error: message(e) }
    }
  })
}

const win = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

export function registerIpc(): void {
  handle('auth:state', () => auth.authState(), true)
  handle('auth:login', (l: string, p: string) => auth.login(l, p), true)
  handle('auth:logout', () => auth.logout(), true)
  handle('auth:changePassword', auth.changePassword)

  handle('dashboard:get', getDashboard)

  handle('materials:list', materials.listMaterials)
  handle('materials:get', materials.getMaterial)
  handle('materials:create', materials.createMaterial)
  handle('materials:update', materials.updateMaterial)
  handle('materials:remove', materials.removeMaterial)
  handle('materials:writeOff', materials.writeOff)

  handle('suppliers:list', suppliers.listSuppliers)
  handle('suppliers:get', suppliers.getSupplier)
  handle('suppliers:create', suppliers.createSupplier)
  handle('suppliers:update', suppliers.updateSupplier)
  handle('suppliers:setActive', suppliers.setSupplierActive)
  handle('suppliers:remove', suppliers.removeSupplier)
  handle('suppliers:savePrice', suppliers.saveSupplierPrice)
  handle('suppliers:removePrice', suppliers.removeSupplierPrice)

  handle('requests:list', requests.listRequests)
  handle('requests:create', requests.createRequest)
  handle('requests:update', requests.updateRequest)
  handle('requests:setStatus', requests.setRequestStatus)

  handle('orders:list', orders.listOrders)
  handle('orders:get', orders.getOrder)
  handle('orders:supplierOptions', orders.supplierOptions)
  handle('orders:create', orders.createOrder)
  handle('orders:update', orders.updateOrder)
  handle('orders:changeStatus', orders.changeOrderStatus)
  handle('orders:receivePreview', orders.receivePreview)
  handle('orders:receive', orders.receiveOrder)
  handle('orders:print', (id: number) => printOrder(orders.getOrder(id)))
  handle('orders:savePdf', (id: number) => saveOrderPdf(orders.getOrder(id), win()))

  handle('reports:get', reports.getReport)
  handle('reports:exportExcel', async (kind, period) => {
    const report = reports.getReport(kind, period)
    const res = await dialog.showSaveDialog(win(), {
      title: 'Сохранить отчёт в Excel',
      defaultPath: reportFileName(kind, period),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (res.canceled || !res.filePath) return { saved: false }
    writeFileSync(res.filePath, await buildReportWorkbook(report, period))
    return { saved: true, path: res.filePath }
  })

  handle('settings:getWeights', () => settings.getWeights())
  handle('settings:setWeights', settings.setWeights)
  handle('settings:backup', async () => {
    const res = await dialog.showOpenDialog(win(), { title: 'Выберите папку для резервной копии', properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths[0]) return { saved: false }
    return { saved: true, path: await backup.backupTo(res.filePaths[0]) }
  })
  handle('settings:restore', async () => {
    const res = await dialog.showOpenDialog(win(), {
      title: 'Выберите файл резервной копии',
      properties: ['openFile'],
      filters: [{ name: 'База данных', extensions: ['sqlite', 'db'] }]
    })
    if (res.canceled || !res.filePaths[0]) return { saved: false }
    backup.validateBackup(res.filePaths[0])
    const ok = await dialog.showMessageBox(win(), {
      type: 'warning',
      buttons: ['Восстановить', 'Отмена'],
      defaultId: 1,
      cancelId: 1,
      title: 'Восстановление из копии',
      message: 'Текущие данные будут заменены данными из копии.',
      detail: 'Перед заменой рядом с базой сохранится её резервный файл. Программа перезапустится.'
    })
    if (ok.response !== 0) return { saved: false }
    backup.restoreFrom(res.filePaths[0])
    app.relaunch()
    app.exit(0)
    return { saved: true, path: res.filePaths[0] }
  })
  handle('settings:resetDemo', demo.resetDemo)

  handle('audit:list', audit.listAudit)
}
