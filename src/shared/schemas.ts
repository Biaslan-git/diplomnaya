import { z } from 'zod'

const num = (msg: string) => z.number({ error: msg })
const date = (msg = 'Укажите дату') => z.string({ error: msg }).regex(/^\d{4}-\d{2}-\d{2}$/, msg)

export const categorySchema = z.enum(['raw', 'container', 'packaging', 'consumable'], { error: 'Выберите категорию' })

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль')
})

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Введите текущий пароль'),
    newPassword: z.string().min(4, 'Новый пароль — не короче 4 символов'),
    repeat: z.string()
  })
  .refine((v) => v.newPassword === v.repeat, { path: ['repeat'], message: 'Пароли не совпадают' })

export const materialSchema = z.object({
  name: z.string().trim().min(1, 'Введите название'),
  category: categorySchema,
  unit: z.string().trim().min(1, 'Укажите единицу измерения'),
  minStock: num('Введите минимальный остаток').min(0, 'Не может быть отрицательным'),
  description: z.string().default(''),
  initialStock: num('Введите число').min(0, 'Не может быть отрицательным').optional()
})
export type MaterialInput = z.infer<typeof materialSchema>

export const writeOffSchema = z.object({
  materialId: z.number().int(),
  quantity: num('Введите количество').positive('Количество должно быть больше нуля'),
  date: date(),
  comment: z.string().default('')
})
export type WriteOffInput = z.infer<typeof writeOffSchema>

const innSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^(\d{10}|\d{12})$/.test(v), 'ИНН — 10 или 12 цифр')

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Введите название'),
  inn: innSchema.default(''),
  contactPerson: z.string().trim().default(''),
  phone: z.string().trim().default(''),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Некорректный email')
    .default(''),
  address: z.string().trim().default(''),
  comment: z.string().default('')
})
export type SupplierInput = z.infer<typeof supplierSchema>

export const supplierPriceSchema = z.object({
  supplierId: z.number().int(),
  materialId: z.number({ error: 'Выберите материал' }).int('Выберите материал'),
  price: num('Введите цену').positive('Цена должна быть больше нуля'),
  leadTimeDays: num('Введите срок').int('Целое число дней').min(0, 'Не может быть отрицательным')
})
export type SupplierPriceInput = z.infer<typeof supplierPriceSchema>

export const requestSchema = z.object({
  materialId: z.number({ error: 'Выберите материал' }).int('Выберите материал'),
  quantity: num('Введите количество').positive('Количество должно быть больше нуля'),
  desiredDate: date('Укажите желаемую дату'),
  comment: z.string().default('')
})
export type RequestInput = z.infer<typeof requestSchema>

export const orderItemSchema = z.object({
  materialId: z.number({ error: 'Выберите материал' }).int('Выберите материал'),
  quantity: num('Введите количество').positive('Количество должно быть больше нуля'),
  price: num('Введите цену').min(0, 'Цена не может быть отрицательной')
})

export const orderSchema = z.object({
  supplierId: z.number({ error: 'Выберите поставщика' }).int('Выберите поставщика'),
  requestId: z.number().int().nullable().optional(),
  expectedDate: date('Укажите ожидаемую дату поставки'),
  comment: z.string().default(''),
  items: z.array(orderItemSchema).min(1, 'Добавьте хотя бы одну позицию')
})
export type OrderInput = z.infer<typeof orderSchema>

export const receiptSchema = z.object({
  orderId: z.number().int(),
  receivedAt: date('Укажите дату приёмки'),
  qualityScore: num('Поставьте оценку качества').int().min(1, 'Оценка от 1 до 5').max(5, 'Оценка от 1 до 5'),
  comment: z.string().default(''),
  items: z
    .array(
      z.object({
        orderItemId: z.number().int(),
        quantity: num('Введите количество').min(0, 'Не может быть отрицательным')
      })
    )
    .refine((arr) => arr.some((i) => i.quantity > 0), 'Укажите фактическое количество хотя бы по одной позиции')
})
export type ReceiptInput = z.infer<typeof receiptSchema>

export const weightsSchema = z
  .object({
    price: num('Введите вес').min(0, 'От 0 до 1').max(1, 'От 0 до 1'),
    time: num('Введите вес').min(0, 'От 0 до 1').max(1, 'От 0 до 1'),
    quality: num('Введите вес').min(0, 'От 0 до 1').max(1, 'От 0 до 1')
  })
  .refine((w) => Math.abs(w.price + w.time + w.quality - 1) < 0.0005, {
    path: ['quality'],
    message: 'Сумма весов должна быть равна 1'
  })
export type Weights = z.infer<typeof weightsSchema>

export const periodSchema = z.object({ from: date('Укажите начало периода'), to: date('Укажите конец периода') })
export type Period = z.infer<typeof periodSchema>

/** Первая ошибка zod в виде понятной строки; по полям — для подсветки. */
export function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_'
    if (!(key in out)) out[key] = issue.message
  }
  return out
}
