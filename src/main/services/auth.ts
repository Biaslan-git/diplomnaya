import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { getDb, type DbLike } from '../db/client'
import type { AuthState } from '@shared/types'
import { changePasswordSchema, loginSchema } from '@shared/schemas'
import { logAction } from './audit'
import { AppError, nowStr } from './util'

let currentUserId: number | null = null

export function isAuthenticated(): boolean {
  return currentUserId !== null
}

export function ensureDefaultUser(db: DbLike): void {
  const exists = db.select({ id: users.id }).from(users).limit(1).get()
  if (exists) return
  db.insert(users)
    .values({
      login: 'admin',
      passwordHash: bcrypt.hashSync('admin', 10),
      fullName: 'Сотрудник отдела закупок',
      createdAt: nowStr()
    })
    .run()
}

export function authState(): AuthState {
  const db = getDb()
  const hasUser = !!db.select({ id: users.id }).from(users).limit(1).get()
  if (currentUserId === null) return { hasUser, user: null }
  const u = db.select().from(users).where(eq(users.id, currentUserId)).get()
  return { hasUser, user: u ? { id: u.id, login: u.login, fullName: u.fullName } : null }
}

export function login(loginName: string, password: string): AuthState {
  const input = loginSchema.parse({ login: loginName, password })
  const db = getDb()
  const u = db.select().from(users).where(eq(users.login, input.login)).get()
  if (!u || !bcrypt.compareSync(input.password, u.passwordHash)) throw new AppError('Неверный логин или пароль')
  currentUserId = u.id
  return authState()
}

export function logout(): void {
  currentUserId = null
}

export function changePassword(oldPassword: string, newPassword: string): void {
  changePasswordSchema.parse({ oldPassword, newPassword, repeat: newPassword })
  if (currentUserId === null) throw new AppError('Требуется вход в систему')
  const db = getDb()
  const u = db.select().from(users).where(eq(users.id, currentUserId)).get()
  if (!u || !bcrypt.compareSync(oldPassword, u.passwordHash)) throw new AppError('Текущий пароль указан неверно')
  db.update(users).set({ passwordHash: bcrypt.hashSync(newPassword, 10) }).where(eq(users.id, u.id)).run()
  logAction(db, 'Изменён пароль', 'settings', u.id, `Пользователь ${u.login}`)
}
