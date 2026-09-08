import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../errors';
import { nextInvoiceNumber, createTreasuryTx, audit } from '../helpers';
import { allocateInvoiceAmount, cashRefundDue, returnedPartAmount } from '../../../src/shared/invoice';
import type { CreateReturnInput } from '../../../src/shared/ipc';
import type { AuthSession } from '../auth';

export async function createReturn(db: PrismaClient, input: CreateReturnInput, session: AuthSession) {
  if (!input.items?.length) throw new AppError('اختر بنداً واحداً على الأقل للإرجاع');
  if (new Set(input.items.map((item) => item.itemId)).size !== input.items.length) throw new AppError('لا يمكن تكرار بند الفاتورة في طلب المرتجع');

  return db.$transaction(async (tx) => {
    const isSale = input.type === 'SALE_RETURN';
    if ((isSale && !input.saleId) || (!isSale && !input.purchaseId)) throw new AppError('مرجع الفاتورة للمرتجع غير صحيح');
    const sale = isSale ? await tx.sale.findUnique({ where: { id: input.saleId! }, include: { items: true } }) : null;
    const purchase = !isSale ? await tx.purchase.findUnique({ where: { id: input.purchaseId! }, include: { items: true } }) : null;
    if (isSale && !sale) throw new AppError('فاتورة البيع غير موجودة');
    if (!isSale && !purchase) throw new AppError('فاتورة الشراء غير موجودة');
    if (!isSale && input.refundMethod === 'CREDIT' && !purchase!.supplierId) throw new AppError('فاتورة الشراء بلا مورد');

    const sourceItems = isSale ? sale!.items : purchase!.items;
    const discountByItem = allocateInvoiceAmount(sourceItems, isSale ? sale!.discount : purchase!.discount);
    const taxByItem = allocateInvoiceAmount(sourceItems, isSale ? sale!.taxAmount : purchase!.taxAmount);
    const nextReturned = new Map(sourceItems.map((item) => [item.id, item.returnedQuantity]));
    const invoiceNumber = await nextInvoiceNumber(tx, 'return');
    const ret = await tx.return.create({ data: {
      invoiceNumber, type: input.type, saleId: sale?.id ?? null, purchaseId: purchase?.id ?? null,
      customerId: sale?.customerId ?? null, supplierId: purchase?.supplierId ?? null, userId: session.userId,
      refundMethod: input.refundMethod, restock: input.restock, reason: input.reason, total: 0,
    } });

    let totalRefund = 0;
    for (const line of input.items) {
      const item = sourceItems.find((source) => source.id === line.itemId);
      if (!item) throw new AppError('بند غير موجود في الفاتورة');
      const qty = Math.floor(line.quantity);
      const returnable = item.quantity - item.returnedQuantity;
      if (qty <= 0 || qty > returnable) throw new AppError(`الكمية القابلة للإرجاع من «${item.productName}» هي ${returnable} فقط`);

      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new AppError('منتج غير موجود');
      const unitIds = line.phoneUnitIds ?? [];
      if (product.type === 'PHONE') {
        if (unitIds.length !== qty || new Set(unitIds).size !== unitIds.length) throw new AppError(`اختر ${qty} جهاز IMEI صحيحًا للبند «${item.productName}»`);
        const validUnits = await tx.phoneUnit.count({ where: isSale
          ? { id: { in: unitIds }, productId: item.productId, saleItemId: item.id, status: 'SOLD' }
          : { id: { in: unitIds }, productId: item.productId, purchaseItemId: item.id, status: 'IN_STOCK' },
        });
        if (validUnits !== qty) throw new AppError('أحد أجهزة IMEI لا يتبع هذا البند أو لم يعد متاحًا للإرجاع');
      } else if (unitIds.length > 0) throw new AppError('لا تُرسل أرقام IMEI مع ملحقات الهاتف');

      const netLineTotal = item.lineTotal - (discountByItem.get(item.id) ?? 0) + (taxByItem.get(item.id) ?? 0);
      const lineRefund = returnedPartAmount(netLineTotal, item.quantity, item.returnedQuantity, qty);
      totalRefund += lineRefund;
      nextReturned.set(item.id, item.returnedQuantity + qty);
      await tx.returnItem.create({ data: {
        returnId: ret.id, saleItemId: isSale ? item.id : null, purchaseItemId: !isSale ? item.id : null,
        productId: item.productId, productName: item.productName, quantity: qty,
        unitPrice: Math.floor(netLineTotal / item.quantity), lineTotal: lineRefund,
      } });

      if (isSale) {
        await tx.saleItem.update({ where: { id: item.id }, data: { returnedQuantity: { increment: qty } } });
        if (product.type === 'PHONE') {
          const updated = await tx.phoneUnit.updateMany({ where: { id: { in: unitIds }, productId: item.productId, saleItemId: item.id, status: 'SOLD' },
            data: input.restock ? { status: 'IN_STOCK', saleItemId: null, soldAt: null } : { status: 'RETURNED' } });
          if (updated.count !== qty) throw new AppError('تعذر تحديث أجهزة المرتجع؛ حدّث الفاتورة وحاول مرة أخرى');
        }
        if (input.restock) {
          await tx.product.update({ where: { id: item.productId }, data: { quantity: { increment: qty } } });
          await tx.inventoryMovement.create({ data: { productId: item.productId, type: 'RETURN_IN', quantityChange: qty,
            balanceAfter: product.quantity + qty, referenceType: 'RETURN', referenceId: ret.id, userId: session.userId } });
        }
      } else {
        const stock = await tx.product.updateMany({ where: { id: item.productId, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } });
        if (stock.count !== 1) throw new AppError(`لا يوجد مخزون كافٍ لإرجاع «${item.productName}»`);
        await tx.purchaseItem.update({ where: { id: item.id }, data: { returnedQuantity: { increment: qty } } });
        if (product.type === 'PHONE') {
          const updated = await tx.phoneUnit.updateMany({ where: { id: { in: unitIds }, productId: item.productId, purchaseItemId: item.id, status: 'IN_STOCK' }, data: { status: 'RETURNED' } });
          if (updated.count !== qty) throw new AppError('تعذر تحديث أجهزة المرتجع؛ حدّث الفاتورة وحاول مرة أخرى');
        }
        await tx.inventoryMovement.create({ data: { productId: item.productId, type: 'RETURN_OUT', quantityChange: -qty,
          balanceAfter: product.quantity - qty, referenceType: 'RETURN', referenceId: ret.id, userId: session.userId } });
      }
    }

    if (isSale) {
      const allReturned = sourceItems.every((item) => (nextReturned.get(item.id) ?? 0) >= item.quantity);
      await tx.sale.update({ where: { id: sale!.id }, data: { returnedAmount: { increment: totalRefund }, status: allReturned ? 'RETURNED' : 'PARTIALLY_RETURNED' } });
      const cashRefund = cashRefundDue(sale!.total, sale!.paidAmount, sale!.returnedAmount, totalRefund);
      if (input.refundMethod === 'CASH') await createTreasuryTx(tx, { direction: 'OUT', type: 'SALE_RETURN_REFUND', amount: cashRefund,
        referenceType: 'RETURN', referenceId: ret.id, note: `رد نقدي لمرتجع فاتورة ${sale!.invoiceNumber}`, userId: session.userId });
    } else {
      const allReturned = sourceItems.every((item) => (nextReturned.get(item.id) ?? 0) >= item.quantity);
      await tx.purchase.update({ where: { id: purchase!.id }, data: { returnedAmount: { increment: totalRefund }, status: allReturned ? 'RETURNED' : 'PARTIALLY_RETURNED' } });
      const cashRefund = cashRefundDue(purchase!.total, purchase!.paidAmount, purchase!.returnedAmount, totalRefund);
      if (input.refundMethod === 'CASH') await createTreasuryTx(tx, { direction: 'IN', type: 'PURCHASE_RETURN_IN', amount: cashRefund,
        referenceType: 'RETURN', referenceId: ret.id, note: `استرداد مرتجع فاتورة شراء ${purchase!.invoiceNumber}`, userId: session.userId });
    }
    await tx.return.update({ where: { id: ret.id }, data: { total: totalRefund } });
    await audit(tx, session, isSale ? 'إنشاء مرتجع مبيعات' : 'إنشاء مرتجع مشتريات', 'Return', ret.id, { invoiceNumber, total: totalRefund, refundMethod: input.refundMethod });
    return tx.return.findUnique({ where: { id: ret.id }, include: { items: true, sale: true, purchase: true, customer: true, supplier: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}
