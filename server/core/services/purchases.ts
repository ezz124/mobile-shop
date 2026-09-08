import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../errors';
import { nextInvoiceNumber, createTreasuryTx, audit } from '../helpers';
import type { CreatePurchaseInput, PurchaseRow } from '../../../src/shared/ipc';
import type { AuthSession } from '../auth';

export async function createPurchase(db: PrismaClient, input: CreatePurchaseInput, session: AuthSession) {
  if (!input.items?.length) throw new AppError('أضف منتجاً واحداً على الأقل إلى الفاتورة');
  if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) throw new AppError('لا يمكن تكرار المنتج نفسه في أكثر من بند داخل الفاتورة');

  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new AppError('المورد غير موجود');

    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const prepared: {
      productId: number; productName: string; quantity: number; unitCost: number; lineTotal: number;
      sellingPrice?: number | null; units: { imei1: string; imei2?: string; serialNumber?: string; warrantyMonths?: number }[];
    }[] = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new AppError('منتج غير موجود');
      if (item.unitCost < 0) throw new AppError(`سعر شراء غير صحيح للمنتج «${product.name}»`);

      let units: typeof prepared[number]['units'] = [];
      if (product.type === 'PHONE') {
        units = item.phoneUnits ?? [];
        if (units.length !== item.quantity) {
          throw new AppError(`أدخل بيانات ${item.quantity} جهاز/أجهزة IMEI للمنتج «${product.name}»`);
        }
        for (const u of units) {
          if (!u.imei1 || u.imei1.trim().length < 10) throw new AppError(`رقم IMEI غير صحيح لجهاز من «${product.name}»`);
        }
      }

      const qty = Math.floor(item.quantity);
      if (qty <= 0) throw new AppError(`كمية غير صحيحة للمنتج «${product.name}»`);

      const lineTotal = item.unitCost * qty;
      subtotal += lineTotal;
      prepared.push({
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitCost: item.unitCost,
        lineTotal,
        sellingPrice: item.sellingPrice ?? null,
        units,
      });
    }

    const discount = Math.max(0, Math.floor(input.discount ?? 0));
    if (discount > subtotal) throw new AppError('الخصم أكبر من إجمالي الفاتورة');
    const settings = await tx.setting.findMany({ where: { key: { in: ['taxEnabled', 'taxRate'] } } });
    const settingMap = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
    const taxRate = settingMap.taxEnabled === 'true' ? Math.max(0, Math.min(100, Number(settingMap.taxRate ?? 0))) : 0;
    const taxAmount = Math.round((subtotal - discount) * taxRate / 100);
    const total = subtotal - discount + taxAmount;
    const paidAmount = Math.max(0, Math.floor(input.paidAmount ?? 0));
    if (paidAmount > total) throw new AppError('المدفوع أكبر من إجمالي الفاتورة');

    const invoiceNumber = await nextInvoiceNumber(tx, 'purchase');
    const purchase = await tx.purchase.create({
      data: {
        invoiceNumber,
        supplierId: supplier.id,
        userId: session.userId,
        subtotal,
        discount,
        taxRate,
        taxAmount,
        total,
        paidAmount,
        note: input.note,
      },
    });

    for (const item of prepared) {
      const purchaseItem = await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitCost: item.unitCost,
          lineTotal: item.lineTotal,
        },
      });

      for (const unit of item.units) {
        await tx.phoneUnit.create({
          data: {
            productId: item.productId,
            imei1: unit.imei1.trim(),
            imei2: unit.imei2?.trim() || null,
            serialNumber: unit.serialNumber?.trim() || null,
            status: 'IN_STOCK',
            purchasePrice: item.unitCost,
            sellingPrice: item.sellingPrice ?? productMap.get(item.productId)!.sellingPrice,
            warrantyMonths: unit.warrantyMonths ?? productMap.get(item.productId)!.warrantyMonths ?? null,
            purchaseItemId: purchaseItem.id,
          },
        });
      }

      const product = productMap.get(item.productId)!;
      const newQty = product.quantity + item.quantity;
      await tx.product.update({
        where: { id: item.productId },
        data: {
          quantity: { increment: item.quantity },
          purchasePrice: item.unitCost,
          ...(item.sellingPrice != null ? { sellingPrice: item.sellingPrice } : {}),
        },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          type: 'PURCHASE',
          quantityChange: item.quantity,
          balanceAfter: newQty,
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          userId: session.userId,
        },
      });
    }

    if (paidAmount > 0) {
      const payment = await tx.payment.create({
        data: {
          kind: 'PURCHASE',
          purchaseId: purchase.id,
          supplierId: supplier.id,
          amount: paidAmount,
          method: 'CASH',
          userId: session.userId,
          note: 'دفعة عند الشراء',
        },
      });
      await createTreasuryTx(tx, {
        direction: 'OUT',
        type: 'PURCHASE_PAYMENT',
        amount: paidAmount,
        method: 'CASH',
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        note: `دفعة فاتورة شراء ${invoiceNumber}`,
        userId: session.userId,
      });
    }

    await audit(tx, session, 'إنشاء فاتورة شراء', 'Purchase', purchase.id, { invoiceNumber, total, paidAmount });

    return tx.purchase.findUnique({
      where: { id: purchase.id },
      include: { items: true, payments: true, supplier: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}

export async function deletePurchase(db: PrismaClient, purchaseId: number, session: AuthSession) {
  return db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: { items: { include: { product: true } }, returns: true },
    });
    if (!purchase) throw new AppError('الفاتورة غير موجودة');
    if (purchase.returns.length > 0) {
      throw new AppError('لا يمكن حذف فاتورة لها مرتجعات — احذف المرتجعات أولاً');
    }

    for (const item of purchase.items) {
      // الأجهزة المبيعة تمنع الحذف
      if (item.product.type === 'PHONE') {
        const units = await tx.phoneUnit.findMany({ where: { purchaseItemId: item.id } });
        const sold = units.filter((u) => u.status === 'SOLD');
        if (sold.length > 0) {
          throw new AppError(`لا يمكن حذف الفاتورة: ${sold.length} جهاز من «${item.productName}» تم بيعه`);
        }
        await tx.phoneUnit.deleteMany({ where: { purchaseItemId: item.id } });
      }
      const returnQty = item.returnedQuantity;
      const restore = item.quantity - returnQty;
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (product && restore > 0) {
        if (product.quantity < restore) {
          throw new AppError(`لا يمكن الحذف: كمية «${item.productName}» الحالية (${product.quantity}) أقل من الكمية المطلوب عكسها (${restore})`);
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: restore } },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'ADJUSTMENT',
            quantityChange: -restore,
            balanceAfter: product.quantity - restore,
            referenceType: 'PURCHASE_DELETE',
            referenceId: purchase.id,
            note: `عكس مخزون عند حذف فاتورة الشراء ${purchase.invoiceNumber}`,
            userId: session.userId,
          },
        });
      }
    }

    const payments = await tx.payment.findMany({ where: { purchaseId: purchase.id } });
    for (const p of payments) {
      await tx.treasuryTransaction.deleteMany({ where: { referenceType: 'PAYMENT', referenceId: p.id } });
    }
    await tx.payment.deleteMany({ where: { purchaseId: purchase.id } });

    await audit(tx, session, 'حذف فاتورة شراء', 'Purchase', purchase.id, {
      invoiceNumber: purchase.invoiceNumber,
      total: purchase.total,
    });
    await tx.purchase.delete({ where: { id: purchase.id } });
    return { ok: true };
  });
}

