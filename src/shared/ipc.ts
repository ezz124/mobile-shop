// ─────────────────────────────────────────────────────────────
// عقد واجهة API الموحدة بين واجهة الويب وخادم النظام
// This is the single source of truth for the typed API surface.
// ─────────────────────────────────────────────────────────────

export const PERMISSIONS = [
  'dashboard', 'pos', 'sales', 'purchases', 'products', 'phones',
  'accessories', 'inventory', 'customers', 'suppliers', 'expenses',
  'treasury', 'returns', 'invoices', 'reports', 'users', 'settings',
  'backup',
] as const;
export type PermissionKey = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  dashboard: 'لوحة التحكم',
  pos: 'نقطة البيع',
  sales: 'المبيعات',
  purchases: 'المشتريات',
  products: 'المنتجات',
  phones: 'الهواتف',
  accessories: 'الملحقات',
  inventory: 'المخزون',
  customers: 'العملاء',
  suppliers: 'الموردون',
  expenses: 'المصروفات',
  treasury: 'الصندوق',
  returns: 'المرتجعات',
  invoices: 'الفواتير',
  reports: 'التقارير',
  users: 'المستخدمون',
  settings: 'الإعدادات',
  backup: 'النسخ الاحتياطي',
};

// ─────────────────────────── DTOs ───────────────────────────

export interface RoleDTO {
  id: number;
  key: string;
  nameAr: string;
  description?: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount?: number;
}

