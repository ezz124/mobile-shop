import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from './errors';
import type { TreasuryType } from '../../src/shared/ipc';

type Tx = Prisma.TransactionClient;

/** توليد رقم فاتورة تسلسلي آمن داخل معاملة */
export async function nextInvoiceNumber(tx: Tx, kind: 'sale' | 'purchase' | 'return'): Promise<string> {
  const prefix = kind === 'sale' ? 'S' : kind === 'purchase' ? 'P' : 'R';
  const counter = await tx.counter.upsert({
    where: { name: kind },
    update: { value: { increment: 1 } },
    create: { name: kind, value: 1 },
  });
  return `${prefix}-${String(counter.value).padStart(6, '0')}`;
}

/** تسجيل حركة صندوق — كل حركة مالية تمر من هنا */
export async function createTreasuryTx(
  tx: Tx,
  input: {
    direction: 'IN' | 'OUT';
    type: TreasuryType;
    amount: number;
    method?: string;
    referenceType?: string;
    referenceId?: number;
    note?: string;
    userId: number;
  }
): Promise<void> {
  if (input.amount <= 0) return;
  await tx.treasuryTransaction.create({
    data: {
      direction: input.direction,
      type: input.type,
      amount: input.amount,
      method: input.method ?? 'CASH',
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      note: input.note,
      userId: input.userId,
    },
  });
}

export async function audit(
  db: PrismaClient | Tx,
  session: { userId: number; username: string } | null,
  action: string,
  entity?: string,
  entityId?: string | number,
  details?: unknown
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: session?.userId ?? null,
      username: session?.username ?? null,
      action,
      entity: entity ?? null,
      entityId: entityId != null ? String(entityId) : null,
      details: details ? JSON.stringify(details).slice(0, 2000) : null,
    },
  });
}

export async function cashBalance(db: PrismaClient | Tx): Promise<number> {
  const agg = await db.treasuryTransaction.aggregate({
    _sum: { amount: true },
    where: { direction: 'IN' },
  });
  const out = await db.treasuryTransaction.aggregate({
    _sum: { amount: true },
    where: { direction: 'OUT' },
  });
  return (agg._sum.amount ?? 0) - (out._sum.amount ?? 0);
}

/** دين العميل = مجموع (فواتيره - مرتجعاته) - مدفوعاته */
export async function customerDebt(db: PrismaClient | Tx, customerId: number): Promise<number> {
  const sales = await db.sale.aggregate({
    _sum: { total: true, returnedAmount: true },
    where: { customerId },
  });
  const paid = await db.payment.aggregate({ _sum: { amount: true }, where: { customerId } });
  return (sales._sum.total ?? 0) - (sales._sum.returnedAmount ?? 0) - (paid._sum.amount ?? 0);
}

/** ذمة المورد = مجموع (مشترياته - مرتجعاته) - مدفوعاته */
export async function supplierBalance(db: PrismaClient | Tx, supplierId: number): Promise<number> {
  const purchases = await db.purchase.aggregate({
    _sum: { total: true, returnedAmount: true },
    where: { supplierId },
  });
  const paid = await db.payment.aggregate({ _sum: { amount: true }, where: { supplierId } });
  return (purchases._sum.total ?? 0) - (purchases._sum.returnedAmount ?? 0) - (paid._sum.amount ?? 0);
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError(message);
}
