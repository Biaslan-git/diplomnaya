import { eq } from 'drizzle-orm'
import { settings } from '../db/schema'
import { getDb, type DbLike } from '../db/client'
import { weightsSchema, type Weights } from '@shared/schemas'
import { logAction } from './audit'
import { recomputeAllRatings } from './rating'

export const DEFAULT_WEIGHTS: Weights = { price: 0.4, time: 0.3, quality: 0.3 }

export function getSetting(db: DbLike, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
}

export function setSetting(db: DbLike, key: string, value: string): void {
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run()
}

export function getWeights(db: DbLike = getDb()): Weights {
  const read = (k: string, def: number) => {
    const v = Number(getSetting(db, k))
    return Number.isFinite(v) && getSetting(db, k) !== null ? v : def
  }
  return {
    price: read('weight_price', DEFAULT_WEIGHTS.price),
    time: read('weight_time', DEFAULT_WEIGHTS.time),
    quality: read('weight_quality', DEFAULT_WEIGHTS.quality)
  }
}

export function setWeights(input: Weights): void {
  const w = weightsSchema.parse(input)
  const db = getDb()
  db.transaction((tx) => {
    setSetting(tx, 'weight_price', String(w.price))
    setSetting(tx, 'weight_time', String(w.time))
    setSetting(tx, 'weight_quality', String(w.quality))
    recomputeAllRatings(tx)
    logAction(tx, 'Изменены веса рейтинга', 'settings', null, `Цена ${w.price}, сроки ${w.time}, качество ${w.quality}`)
  })
}