export interface UserDTO {
  id: number;
  username: string;
  fullName: string;
  phone?: string | null;
  roleId: number;
  role?: { id: number; key: string; nameAr: string } | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AuthUser extends UserDTO {
  permissions: PermissionKey[];
}

export interface CategoryDTO { id: number; name: string; productCount?: number }
export interface BrandDTO { id: number; name: string; productCount?: number }
export interface ExpenseCategoryDTO { id: number; name: string; isSystem: boolean; usageCount?: number }

export interface ProductDTO {
  id: number;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  type: 'PHONE' | 'ACCESSORY';
  categoryId?: number | null;
  category?: { id: number; name: string } | null;
  brandId?: number | null;
  brand?: { id: number; name: string } | null;
  storageGb?: number | null;
  ramGb?: number | null;
  color?: string | null;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
  warrantyMonths?: number | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  inStockUnits?: number;
}

export interface InitialPhoneUnitInput {
  imei1: string;
  imei2?: string;
  serialNumber?: string;
}

export interface PhoneUnitDTO {
  id: number;
  productId: number;
  product?: { id: number; name: string } | null;
  imei1: string;
  imei2?: string | null;
  serialNumber?: string | null;
  status: 'IN_STOCK' | 'SOLD' | 'RETURNED' | 'DEFECTIVE';
  purchasePrice?: number | null;
  sellingPrice?: number | null;
  warrantyMonths?: number | null;
  soldAt?: string | null;
  createdAt: string;
}

export interface CustomerDTO {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  debt?: number;
  salesCount?: number;
  totalPurchases?: number;
}

export interface SupplierDTO {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  balance?: number; // ما تبقى ذمته علينا
  purchasesCount?: number;
  totalPurchases?: number;
}

export interface SaleItemDTO {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
  lineTotal: number;
  lineCost: number;
  returnedQuantity: number;
  phoneUnits?: PhoneUnitDTO[];
}

export interface SaleDTO {
  id: number;
  invoiceNumber: string;
  customerId?: number | null;
  customer?: { id: number; name: string; phone?: string | null } | null;
  userId: number;
  user?: { id: number; fullName: string } | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  returnedAmount: number;
  remaining(): number;
  status: 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED';
  paymentMethod: 'CASH' | 'CARD' | 'OTHER';
  note?: string | null;
  createdAt: string;
  items?: SaleItemDTO[];
  profit?: number;
}

/** Serialised sale (remaining precomputed — never call functions over IPC) */
export interface SaleRow extends Omit<SaleDTO, 'remaining' | 'items' | 'profit'> {
  remaining: number;
  itemCount?: number;
  profit?: number;
}

export interface PurchaseItemDTO {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  returnedQuantity: number;
  phoneUnits?: PhoneUnitDTO[];
}

export interface PurchaseDTO {
  id: number;
  invoiceNumber: string;
  supplierId: number;
  supplier?: { id: number; name: string; phone?: string | null } | null;
  userId: number;
  user?: { id: number; fullName: string } | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  returnedAmount: number;
  status: string;
  note?: string | null;
  createdAt: string;
  items?: PurchaseItemDTO[];
}

export type PurchaseRow = Omit<PurchaseDTO, 'items'> & { itemCount?: number };

export interface PaymentDTO {
  id: number;
  kind: 'SALE' | 'PURCHASE' | 'CUSTOMER' | 'SUPPLIER';
  saleId?: number | null;
  purchaseId?: number | null;
  customerId?: number | null;
  customer?: { id: number; name: string } | null;
  supplierId?: number | null;
  supplier?: { id: number; name: string } | null;
  amount: number;
  method: 'CASH' | 'CARD' | 'BANK' | 'OTHER';
  note?: string | null;
  userId: number;
  user?: { id: number; fullName: string } | null;
  createdAt: string;
}

export interface ExpenseDTO {
  id: number;
  categoryId: number;
  category?: { id: number; name: string } | null;
  amount: number;
  description?: string | null;
  method: 'CASH' | 'CARD' | 'BANK' | 'OTHER';
  user?: { id: number; fullName: string } | null;
  createdAt: string;
}

export interface TreasuryTxDTO {
  id: number;
  direction: 'IN' | 'OUT';
  type: TreasuryType;
  amount: number;
  method: string;
  note?: string | null;
  user?: { id: number; fullName: string } | null;
  referenceType?: string | null;
  referenceId?: number | null;
  createdAt: string;
}

export type TreasuryType =
  | 'SALE_INCOME' | 'CUSTOMER_PAYMENT' | 'SUPPLIER_PAYMENT' | 'EXPENSE'
  | 'PURCHASE_PAYMENT' | 'WITHDRAWAL' | 'DEPOSIT' | 'OTHER_INCOME'
  | 'OTHER_EXPENSE' | 'SALE_RETURN_REFUND' | 'PURCHASE_RETURN_IN';

export const TREASURY_LABELS: Record<TreasuryType, string> = {
  SALE_INCOME: 'تحصيل مبيعات',
  CUSTOMER_PAYMENT: 'دفعة عميل',
  SUPPLIER_PAYMENT: 'دفعة مورد',
  EXPENSE: 'مصروف',
  PURCHASE_PAYMENT: 'دفعة مشتريات',
  WITHDRAWAL: 'سحب نقدي',
  DEPOSIT: 'إيداع نقدي',
  OTHER_INCOME: 'إيراد آخر',
  OTHER_EXPENSE: 'مصروف آخر',
  SALE_RETURN_REFUND: 'رد مبلغ مرتجع مبيعات',
  PURCHASE_RETURN_IN: 'استرداد مرتجع مشتريات',
};

export interface ReturnItemDTO {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReturnDTO {
  id: number;
  invoiceNumber: string;
  type: 'SALE_RETURN' | 'PURCHASE_RETURN';
  saleId?: number | null;
  saleInvoice?: string | null;
  purchaseId?: number | null;
  purchaseInvoice?: string | null;
  customer?: { id: number; name: string } | null;
  supplier?: { id: number; name: string } | null;
  user?: { id: number; fullName: string } | null;
  total: number;
  refundMethod: 'CASH' | 'CREDIT';
  restock: boolean;
  reason?: string | null;
  createdAt: string;
  items?: ReturnItemDTO[];
}

export interface MovementDTO {
  id: number;
  productId: number;
  product?: { id: number; name: string; type: string } | null;
  type: string;
  quantityChange: number;
  balanceAfter: number;
  referenceType?: string | null;
  referenceId?: number | null;
  note?: string | null;
  user?: { id: number; fullName: string } | null;
  createdAt: string;
}

export interface AuditLogDTO {
  id: number;
  username?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}

// ─────────────────────────── Payloads ───────────────────────────

export interface Paginated<T> { data: T[]; total: number; page: number; pageSize: number }

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface ProductListParams extends ListParams {
  type?: 'PHONE' | 'ACCESSORY';
  categoryId?: number;
  brandId?: number;
  lowStock?: boolean;
  activeOnly?: boolean;
}

export interface SaleListParams extends ListParams {
  customerId?: number;
  userId?: number;
  status?: string;
  from?: string;
  to?: string;
}

export interface PurchaseListParams extends ListParams {
  supplierId?: number;
  from?: string;
  to?: string;
}

export interface SaleItemInput {
  productId: number;
  quantity: number;
  unitPrice: number;
  discount?: number;
  phoneUnitIds?: number[];
}

export interface CreateSaleInput {
  items: SaleItemInput[];
  customerId?: number | null;
  discount: number;
  paidAmount: number;
  paymentMethod: 'CASH' | 'CARD' | 'OTHER';
  note?: string;
}

export interface PurchaseItemInput {
  productId: number;
  quantity: number;
  unitCost: number;
  sellingPrice?: number | null;
  phoneUnits?: { imei1: string; imei2?: string; serialNumber?: string; warrantyMonths?: number }[];
}

export interface CreatePurchaseInput {
  supplierId: number;
  items: PurchaseItemInput[];
  discount?: number;
  paidAmount: number;
  note?: string;
}

export interface SaleReturnItemInput {
  saleItemId: number;
  quantity: number;
  phoneUnitIds?: number[];
}

export interface CreateReturnInput {
  type: 'SALE_RETURN' | 'PURCHASE_RETURN';
  saleId?: number;
  purchaseId?: number;
  items: { itemId: number; quantity: number; phoneUnitIds?: number[] }[];
  refundMethod: 'CASH' | 'CREDIT';
  restock: boolean;
  reason?: string;
}

export interface DashboardData {
  todaySales: number;
  todaySalesCount: number;
  todayPurchases: number;
  todayProfit: number;
  cashBalance: number;
  totalProducts: number;
  totalUnits: number;
  lowStockCount: number;
  customersDebt: number;
  suppliersDebt: number;
  recentSales: SaleRow[];
  recentPurchases: PurchaseRow[];
  bestSellers: { productId: number; name: string; quantity: number; revenue: number; profit: number }[];
  salesChart: { date: string; total: number; profit: number }[];
  monthSales: number;
  monthProfit: number;
}

export interface ReportParams { from: string; to: string }

export interface SalesReportData {
  rows: { date: string; count: number; total: number; profit: number; discounts: number }[];
  totals: { count: number; total: number; profit: number; discounts: number; returns: number };
  paymentBreakdown: { method: string; total: number }[];
}

export interface ProductReportRow {
  productId: number;
  name: string;
  quantitySold: number;
  revenue: number;
  profit: number;
  quantityReturned: number;
}

export interface EmployeeReportRow {
  userId: number;
  name: string;
  salesCount: number;
  total: number;
  profit: number;
}

export interface TreasuryReportData {
  balance: number;
  totalIn: number;
  totalOut: number;
  byType: { type: TreasuryType; direction: 'IN' | 'OUT'; total: number }[];
  rows: TreasuryTxDTO[];
}

export interface DebtsReportData {
  customers: { id: number; name: string; phone?: string | null; debt: number; salesCount: number }[];
  suppliers: { id: number; name: string; phone?: string | null; balance: number; purchasesCount: number }[];
}

export interface InventoryReportData {
  totalProducts: number;
  totalUnits: number;
  stockValue: number;
  retailValue: number;
  lowStock: { id: number; name: string; quantity: number; minStock: number; type: string }[];
  outOfStock: number;
}

export interface AppSettings {
  storeName: string;
  storePhone: string;
  storeAddress: string;
  currency: string;
  invoiceFooter: string;
  lowStockThreshold: number;
  autoBackup: boolean;
  autoBackupIntervalHours: number;
  printerWidth: '80mm' | 'A4';
  taxEnabled: boolean;
  taxRate: number;
}

export interface BackupFile {
  name: string;
  fullPath: string;
  size: number;
  createdAt: string;
}

// ─────────────────────────── API Map (channels) ───────────────────────────

export interface IpcError { ok: false; error: string }
export interface IpcOk<T> { ok: true; data: T }
export type IpcResult<T> = IpcOk<T> | IpcError

export interface ApiMap {
  'auth:login': { req: { username: string; password: string }; res: { user: AuthUser } };
  'auth:logout': { req: Record<string, never>; res: { ok: boolean } };
  'auth:me': { req: Record<string, never>; res: AuthUser };
  'auth:changePassword': { req: { oldPassword: string; newPassword: string }; res: { ok: boolean } };

