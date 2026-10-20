export type Category = 'raw' | 'container' | 'packaging' | 'consumable'
export type OrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
export type RequestStatus = 'new' | 'in_progress' | 'done' | 'cancelled'

export const CATEGORIES: Category[] = ['raw', 'container', 'packaging', 'consumable']

export const CATEGORY_LABEL: Record<Category, string> = {
  raw: 'Сырьё',
  container: 'Тара',
  packaging: 'Упаковка',
  consumable: 'Расходные материалы'
}

export const ORDER_STATUSES: OrderStatus[] = ['draft', 'sent', 'partial', 'received', 'cancelled']

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  partial: 'Частично получен',
  received: 'Получен',
  cancelled: 'Отменён'
}

export const REQUEST_STATUSES: RequestStatus[] = ['new', 'in_progress', 'done', 'cancelled']

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  done: 'Выполнена',
  cancelled: 'Отменена'
}

export const CRITERIA_LABEL = {
  price: 'Цена',
  time: 'Сроки',
  quality: 'Качество'
} as const
