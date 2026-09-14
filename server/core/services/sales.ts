import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../errors';
import { nextInvoiceNumber, createTreasuryTx, audit } from '../helpers';
import type { CreateSaleInput, SaleRow } from '../../../src/shared/ipc';
import type { AuthSession } from '../auth';

type Tx = Prisma.TransactionClient;

export async function createSale(db: PrismaClient, input: CreateSaleInput, session: AuthSession) {
  if (!input.items?.length) throw new AppError('أضف منتجاً واحداً على الأقل إلى الفاتورة');
  if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) {
    throw new AppError('لا يمكن تكرار المنتج نفسه في أكثر من بند داخل الفاتورة');
  }

  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const preparedItems: {
      productId: number;
      productName: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      discount: number;
      lineTotal: number;
      lineCost: number;
      phoneUnitIds: number[];
    }[] = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new AppError('منتج غير موجود في الفاتورة');
      if (!product.isActive) throw new AppError(`المنتج «${product.name}» غير مفعّل`);

      const qty = Math.floor(item.quantity);
      if (qty <= 0) throw new AppError(`كمية غير صحيحة للمنتج «${product.name}»`);
      if (item.unitPrice < 0) throw new AppError(`سعر غير صحيح للمنتج «${product.name}»`);

      let unitCost = product.purchasePrice;
      let phoneUnitIds: number[] = [];

      if (product.type === 'PHONE') {
        phoneUnitIds = item.phoneUnitIds ?? [];
        if (phoneUnitIds.length !== qty) {
          throw new AppError(`اختر ${qty} جهاز/أجهزة بالـ IMEI للمنتج «${product.name}» (تم اختيار ${phoneUnitIds.length})`);
        }
        if (new Set(phoneUnitIds).size !== phoneUnitIds.length) throw new AppError('لا يمكن اختيار جهاز IMEI أكثر من مرة');
        const units = await tx.phoneUnit.findMany({ where: { id: { in: phoneUnitIds } } });
        for (const unit of units) {
          if (unit.productId !== product.id) throw new AppError('جهاز IMEI لا يتبع هذا المنتج');
          if (unit.status !== 'IN_STOCK') throw new AppError(`الجهاز ${unit.imei1} غير متوفر في المخزون`);
          if (unit.purchasePrice != null) unitCost = Math.min(unitCost, unit.purchasePrice);
        }
        unitCost = units.length ? Math.round(units.reduce((s, u) => s + (u.purchasePrice ?? product.purchasePrice), 0) / units.length) : unitCost;
      } else {
        if (product.quantity < qty) {
          throw new AppError(`الكمية المتوفرة من «${product.name}» هي ${product.quantity} فقط`);
        }
      }

      const lineGross = item.unitPrice * qty;
      const lineDiscount = Math.max(0, Math.floor(item.discount ?? 0));
      if (lineDiscount > lineGross) throw new AppError(`الخصم أكبر من قيمة «${product.name}»`);
      const lineTotal = lineGross - lineDiscount;

      subtotal += lineTotal;
      preparedItems.push({
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice: item.unitPrice,
        unitCost,
        discount: lineDiscount,
        lineTotal,
        lineCost: unitCost * qty,
        phoneUnitIds,
      });
    }

    const discount = Math.max(0, Math.floor(input.discount ?? 0));
    if (discount > subtotal) throw new AppError('خصم الفاتورة أكبر من إجماليها');
    const settings = await tx.setting.findMany({ where: { key: { in: ['taxEnabled', 'taxRate'] } } });
    const settingMap = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
    const taxRate = settingMap.taxEnabled === 'true' ? Math.max(0, Math.min(100, Number(settingMap.taxRate ?? 0))) : 0;
    const taxAmount = Math.round((subtotal - discount) * taxRate / 100);
    const total = subtotal - discount + taxAmount;

    const paidAmount = Math.max(0, Math.floor(input.paidAmount ?? 0));
    if (paidAmount > total) throw new AppError('المبلغ المدفوع أكبر من إجمالي الفاتورة');
    const remaining = total - paidAmount;
    if (remaining > 0 && !input.customerId) {
      throw new AppError('لا يمكن ترك مبلغ متبقٍ بدون اختيار عميل (بيع بالدين يتطلب عميلاً)');
    }

    let customerId: number | null = null;
    if (input.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new AppError('العميل غير موجود');
      customerId = customer.id;
    }

    const invoiceNumber = await nextInvoiceNumber(tx, 'sale');

    const sale = await tx.sale.create({
      data: {
        invoiceNumber,
        customerId,
        userId: session.userId,
        subtotal,
        discount,
        taxRate,
        taxAmount,
        total,
        paidAmount,
        status: 'COMPLETED',
        paymentMethod: input.paymentMethod ?? 'CASH',
        note: input.note,
      },
    });

    for (const item of preparedItems) {
      const saleItem = await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          discount: item.discount,
          lineTotal: item.lineTotal,
          lineCost: item.lineCost,
        },
      });

      const product = productMap.get(item.productId)!;
      if (product.type === 'PHONE') {
        const updatedUnits = await tx.phoneUnit.updateMany({
          where: { id: { in: item.phoneUnitIds }, productId: item.productId, status: 'IN_STOCK' },
          data: { status: 'SOLD', saleItemId: saleItem.id, soldAt: new Date(), sellingPrice: item.unitPrice },
        });
        if (updatedUnits.count !== item.quantity) throw new AppError('أحد أجهزة IMEI لم يعد متاحًا، حدّث الفاتورة وحاول مرة أخرى');
      }

      const stockUpdate = await tx.product.updateMany({
        where: { id: item.productId, quantity: { gte: item.quantity } },
        data: { quantity: { decrement: item.quantity } },
      });
      if (stockUpdate.count !== 1) throw new AppError(`المخزون تغيّر للمنتج «${item.productName}»؛ حدّث الفاتورة وحاول مرة أخرى`);

      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          type: 'SALE',
          quantityChange: -item.quantity,
          balanceAfter: product.quantity - item.quantity,
          referenceType: 'SALE',
          referenceId: sale.id,
          userId: session.userId,
        },
      });
    }

    if (paidAmount > 0) {
      const payment = await tx.payment.create({
        data: {
          kind: 'SALE',
          saleId: sale.id,
          customerId,
          amount: paidAmount,
          method: input.paymentMethod ?? 'CASH',
          userId: session.userId,
          note: 'دفعة عند البيع',
        },
      });
      await createTreasuryTx(tx, {
        direction: 'IN',
        type: 'SALE_INCOME',
        amount: paidAmount,
        method: input.paymentMethod ?? 'CASH',
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        note: `تحصيل فاتورة بيع ${invoiceNumber}`,
        userId: session.userId,
      });
    }

    await audit(tx, session, 'إنشاء فاتورة بيع', 'Sale', sale.id, { invoiceNumber, total, paidAmount });

    return tx.sale.findUnique({
      where: { id: sale.id },
      include: {
        items: { include: { product: { select: { id: true, name: true } } } },
        customer: true,
        payments: true,
        user: { select: { id: true, fullName: true, username: true } },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}

/** حذف فاتورة بيع مع عكس كل آثارها (مخزون، صندوق، ديون، أجهزة) */
export async function deleteSale(db: PrismaClient, saleId: number, session: AuthSession) {
  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: true, returns: true },
    });
    if (!sale) throw new AppError('الفاتورة غير موجودة');
    if (sale.returns.length > 0) {
      throw new AppError('لا يمكن حذف فاتورة لها مرتجعات — احذف المرتجعات المرتبطة أولاً');
    }

    for (const item of sale.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { increment: item.quantity - item.returnedQuantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          type: 'ADJUSTMENT',
          quantityChange: item.quantity - item.returnedQuantity,
          balanceAfter: product.quantity + (item.quantity - item.returnedQuantity),
          referenceType: 'SALE_DELETE',
          referenceId: sale.id,
          note: `عكس مخزون عند حذف الفاتورة ${sale.invoiceNumber}`,
          userId: session.userId,
        },
      });
    }

    // إعادة الأجهزة للمخزون
    await tx.phoneUnit.updateMany({
      where: { saleItemId: { in: sale.items.map((i) => i.id) }, status: 'SOLD' },
      data: { status: 'IN_STOCK', saleItemId: null, soldAt: null },
    });

    // حذف الحركات المالية المرتبطة
    const payments = await tx.payment.findMany({ where: { saleId: sale.id } });
    for (const p of payments) {
      await tx.treasuryTransaction.deleteMany({
        where: { referenceType: 'PAYMENT', referenceId: p.id },
      });
    }
    await tx.payment.deleteMany({ where: { saleId: sale.id } });

    await audit(tx, session, 'حذف فاتورة بيع', 'Sale', sale.id, {
      invoiceNumber: sale.invoiceNumber,
      total: sale.total,
    });

    await tx.sale.delete({ where: { id: sale.id } });
    return { ok: true };
  }, { timeout: 30000 });
}