  'users:list': { req: ListParams & { roleId?: number; isActive?: boolean }; res: Paginated<UserDTO> };
  'users:create': { req: { username: string; fullName: string; password: string; phone?: string; roleId: number; isActive?: boolean }; res: UserDTO };
  'users:update': { req: { id: number; fullName: string; phone?: string; roleId: number; isActive: boolean }; res: UserDTO };
  'users:resetPassword': { req: { id: number; newPassword: string }; res: { ok: boolean } };
  'users:delete': { req: { id: number }; res: { ok: boolean } };
  'roles:list': { req: Record<string, never>; res: RoleDTO[] };
  'roles:updatePermissions': { req: { roleId: number; permissionKeys: string[] }; res: RoleDTO };

  'products:list': { req: ProductListParams; res: Paginated<ProductDTO> };
  'products:get': { req: { id: number }; res: ProductDTO & { units: PhoneUnitDTO[] } };
  'products:create': { req: Partial<ProductDTO> & { name: string; type: 'PHONE' | 'ACCESSORY'; initialPhoneUnits?: InitialPhoneUnitInput[] }; res: ProductDTO };
  'products:update': { req: { id: number } & Partial<ProductDTO>; res: ProductDTO };
  'products:delete': { req: { id: number }; res: { ok: boolean } };
  'products:lookup': { req: { query: string; type?: 'PHONE' | 'ACCESSORY' }; res: (ProductDTO & { matchType: string; unit?: PhoneUnitDTO; units?: PhoneUnitDTO[] })[] };

