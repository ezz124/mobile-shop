import { PrismaClient } from '@prisma/client';
import { startOfDay, addDays, cashBalance, customerDebtHelpers } from './report-helpers';
import type {
  DashboardData, SalesReportData, ProductReportRow, EmployeeReportRow,
  TreasuryReportData, DebtsReportData, InventoryReportData, TreasuryType, SaleRow, PurchaseRow,
} from '../../../src/shared/ipc';
import { saleProfit, toSaleRow } from './sales';
import { toPurchaseRow } from './purchases';

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getDashboard(db: PrismaClient): Promise<DashboardData> {
  const now = new Date();
  const thresholdRow = await db.setting.findUnique({ where: { key: 'lowStockThreshold' } });
  const globalLowStockThreshold = Math.max(0, Number(thresholdRow?.value ?? 3) || 3);
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const chartStart = addDays(today, -13);

  const [todaySalesAgg, todaySalesCount, todayPurchasesAgg, balance, productAgg, lowStockCount, todaySalesRaw, chartSalesRaw, monthSalesRaw, recentSales, recentPurchases, bestSellerGroups, productNames] =
    await Promise.all([
      db.sale.aggregate({ _sum: { total: true, returnedAmount: true }, where: { createdAt: { gte: today, lt: tomorrow } } }),
      db.sale.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      db.purchase.aggregate({ _sum: { total: true, returnedAmount: true }, where: { createdAt: { gte: today, lt: tomorrow } } }),
      cashBalance(db),
      db.product.aggregate({ _count: { _all: true }, _sum: { quantity: true }, where: { isActive: true } }),
      db.product.count({ where: { isActive: true, OR: [
        { quantity: { lte: db.product.fields.minStock } },
        { quantity: { lte: globalLowStockThreshold } },
      ] } }),
      db.sale.findMany({
        where: { createdAt: { gte: today, lt: tomorrow } },
        include: { items: true },
      }),
      db.sale.findMany({
        where: { createdAt: { gte: chartStart, lt: tomorrow } },
        include: { items: true },
      }),
      db.sale.findMany({
        where: { createdAt: { gte: monthStart, lt: tomorrow } },
        include: { items: true },
      }),
      db.sale.findMany({ include: { items: true, customer: true, user: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
      db.purchase.findMany({ include: { items: true, supplier: true, user: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
      db.saleItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true, lineTotal: true, lineCost: true, returnedQuantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      db.product.findMany({ select: { id: true, name: true } }),
    ]);

  const todayProfit = todaySalesRaw.reduce((s, sale) => s + saleProfit(sale), 0);
  const monthProfit = monthSalesRaw.reduce((s, sale) => s + saleProfit(sale), 0);
  const monthSalesTotal = monthSalesRaw.reduce((s, sale) => s + sale.total - sale.returnedAmount, 0);

  // مخطط آخر 14 يوماً
  const chartMap = new Map<string, { total: number; profit: number }>();
  for (let i = 0; i < 14; i++) {
    chartMap.set(fmtDate(addDays(chartStart, i)), { total: 0, profit: 0 });
  }
  for (const sale of chartSalesRaw) {
    const key = fmtDate(sale.createdAt);
    const entry = chartMap.get(key);
    if (entry) {
      entry.total += sale.total - sale.returnedAmount;
      entry.profit += saleProfit(sale);
    }
  }

  const nameMap = new Map(productNames.map((p) => [p.id, p.name]));
  const bestSellers = bestSellerGroups.map((g) => ({
    productId: g.productId,
    name: nameMap.get(g.productId) ?? '—',
    quantity: g._sum.quantity ?? 0,
    revenue: g._sum.lineTotal ?? 0,
    profit: Math.round(((g._sum.lineTotal ?? 0) - (g._sum.lineCost ?? 0)) *
      (1 - (g._sum.returnedQuantity ?? 0) / Math.max(1, g._sum.quantity ?? 1))),
  }));

  const { customersDebt, suppliersDebt } = await customerDebtHelpers(db);

  return {
    todaySales: (todaySalesAgg._sum.total ?? 0) - (todaySalesAgg._sum.returnedAmount ?? 0),
    todaySalesCount: todaySalesCount,
    todayPurchases: (todayPurchasesAgg._sum.total ?? 0) - (todayPurchasesAgg._sum.returnedAmount ?? 0),
    todayProfit,
    cashBalance: balance,
    totalProducts: productAgg._count._all,
    totalUnits: productAgg._sum.quantity ?? 0,
    lowStockCount,
    customersDebt,
    suppliersDebt,
    recentSales: recentSales.map(toSaleRow),
    recentPurchases: recentPurchases.map(toPurchaseRow),
    bestSellers,
    salesChart: [...chartMap.entries()].map(([date, v]) => ({ date, total: Math.round(v.total), profit: Math.round(v.profit) })),
    monthSales: monthSalesTotal,
    monthProfit,
  };
}

export async function salesReport(db: PrismaClient, from: Date, to: Date): Promise<SalesReportData> {
  const sales = await db.sale.findMany({
    where: { createdAt: { gte: from, lt: to } },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  });
  const payments = await db.payment.findMany({
    where: { saleId: { not: null }, createdAt: { gte: from, lt: to } },
  });

  const dayMap = new Map<string, { count: number; total: number; profit: number; discounts: number; returns: number }>();
  for (const sale of sales) {
    const key = fmtDate(sale.createdAt);
    const entry = dayMap.get(key) ?? { count: 0, total: 0, profit: 0, discounts: 0, returns: 0 };
    entry.count += 1;
    entry.total += sale.total - sale.returnedAmount;
    entry.profit += saleProfit(sale);
    entry.discounts += sale.discount;
    entry.returns += sale.returnedAmount;
    dayMap.set(key, entry);
  }

  const methodMap = new Map<string, number>();
  for (const p of payments) methodMap.set(p.method, (methodMap.get(p.method) ?? 0) + p.amount);

  const rows = [...dayMap.entries()].map(([date, v]) => ({
    date, count: v.count, total: v.total, profit: Math.round(v.profit), discounts: v.discounts, returns: v.returns,
  }));

  return {
    rows,
    totals: {
      count: sales.length,
      total: sales.reduce((s, x) => s + x.total - x.returnedAmount, 0),
      profit: Math.round(sales.reduce((s, x) => s + saleProfit(x), 0)),
      discounts: sales.reduce((s, x) => s + x.discount, 0),
      returns: sales.reduce((s, x) => s + x.returnedAmount, 0),
    },
    paymentBreakdown: [...methodMap.entries()].map(([method, total]) => ({ method, total })),
  };
}

export async function purchasesReport(db: PrismaClient, from: Date, to: Date) {
  const purchases = await db.purchase.findMany({
    where: { createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: 'asc' },
  });
  const dayMap = new Map<string, { count: number; total: number }>();
  for (const p of purchases) {
    const key = fmtDate(p.createdAt);
    const entry = dayMap.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += p.total - p.returnedAmount;
    dayMap.set(key, entry);
  }
  return {
    rows: [...dayMap.entries()].map(([date, v]) => ({ date, count: v.count, total: v.total })),
    totals: { count: purchases.length, total: purchases.reduce((s, p) => s + p.total - p.returnedAmount, 0) },
  };
}

export async function productsReport(db: PrismaClient, from: Date, to: Date): Promise<ProductReportRow[]> {
  const groups = await db.saleItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true, lineTotal: true, lineCost: true, returnedQuantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
  });
  const salesInRange = await db.sale.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { id: true },
  });
  const saleIds = new Set(salesInRange.map((s) => s.id));
  const names = await db.product.findMany({ select: { id: true, name: true } });
  const nameMap = new Map(names.map((n) => [n.id, n.name]));

  // التصفية حسب النطاق الزمني تتطلب تفاصيل البنود
  const items = await db.saleItem.findMany({
    where: { saleId: { in: [...saleIds] } },
    select: { productId: true, quantity: true, lineTotal: true, lineCost: true, returnedQuantity: true },
  });
  const agg = new Map<number, { quantitySold: number; revenue: number; profit: number; quantityReturned: number }>();
  for (const it of items) {
    const entry = agg.get(it.productId) ?? { quantitySold: 0, revenue: 0, profit: 0, quantityReturned: 0 };
    entry.quantitySold += it.quantity;
    entry.revenue += it.lineTotal;
    entry.profit += Math.round((it.lineTotal - it.lineCost) * (1 - it.returnedQuantity / Math.max(1, it.quantity)));
    entry.quantityReturned += it.returnedQuantity;
    agg.set(it.productId, entry);
  }
  void groups;
  return [...agg.entries()]
    .map(([productId, v]) => ({ productId, name: nameMap.get(productId) ?? '—', ...v }))
    .sort((a, b) => b.quantitySold - a.quantitySold);
}

export async function employeesReport(db: PrismaClient, from: Date, to: Date): Promise<EmployeeReportRow[]> {
  const sales = await db.sale.findMany({
    where: { createdAt: { gte: from, lt: to } },
    include: { items: true, user: true },
  });
  const map = new Map<number, { name: string; salesCount: number; total: number; profit: number }>();
  for (const sale of sales) {
    const entry = map.get(sale.userId) ?? { name: sale.user?.fullName ?? `مستخدم #${sale.userId}`, salesCount: 0, total: 0, profit: 0 };
    entry.salesCount += 1;
    entry.total += sale.total - sale.returnedAmount;
    entry.profit += saleProfit(sale);
    map.set(sale.userId, entry);
  }
  return [...map.entries()]
    .map(([userId, v]) => ({ userId, ...v, profit: Math.round(v.profit) }))
    .sort((a, b) => b.total - a.total);
}

export async function treasuryReport(db: PrismaClient, from?: Date, to?: Date): Promise<TreasuryReportData> {
  const where = from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {};
  const txs = await db.treasuryTransaction.findMany({
    where,
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const grouped = await db.treasuryTransaction.groupBy({
    by: ['type', 'direction'],
    _sum: { amount: true },
    where,
  });
  const totalIn = txs.filter((t) => t.direction === 'IN').reduce((s, t) => s + t.amount, 0);
  const totalOut = txs.filter((t) => t.direction === 'OUT').reduce((s, t) => s + t.amount, 0);

  return {
    balance: totalIn - totalOut,
    totalIn,
    totalOut,
    byType: grouped.map((g) => ({
      type: g.type as TreasuryType,
      direction: g.direction as 'IN' | 'OUT',
      total: g._sum.amount ?? 0,
    })),
    rows: txs.slice(0, 500).map((t) => ({
      ...t,
      direction: t.direction as 'IN' | 'OUT',
      type: t.type as TreasuryType,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export async function debtsReport(db: PrismaClient): Promise<DebtsReportData> {
  const salesGroups = await db.sale.groupBy({
    by: ['customerId'],
    _sum: { total: true, returnedAmount: true },
    _count: { _all: true },
    where: { customerId: { not: null } },
  });
  const customerPayments = await db.payment.groupBy({
    by: ['customerId'],
    _sum: { amount: true },
    where: { customerId: { not: null } },
  });
  const customers = await db.customer.findMany({ select: { id: true, name: true, phone: true } });

  const custMap = new Map(customers.map((c) => [c.id, c]));
  const customerRows: DebtsReportData['customers'] = [];
  for (const g of salesGroups) {
    if (g.customerId == null) continue;
    const paid = customerPayments.find((p) => p.customerId === g.customerId)?._sum.amount ?? 0;
    const debt = (g._sum.total ?? 0) - (g._sum.returnedAmount ?? 0) - paid;
    if (debt > 0) {
      const c = custMap.get(g.customerId);
      customerRows.push({
        id: g.customerId,
        name: c?.name ?? `عميل #${g.customerId}`,
        phone: c?.phone ?? null,
        debt,
        salesCount: g._count._all,
      });
    }
  }
  customerRows.sort((a, b) => b.debt - a.debt);

  const purchaseGroups = await db.purchase.groupBy({
    by: ['supplierId'],
    _sum: { total: true, returnedAmount: true },
    _count: { _all: true },
  });
  const supplierPayments = await db.payment.groupBy({
    by: ['supplierId'],
    _sum: { amount: true },
    where: { supplierId: { not: null } },
  });
  const suppliers = await db.supplier.findMany({ select: { id: true, name: true, phone: true } });
  const supMap = new Map(suppliers.map((s) => [s.id, s]));

  const supplierRows: DebtsReportData['suppliers'] = [];
  for (const g of purchaseGroups) {
    const paid = supplierPayments.find((p) => p.supplierId === g.supplierId)?._sum.amount ?? 0;
    const balance = (g._sum.total ?? 0) - (g._sum.returnedAmount ?? 0) - paid;
    if (balance > 0) {
      const s = supMap.get(g.supplierId);
      supplierRows.push({
        id: g.supplierId,
        name: s?.name ?? `مورد #${g.supplierId}`,
        phone: s?.phone ?? null,
        balance,
        purchasesCount: g._count._all,
      });
    }
  }
  supplierRows.sort((a, b) => b.balance - a.balance);

  return { customers: customerRows, suppliers: supplierRows };
}

export async function inventoryReport(db: PrismaClient): Promise<InventoryReportData> {
  const thresholdRow = await db.setting.findUnique({ where: { key: 'lowStockThreshold' } });
  const globalLowStockThreshold = Math.max(0, Number(thresholdRow?.value ?? 3) || 3);
  const products = await db.product.findMany({
    where: { isActive: true },
    orderBy: { quantity: 'asc' },
  });
  const stockValue = products.reduce((s, p) => s + p.quantity * p.purchasePrice, 0);
  const retailValue = products.reduce((s, p) => s + p.quantity * p.sellingPrice, 0);
  const lowStock = products
    .filter((p) => p.quantity <= Math.max(p.minStock, globalLowStockThreshold))
    .slice(0, 100)
    .map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, minStock: p.minStock, type: p.type }));

  return {
    totalProducts: products.length,
    totalUnits: products.reduce((s, p) => s + p.quantity, 0),
    stockValue,
    retailValue,
    lowStock,
    outOfStock: products.filter((p) => p.quantity === 0).length,
  };
}
