import Database from 'better-sqlite3'
import { copyFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { closeDb, getDb, getDbPath, getSqlite } from '../db/client'
import { logAction } from './audit'
import { AppError, nowStr } from './util'

export function backupFileName(): string {
  return `zakupki-backup-${nowStr().replace(' ', '_').replace(/:/g, '-')}.sqlite`
}

export async function backupTo(dir: string): Promise<string> {
  const target = join(dir, backupFileName())
  await getSqlite().backup(target)
  logAction(getDb(), 'Создана резервная копия', 'settings', null, target)
  return target
}

/** Проверяет, что файл — база этого приложения. */
export function validateBackup(file: string): void {
  let probe: Database.Database | null = null
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true })
    const names = new Set(probe.prepare("select name from sqlite_master where type = 'table'").all().map((r) => (r as { name: string }).name))
    for (const t of ['users', 'materials', 'suppliers', 'orders', 'stock_movements']) {
      if (!names.has(t)) throw new AppError('Выбранный файл не является резервной копией этой программы')
    }
  } catch (e) {
    if (e instanceof AppError) throw e
    throw new AppError('Не удалось прочитать файл резервной копии')
  } finally {
    probe?.close()
  }
}

/** Подменяет файл базы копией. После вызова приложение должно перезапуститься. */
export function restoreFrom(file: string): void {
  validateBackup(file)
  const current = getDbPath()
  closeDb()
  if (existsSync(current)) copyFileSync(current, current + '.before-restore')
  for (const ext of ['-wal', '-shm', '-journal']) rmSync(current + ext, { force: true })
  copyFileSync(file, current)
}