  'phoneUnits:list': { req: ListParams & { status?: string; productId?: number }; res: Paginated<PhoneUnitDTO> };
  'phoneUnits:setStatus': { req: { id: number; status: PhoneUnitDTO['status'] }; res: PhoneUnitDTO };
  'phoneUnits:update': { req: { id: number; imei1: string; imei2?: string; serialNumber?: string }; res: PhoneUnitDTO };
  'phoneUnits:add': { req: { productId: number; quantity: number; imeis?: string[] }; res: { ok: boolean } };
  'phoneUnits:remove': { req: { unitIds: number[] }; res: { ok: boolean } };

  'categories:list': { req: Record<string, never>; res: CategoryDTO[] };
  'categories:create': { req: { name: string }; res: CategoryDTO };
  'categories:update': { req: { id: number; name: string }; res: CategoryDTO };
  'categories:delete': { req: { id: number }; res: { ok: boolean } };
  'brands:list': { req: Record<string, never>; res: BrandDTO[] };
  'brands:create': { req: { name: string }; res: BrandDTO };
  'brands:update': { req: { id: number; name: string }; res: BrandDTO };
  'brands:delete': { req: { id: number }; res: { ok: boolean } };

  'inventory:movements': { req: ListParams & { productId?: number; type?: string; from?: string; to?: string }; res: Paginated<MovementDTO> };
  'inventory:adjust': { req: { productId: number; newQuantity?: number; change?: number; type: 'ADJUSTMENT' | 'DAMAGE'; reason?: string }; res: ProductDTO };
  'inventory:valuation': { req: Record<string, never>; res: InventoryReportData };

  'sales:create': { req: CreateSaleInput; res: SaleDTO };
  'sales:list': { req: SaleListParams; res: Paginated<SaleRow> };
  'sales:get': { req: { id: number }; res: SaleDTO };
  'sales:delete': { req: { id: number }; res: { ok: boolean } };
  'sales:addPayment': { req: { saleId: number; amount: number; method: string; note?: string }; res: SaleDTO };
  'customers:payDebt': { req: { customerId: number; amount: number; method: string; note?: string }; res: { ok: boolean; debt: number } };

  'purchases:create': { req: CreatePurchaseInput; res: PurchaseDTO };
  'purchases:list': { req: PurchaseListParams; res: Paginated<PurchaseRow> };
  'purchases:get': { req: { id: number }; res: PurchaseDTO };
  'purchases:delete': { req: { id: number }; res: { ok: boolean } };
  'purchases:addPayment': { req: { purchaseId: number; amount: number; method: string; note?: string }; res: PurchaseDTO };
  'suppliers:payDebt': { req: { supplierId: number; amount: number; method: string; note?: string }; res: { ok: boolean; balance: number } };