export async function addSalePayment(
  db: PrismaClient,
  saleId: number,
  amount: number,
  method: string,
  note: string | undefined,
  session: AuthSession
) {
  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { payments: true } });
    if (!sale) throw new AppError('الفاتورة غير موجودة');
    const paid = sale.payments.reduce((s, p) => s + p.amount, 0);
    const remaining = sale.total - sale.returnedAmount - paid;
    if (amount <= 0) throw new AppError('أدخل مبلغاً صحيحاً');
    if (amount > remaining) throw new AppError(`المبلغ يتجاوز المتبقي على الفاتورة (${remaining})`);

    const payment = await tx.payment.create({
      data: {
        kind: 'SALE',
        saleId: sale.id,
        customerId: sale.customerId,
        amount,
        method,
        userId: session.userId,
        note: note ?? 'تحصيل دفعة',
      },
    });
    await tx.sale.update({
      where: { id: sale.id },
      data: { paidAmount: { increment: amount } },
    });
    await createTreasuryTx(tx, {
      direction: 'IN',
      type: 'CUSTOMER_PAYMENT',
      amount,
      method,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      note: `تحصيل دفعة على فاتورة ${sale.invoiceNumber}`,
      userId: session.userId,
    });
    await audit(tx, session, 'تحصيل دفعة بيع', 'Sale', sale.id, { amount, method });

    return tx.sale.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true, customer: true },
    });
  });
}

/** ربح الفاتورة = مجموع أرباح بنودها بعد استثناء المرتجع */
export function saleProfit(sale: { items: { lineTotal: number; lineCost: number; quantity: number; returnedQuantity: number }[] }): number {
  return sale.items.reduce((sum, it) => {
    const kept = Math.max(0, it.quantity - it.returnedQuantity);
    const unitNet = it.lineTotal / it.quantity;
    const unitCost = it.lineCost / it.quantity;
    return sum + Math.round(unitNet * kept - unitCost * kept);
  }, 0);
}

export function remainingOf(sale: { total: number; returnedAmount: number; paidAmount: number }): number {
  return Math.max(0, sale.total - sale.returnedAmount - sale.paidAmount);
}

export type SaleWithItems = Prisma.SaleGetPayload<{ include: { items: true } }>;
export function toSaleRow(sale: SaleWithItems): SaleRow {
  return {
    ...sale,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
    remaining: remainingOf(sale),
    itemCount: sale.items.length,
    profit: saleProfit(sale),
    items: undefined,
  } as unknown as SaleRow;
}
