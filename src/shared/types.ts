import type { Category, OrderStatus, RequestStatus } from './labels'
import type { Weights } from './schemas'

export interface MaterialRow {
  id: number
  name: string
  category: Category
  unit: string
  minStock: number
  currentStock: number
  description: string
  isLow: boolean
  /** есть открытая заявка или активный заказ */
  hasOpenSupply: boolean
}

export interface MovementRow {
  id: number
  type: 'in' | 'out'
  quantity: number
  source: 'receipt' | 'writeoff'
  refId: number | null
  /** номер заказа для прихода */
  refLabel: string | null
  createdAt: string
  comment: string
}

export interface MaterialSupplierRow {
  supplierId: number
  supplierName: string
  price: number
  leadTimeDays: number
  rating: number | null
  isActive: boolean
}

export interface MaterialDetail extends MaterialRow {
  movements: MovementRow[]
  suppliers: MaterialSupplierRow[]
  requests: RequestRow[]
}

export interface SupplierRow {
  id: number
  name: string
  inn: string
  contactPerson: string
  phone: string
  email: string
  address: string
  comment: string
  isActive: boolean
  rating: number | null
  ratingPrice: number | null
  ratingTime: number | null
  ratingQuality: number | null
  deliveriesCount: number
  materialsCount: number
  ordersCount: number
}

export interface SupplierPriceRow {
  id: number
  materialId: number
  materialName: string
  unit: string
  category: Category
  price: number
  leadTimeDays: number
  /** минимальная цена среди всех поставщиков этого материала */
  minPrice: number
}

export interface SupplierDetail extends SupplierRow {
  prices: SupplierPriceRow[]
  orders: OrderRow[]
  stats: {
    onTimePct: number | null
    avgQuality: number | null
    totalSpend: number
    lateCount: number
  }
}

export interface RequestRow {
  id: number
  materialId: number
  materialName: string
  unit: string
  quantity: number
  desiredDate: string
  status: RequestStatus
  isAuto: boolean
  comment: string
  createdAt: string
  orderId: number | null
  orderNumber: string | null
}

export interface OrderRow {
  id: number
  number: string
  supplierId: number
  supplierName: string
  requestId: number | null
  status: OrderStatus
  total: number
  expectedDate: string
  comment: string
  createdAt: string
  sentAt: string | null
  isOverdue: boolean
  itemsCount: number
  /** краткий перечень позиций для таблиц и карточек */
  itemsSummary: string
}

export interface OrderItemRow {
  id: number
  materialId: number
  materialName: string
  unit: string
  quantity: number
  price: number
  sum: number
  received: number
}

export interface ReceiptRow {
  id: number
  receivedAt: string
  qualityScore: number
  comment: string
  isLate: boolean
  items: { materialId: number; materialName: string; unit: string; quantity: number }[]
}

export interface OrderDetail extends OrderRow {
  supplier: { id: number; name: string; contactPerson: string; phone: string; email: string; rating: number | null }
  items: OrderItemRow[]
  receipts: ReceiptRow[]
  request: { id: number; isAuto: boolean } | null
}

export interface SupplierOption {
  supplierId: number
  supplierName: string
  rating: number | null
  price: number
  leadTimeDays: number
  expectedDate: string
  isActive: boolean
}

export interface OrderFilters {
  status?: OrderStatus | ''
  supplierId?: number | null
  from?: string
  to?: string
  overdueOnly?: boolean
}

export interface ReceivePreviewItem {
  orderItemId: number
  materialName: string
  unit: string
  ordered: number
  alreadyReceived: number
  remaining: number
}

export interface AttentionItem {
  kind: 'overdue' | 'draft' | 'low_stock'
  title: string
  subtitle: string
  link: string
}

export interface DashboardData {
  spendThisMonth: number
  spendPrevMonth: number
  activeOrders: number
  overdueOrders: number
  lowStock: number
  newRequests: number
  monthly: { month: string; label: string; total: number }[]
  topSuppliers: { id: number; name: string; rating: number }[]
  attention: AttentionItem[]
}

export type ReportKind = 'spending' | 'rating' | 'overdue' | 'movements'

export interface SpendingReport {
  kind: 'spending'
  total: number
  ordersCount: number
  bySupplier: { id: number; name: string; total: number; orders: number }[]
  byCategory: { category: Category; total: number }[]
  byMonth: { month: string; label: string; total: number }[]
}

export interface RatingReport {
  kind: 'rating'
  weights: Weights
  rows: {
    id: number
    name: string
    rating: number | null
    price: number | null
    time: number | null
    quality: number | null
    deliveries: number
  }[]
}

export interface OverdueReport {
  kind: 'overdue'
  rows: {
    orderId: number
    number: string
    supplierName: string
    expectedDate: string
    receivedAt: string | null
    daysLate: number
    status: OrderStatus
    total: number
  }[]
}

export interface MovementsReport {
  kind: 'movements'
  rows: {
    materialId: number
    name: string
    unit: string
    category: Category
    opening: number
    incoming: number
    outgoing: number
    closing: number
  }[]
}

export type AnyReport = SpendingReport | RatingReport | OverdueReport | MovementsReport

export interface AuditRow {
  id: number
  action: string
  entity: string
  entityId: number | null
  details: string
  createdAt: string
}

export interface AuditFilters {
  search?: string
  entity?: string
  from?: string
  to?: string
}

export interface AuthState {
  hasUser: boolean
  user: { id: number; login: string; fullName: string } | null
}