  'customers:list': { req: ListParams & { withDebt?: boolean }; res: Paginated<CustomerDTO> };
  'customers:get': { req: { id: number }; res: CustomerDTO & { sales: SaleRow[]; payments: PaymentDTO[]; debt: number } };
  'customers:create': { req: { name: string; phone?: string; address?: string; notes?: string }; res: CustomerDTO };
  'customers:update': { req: { id: number; name: string; phone?: string; address?: string; notes?: string; isActive?: boolean }; res: CustomerDTO };
  'customers:delete': { req: { id: number }; res: { ok: boolean } };

  'suppliers:list': { req: ListParams & { withDebt?: boolean }; res: Paginated<SupplierDTO> };
  'suppliers:get': { req: { id: number }; res: SupplierDTO & { purchases: PurchaseRow[]; payments: PaymentDTO[]; balance: number } };
  'suppliers:create': { req: { name: string; phone?: string; address?: string; notes?: string }; res: SupplierDTO };
  'suppliers:update': { req: { id: number; name: string; phone?: string; address?: string; notes?: string; isActive?: boolean }; res: SupplierDTO };
  'suppliers:delete': { req: { id: number }; res: { ok: boolean } };

  'expenses:list': { req: ListParams & { categoryId?: number; from?: string; to?: string }; res: Paginated<ExpenseDTO> & { count: number; sum: number } };
  'expenses:create': { req: { categoryId: number; amount: number; description?: string; method: string }; res: ExpenseDTO };
  'expenses:update': { req: { id: number; categoryId: number; amount: number; description?: string; method: string }; res: ExpenseDTO };
  'expenses:delete': { req: { id: number }; res: { ok: boolean } };
  'expenseCategories:list': { req: Record<string, never>; res: ExpenseCategoryDTO[] };
  'expenseCategories:create': { req: { name: string }; res: ExpenseCategoryDTO };
  'expenseCategories:update': { req: { id: number; name: string }; res: ExpenseCategoryDTO };
  'expenseCategories:delete': { req: { id: number }; res: { ok: boolean } };

  'treasury:list': { req: ListParams & { direction?: 'IN' | 'OUT'; type?: TreasuryType; from?: string; to?: string }; res: Paginated<TreasuryTxDTO> & { sumIn: number; sumOut: number } };
  'treasury:summary': { req: { from?: string; to?: string }; res: TreasuryReportData };
  'treasury:manual': { req: { type: 'WITHDRAWAL' | 'DEPOSIT' | 'OTHER_INCOME' | 'OTHER_EXPENSE'; amount: number; method: string; note?: string }; res: TreasuryTxDTO };

  'returns:create': { req: CreateReturnInput; res: ReturnDTO };
  'returns:list': { req: ListParams & { type?: string; from?: string; to?: string }; res: Paginated<ReturnDTO> };
  'returns:get': { req: { id: number }; res: ReturnDTO };

  'reports:dashboard': { req: Record<string, never>; res: DashboardData };
  'reports:sales': { req: ReportParams; res: SalesReportData };
  'reports:purchases': { req: ReportParams; res: { rows: { date: string; count: number; total: number }[]; totals: { count: number; total: number } } };
  'reports:products': { req: ReportParams; res: ProductReportRow[] };
  'reports:employees': { req: ReportParams; res: EmployeeReportRow[] };
  'reports:treasury': { req: ReportParams; res: TreasuryReportData };
  'reports:debts': { req: Record<string, never>; res: DebtsReportData };
  'reports:inventory': { req: Record<string, never>; res: InventoryReportData };

  'settings:get': { req: Record<string, never>; res: AppSettings };
  'settings:set': { req: Partial<AppSettings>; res: AppSettings };

  'backup:create': { req: { name?: string }; res: BackupFile };
  'backup:list': { req: Record<string, never>; res: BackupFile[] };
  'backup:validate': { req: { fullPath: string }; res: { ok: boolean; info?: string } };
  'backup:restore': { req: { fullPath: string }; res: { ok: boolean } };
  'backup:dbSize': { req: Record<string, never>; res: { bytes: number } };

  'audit:list': { req: ListParams; res: Paginated<AuditLogDTO> };

  'print:html': { req: { html: string; title?: string }; res: { ok: boolean } };
}

export type ApiChannel = keyof ApiMap;

export interface ApiClient {
  invoke<C extends ApiChannel>(channel: C, args: ApiMap[C]['req']): Promise<IpcResult<ApiMap[C]['res']>>;
}
