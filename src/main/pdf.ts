import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import type { OrderDetail } from '@shared/types'
import type { FileResult } from '@shared/api'
import { orderHtml } from './services/orderHtml'

async function hiddenWindow(order: OrderDetail): Promise<BrowserWindow> {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } })
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(orderHtml(order)))
  return w
}

export async function printOrder(order: OrderDetail): Promise<void> {
  const w = await hiddenWindow(order)
  await new Promise<void>((resolve) => {
    w.webContents.print({ silent: false, printBackground: true }, () => resolve())
  })
  w.destroy()
}

export async function saveOrderPdf(order: OrderDetail, parent?: BrowserWindow): Promise<FileResult> {
  const res = await dialog.showSaveDialog(parent!, {
    title: 'Сохранить заказ в PDF',
    defaultPath: `Заказ ${order.number}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (res.canceled || !res.filePath) return { saved: false }
  const w = await hiddenWindow(order)
  try {
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
    writeFileSync(res.filePath, pdf)
  } finally {
    w.destroy()
  }
  return { saved: true, path: res.filePath }
}
