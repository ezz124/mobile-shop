import { z } from 'zod';
import { AppError } from './core/errors';
import type { ApiChannel } from '../src/shared/ipc';

const id = z.number().int().positive();
const text = z.string().trim().min(1).max(255);
const money = z.number().finite().min(0).max(100_000_000);
const quantity = z.number().finite().int().positive().max(100_000);
const method = z.enum(['CASH', 'CARD', 'BANK', 'OTHER']);
const page = z.object({
  page: z.number().int().min(1).max(1_000_000).optional(),
  pageSize: z.number().int().min(5).max(100).optional(),
}).passthrough();
const list = z.object({
  page: z.number().int().min(1).max(1_000_000).optional(),
  pageSize: z.number().int().min(5).max(100).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).optional(),
}).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صحيح');
const base = z.object({}).passthrough().superRefine((value, ctx) => {
  if (Object.keys(value).length > 50) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'عدد حقول الطلب أكبر من المسموح' });
});

const schemas: Partial<Record<ApiChannel, z.ZodTypeAny>> = {
  'auth:login': z.object({ username: text.max(64), password: z.string().min(1).max(200) }).strict(),
  'auth:changePassword': z.object({ oldPassword: z.string().min(1).max(200), newPassword: z.string().min(6).max(200) }).strict(),
  'users:create': z.object({ username: text.max(64), fullName: text, password: z.string().min(6).max(200), phone: z.string().max(40).optional(), roleId: id, isActive: z.boolean().optional() }).strict(),
  'users:list': list.extend({ roleId: id.optional(), isActive: z.boolean().optional() }),
  'users:update': z.object({ id, fullName: text, phone: z.string().max(40).optional(), roleId: id, isActive: z.boolean() }).strict(),
  'users:resetPassword': z.object({ id, newPassword: z.string().min(6).max(200) }).strict(),
  'users:delete': z.object({ id }).strict(),
  'roles:updatePermissions': z.object({ roleId: id, permissionKeys: z.array(z.string().max(50)).max(30) }).strict(),
  'products:create': z.object({
    name: text, type: z.enum(['PHONE', 'ACCESSORY']), quantity: z.number().int().min(0).max(100_000).optional(),
    initialPhoneUnits: z.array(z.object({ imei1: z.string().trim().min(10).max(64), imei2: z.string().trim().max(64).optional(), serialNumber: z.string().trim().max(128).optional() }).strict()).max(100).optional(),
  }).passthrough().superRefine((value, ctx) => {
    if (value.type !== 'PHONE') return;
    const units = value.initialPhoneUnits ?? [];
    if (!value.quantity || value.quantity < 1 || units.length !== value.quantity) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'حدد كمية الهاتف وأدخل IMEI لكل جهاز' });
    }
    const imeis = units.map((unit) => unit.imei1.trim());
    if (new Set(imeis).size !== imeis.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'لا يمكن تكرار رقم IMEI' });
  }),
  'products:list': list.extend({ type: z.enum(['PHONE', 'ACCESSORY']).optional(), categoryId: id.optional(), brandId: id.optional(), lowStock: z.boolean().optional(), activeOnly: z.boolean().optional() }),
  'products:update': z.object({ id }).passthrough(),
  'products:delete': z.object({ id }).strict(),
  'products:get': z.object({ id }).strict(),
  'products:lookup': z.object({ query: text.max(100), type: z.enum(['PHONE', 'ACCESSORY']).optional() }).strict(),
  'phoneUnits:setStatus': z.object({ id, status: z.enum(['IN_STOCK', 'SOLD', 'RETURNED', 'DEFECTIVE']) }).strict(),
  'phoneUnits:list': list.extend({ status: z.enum(['IN_STOCK', 'SOLD', 'RETURNED', 'DEFECTIVE']).optional(), productId: id.optional() }),
  'categories:create': z.object({ name: text }).strict(),
  'categories:update': z.object({ id, name: text }).strict(),
  'categories:delete': z.object({ id }).strict(),
  'brands:create': z.object({ name: text }).strict(),
  'brands:update': z.object({ id, name: text }).strict(),
  'brands:delete': z.object({ id }).strict(),
  'customers:create': z.object({ name: text, phone: z.string().max(40).optional(), address: z.string().max(500).optional(), notes: z.string().max(2_000).optional() }).strict(),
  'customers:update': z.object({ id, name: text, phone: z.string().max(40).optional(), address: z.string().max(500).optional(), notes: z.string().max(2_000).optional(), isActive: z.boolean().optional() }).strict(),
  'customers:delete': z.object({ id }).strict(),
  'suppliers:create': z.object({ name: text, phone: z.string().max(40).optional(), address: z.string().max(500).optional(), notes: z.string().max(2_000).optional() }).strict(),
  'suppliers:update': z.object({ id, name: text, phone: z.string().max(40).optional(), address: z.string().max(500).optional(), notes: z.string().max(2_000).optional(), isActive: z.boolean().optional() }).strict(),
  'suppliers:delete': z.object({ id }).strict(),
  'expenses:create': z.object({ categoryId: id, amount: money.positive(), description: z.string().max(2_000).optional(), method: z.string().max(30) }).strict(),
  'expenses:update': z.object({ id, categoryId: id, amount: money.positive(), description: z.string().max(2_000).optional(), method: z.string().max(30) }).strict(),
  'expenses:delete': z.object({ id }).strict(),
  'sales:addPayment': z.object({ saleId: id, amount: money.positive(), method: z.string().max(30), note: z.string().max(2_000).optional() }).strict(),
  'sales:create': z.object({
    items: z.array(z.object({ productId: id, quantity, unitPrice: money, discount: money.optional(), phoneUnitIds: z.array(id).max(100).optional() }).strict()).min(1).max(100),
    customerId: id.nullable().optional(), discount: money, paidAmount: money, paymentMethod: method, note: z.string().max(2_000).optional(),
  }).strict(),
  'sales:list': list.extend({ customerId: id.optional(), userId: id.optional(), status: z.string().max(40).optional(), from: date.optional(), to: date.optional() }),
  'purchases:addPayment': z.object({ purchaseId: id, amount: money.positive(), method: z.string().max(30), note: z.string().max(2_000).optional() }).strict(),
  'purchases:create': z.object({
    supplierId: id, items: z.array(z.object({ productId: id, quantity, unitCost: money, sellingPrice: money.nullable().optional(),
      phoneUnits: z.array(z.object({ imei1: z.string().trim().min(10).max(64), imei2: z.string().trim().max(64).optional(), serialNumber: z.string().trim().max(128).optional(), warrantyMonths: z.number().int().min(0).max(120).optional() }).strict()).max(100).optional(),
    }).strict()).min(1).max(100), discount: money.optional(), paidAmount: money, note: z.string().max(2_000).optional(),
  }).strict(),
  'purchases:list': list.extend({ supplierId: id.optional(), from: date.optional(), to: date.optional() }),
  'customers:payDebt': z.object({ customerId: id, amount: money.positive(), method: z.string().max(30), note: z.string().max(2_000).optional() }).strict(),
  'customers:list': list.extend({ withDebt: z.boolean().optional() }),
  'customers:get': z.object({ id }).strict(),
  'suppliers:payDebt': z.object({ supplierId: id, amount: money.positive(), method: z.string().max(30), note: z.string().max(2_000).optional() }).strict(),
  'suppliers:list': list.extend({ withDebt: z.boolean().optional() }),
  'suppliers:get': z.object({ id }).strict(),
  'expenses:list': list.extend({ categoryId: id.optional(), from: date.optional(), to: date.optional() }),
  'expenseCategories:create': z.object({ name: text }).strict(),
  'expenseCategories:update': z.object({ id, name: text }).strict(),
  'expenseCategories:delete': z.object({ id }).strict(),
  'treasury:list': list.extend({ direction: z.enum(['IN', 'OUT']).optional(), type: z.string().max(50).optional(), from: date.optional(), to: date.optional() }),
  'treasury:summary': z.object({ from: date.optional(), to: date.optional() }).strict(),
  'returns:list': list.extend({ type: z.enum(['SALE_RETURN', 'PURCHASE_RETURN']).optional(), from: date.optional(), to: date.optional() }),
  'inventory:movements': list.extend({ productId: id.optional(), type: z.string().max(50).optional(), from: date.optional(), to: date.optional() }),
  'audit:list': list,
  'reports:sales': z.object({ from: date, to: date }).strict(),
  'reports:purchases': z.object({ from: date, to: date }).strict(),
  'reports:products': z.object({ from: date, to: date }).strict(),
  'reports:employees': z.object({ from: date, to: date }).strict(),
  'reports:treasury': z.object({ from: date, to: date }).strict(),
  'sales:delete': z.object({ id }).strict(),
  'purchases:delete': z.object({ id }).strict(),
  'sales:get': z.object({ id }).strict(),
  'purchases:get': z.object({ id }).strict(),
  'returns:get': z.object({ id }).strict(),
  'returns:create': z.object({
    type: z.enum(['SALE_RETURN', 'PURCHASE_RETURN']), saleId: id.optional(), purchaseId: id.optional(),
    items: z.array(z.object({ itemId: id, quantity, phoneUnitIds: z.array(id).max(100).optional() }).strict()).min(1).max(100),
    refundMethod: z.enum(['CASH', 'CREDIT']), restock: z.boolean(), reason: z.string().trim().max(2_000).optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.type === 'SALE_RETURN' && (!value.saleId || value.purchaseId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'مرجع فاتورة البيع غير صحيح' });
    if (value.type === 'PURCHASE_RETURN' && (!value.purchaseId || value.saleId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'مرجع فاتورة الشراء غير صحيح' });
  }),
  'inventory:adjust': z.object({ productId: id, newQuantity: z.number().int().min(0).max(10_000_000).optional(), change: z.number().int().min(-10_000_000).max(10_000_000).optional(), type: z.enum(['ADJUSTMENT', 'DAMAGE']), reason: z.string().trim().min(1).max(2_000).optional() }).strict().refine((value) => value.newQuantity != null || value.change != null, 'يجب تحديد الكمية الجديدة أو التغيير'),
  'treasury:manual': z.object({ type: z.enum(['WITHDRAWAL', 'DEPOSIT', 'OTHER_INCOME', 'OTHER_EXPENSE']), amount: money.positive(), method: method, note: z.string().trim().max(2_000).optional() }).strict(),
  'settings:set': z.object({ storeName: text.optional(), storePhone: z.string().max(40).optional(), storeAddress: z.string().max(500).optional(), currency: z.string().trim().min(1).max(10).optional(), invoiceFooter: z.string().max(500).optional(), lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(), autoBackup: z.boolean().optional(), autoBackupIntervalHours: z.number().int().min(1).max(24 * 30).optional(), printerWidth: z.enum(['80mm', 'A4']).optional(), taxEnabled: z.boolean().optional(), taxRate: z.number().finite().min(0).max(100).optional() }).strict(),
  'backup:create': z.object({ name: z.string().trim().max(80).optional() }).strict(),
  'backup:validate': z.object({ fullPath: z.string().min(1).max(500) }).strict(),
  'backup:restore': z.object({ fullPath: z.string().min(1).max(500) }).strict(),
};

export function validateRequest(channel: ApiChannel, raw: unknown): Record<string, unknown> {
  const result = (schemas[channel] ?? base).safeParse(raw ?? {});
  if (!result.success) throw new AppError('بيانات الطلب غير صالحة');
  return result.data as Record<string, unknown>;
}

export const listParamsSchema = page;
