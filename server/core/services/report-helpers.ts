import { PrismaClient } from '@prisma/client';
import { startOfDay, addDays, cashBalance } from '../helpers';

export { startOfDay, addDays, cashBalance };

/** مجموع ديون العملاء ومجموع ذمم الموردين (للعرض في لوحة التحكم) */
export async function customerDebtHelpers(db: PrismaClient): Promise<{ customersDebt: number; suppliersDebt: number }> {
  const salesAgg = await db.sale.aggregate({
    _sum: { total: true, returnedAmount: true },
    where: { customerId: { not: null } },
  });
  const customerPaid = await db.payment.aggregate({
    _sum: { amount: true },
    where: { customerId: { not: null } },
  });

  const purchaseAgg = await db.purchase.aggregate({
    _sum: { total: true, returnedAmount: true },
  });
  const supplierPaid = await db.payment.aggregate({
    _sum: { amount: true },
    where: { supplierId: { not: null } },
  });

  return {
    customersDebt: Math.max(0, (salesAgg._sum.total ?? 0) - (salesAgg._sum.returnedAmount ?? 0) - (customerPaid._sum.amount ?? 0)),
    suppliersDebt: Math.max(0, (purchaseAgg._sum.total ?? 0) - (purchaseAgg._sum.returnedAmount ?? 0) - (supplierPaid._sum.amount ?? 0)),
  };
}