export async function addPurchasePayment(
  db: PrismaClient,
  purchaseId: number,
  amount: number,
  method: string,
  note: string | undefined,
  session: AuthSession
) {
  return db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { payments: true } });
    if (!purchase) throw new AppError('الفاتورة غير موجودة');
    const paid = purchase.payments.reduce((s, p) => s + p.amount, 0);
    const remaining = purchase.total - purchase.returnedAmount - paid;
    if (amount <= 0) throw new AppError('أدخل مبلغاً صحيحاً');
    if (amount > remaining) throw new AppError(`المبلغ يتجاوز المتبقي للمورد (${remaining})`);

    const payment = await tx.payment.create({
      data: {
        kind: 'SUPPLIER',
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        amount,
        method,
        userId: session.userId,
        note: note ?? 'دفعة لمورد',
      },
    });
    await tx.purchase.update({ where: { id: purchase.id }, data: { paidAmount: { increment: amount } } });
    await createTreasuryTx(tx, {
      direction: 'OUT',
      type: 'SUPPLIER_PAYMENT',
      amount,
      method,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      note: `دفعة لفاتورة شراء ${purchase.invoiceNumber}`,
      userId: session.userId,
    });
    await audit(tx, session, 'دفعة لمورد', 'Purchase', purchase.id, { amount, method });

    return tx.purchase.findUnique({ where: { id: purchaseId }, include: { items: true, payments: true, supplier: true } });
  });
}

export function toPurchaseRow(p: Prisma.PurchaseGetPayload<{ include: { items: true } }>): PurchaseRow {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    itemCount: p.items.length,
    items: undefined,
  } as unknown as PurchaseRow;
}
