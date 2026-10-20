import { getDb } from '../db/client'
import { seedDemo } from '../db/seed'
import { logAction } from './audit'

/** Заменяет все данные демонстрационными (учётная запись сохраняется). */
export function resetDemo(): void {
  getDb().transaction((tx) => {
    seedDemo(tx)
    logAction(tx, 'Загружены демонстрационные данные', 'settings', null, 'Все данные заменены демонстрационными')
  })
}
