import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type DB = BetterSQLite3Database<typeof schema>
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]
/** Соединение или транзакция — сервисы принимают любое из них */
export type DbLike = DB | Tx

let sqlite: Database.Database | null = null
let db: DB | null = null
let dbFile = ''

export function openDb(file: string, migrationsFolder: string): DB {
  closeDb()
  sqlite = new Database(file)
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  dbFile = file
  // миграции применяются автоматически при каждом запуске
  migrate(db, { migrationsFolder })
  return db
}

export function getDb(): DB {
  if (!db) throw new Error('База данных не открыта')
  return db
}

export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('База данных не открыта')
  return sqlite
}

export function getDbPath(): string {
  return dbFile
}

export function closeDb(): void {
  if (sqlite) sqlite.close()
  sqlite = null
  db = null
}
