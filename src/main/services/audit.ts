import { and, desc, gte, like, lte, or, eq } from 'drizzle-orm'
import { auditLog } from '../db/schema'
import { getDb, type DbLike } from '../db/client'
import type { AuditFilters, AuditRow } from '@shared/types'
import { nowStr } from './util'

export function logAction(db: DbLike, action: string, entity: string, entityId: number | null, details = '', at = nowStr()): void {
  db.insert(auditLog).values({ action, entity, entityId, details, createdAt: at }).run()
}

export function listAudit(f: AuditFilters = {}): AuditRow[] {
  const db = getDb()
  const conds = []
  if (f.entity) conds.push(eq(auditLog.entity, f.entity))
  if (f.from) conds.push(gte(auditLog.createdAt, f.from))
  if (f.to) conds.push(lte(auditLog.createdAt, f.to + ' 23:59:59'))
  if (f.search?.trim()) {
    const q = `%${f.search.trim()}%`
    conds.push(or(like(auditLog.action, q), like(auditLog.details, q))!)
  }
  return db
    .select()
    .from(auditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(2000)
    .all()
}
