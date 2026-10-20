import type {
  AnyReport, AuditFilters, AuditRow, AuthState, DashboardData, MaterialDetail, MaterialRow, OrderDetail,
  OrderFilters, OrderRow, ReceivePreviewItem, ReportKind, RequestRow, SupplierDetail, SupplierOption, SupplierRow
} from './types'
import type {
  MaterialInput, OrderInput, Period, ReceiptInput, RequestInput, SupplierInput, SupplierPriceInput, Weights, WriteOffInput
} from './schemas'
import type { OrderStatus, RequestStatus } from './labels'

export interface FileResult {
  saved: boolean
  path?: string
}

/** Типизированный API, который preload отдаёт в интерфейс как window.api */
export interface Api {
  auth: {
    state(): Promise<AuthState>
    login(login: string, password: string): Promise<AuthState>
    logout(): Promise<void>
    changePassword(oldPassword: string, newPassword: string): Promise<void>
  }
  dashboard: {
    get(): Promise<DashboardData>
  }
  materials: {
    list(): Promise<MaterialRow[]>
    get(id: number): Promise<MaterialDetail>
    create(input: MaterialInput): Promise<MaterialRow>
    update(id: number, input: MaterialInput): Promise<MaterialRow>
    remove(id: number): Promise<void>
    writeOff(input: WriteOffInput): Promise<void>
  }
  suppliers: {
    list(): Promise<SupplierRow[]>
    get(id: number): Promise<SupplierDetail>
    create(input: SupplierInput): Promise<SupplierRow>
    update(id: number, input: SupplierInput): Promise<SupplierRow>
    setActive(id: number, active: boolean): Promise<void>
    remove(id: number): Promise<void>
    savePrice(input: SupplierPriceInput): Promise<void>
    removePrice(id: number): Promise<void>
  }
  requests: {
    list(): Promise<RequestRow[]>
    create(input: RequestInput): Promise<RequestRow>
    update(id: number, input: RequestInput): Promise<RequestRow>
    setStatus(id: number, status: RequestStatus): Promise<void>
  }
  orders: {
    list(filters?: OrderFilters): Promise<OrderRow[]>
    get(id: number): Promise<OrderDetail>
    supplierOptions(materialId: number): Promise<SupplierOption[]>
    create(input: OrderInput): Promise<OrderDetail>
    update(id: number, input: OrderInput): Promise<OrderDetail>
    changeStatus(id: number, status: OrderStatus): Promise<OrderDetail>
    receivePreview(id: number): Promise<ReceivePreviewItem[]>
    receive(input: ReceiptInput): Promise<OrderDetail>
    print(id: number): Promise<void>
    savePdf(id: number): Promise<FileResult>
  }
  reports: {
    get(kind: ReportKind, period: Period): Promise<AnyReport>
    exportExcel(kind: ReportKind, period: Period): Promise<FileResult>
  }
  settings: {
    getWeights(): Promise<Weights>
    setWeights(weights: Weights): Promise<void>
    backup(): Promise<FileResult>
    restore(): Promise<FileResult>
    resetDemo(): Promise<void>
  }
  audit: {
    list(filters?: AuditFilters): Promise<AuditRow[]>
  }
}
