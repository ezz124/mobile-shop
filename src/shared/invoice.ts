/** توزيع مبلغ الفاتورة (خصم أو ضريبة) على البنود بدون فقد جنيهات بسبب التقريب. */
export function allocateInvoiceAmount(
  items: readonly { id: number; lineTotal: number }[],
  amount: number,
): Map<number, number> {
  const result = new Map(items.map((item) => [item.id, 0]));
  const total = items.reduce((sum, item) => sum + Math.max(0, item.lineTotal), 0);
  const target = Math.max(0, Math.floor(amount));
  if (target === 0 || total === 0) return result;

  const parts = items.map((item) => {
    const exact = target * Math.max(0, item.lineTotal) / total;
    return { id: item.id, value: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = target - parts.reduce((sum, item) => sum + item.value, 0);
  parts.sort((a, b) => b.remainder - a.remainder || a.id - b.id);
  for (const item of parts) {
    if (remaining-- <= 0) break;
    item.value += 1;
  }
  for (const item of parts) result.set(item.id, item.value);
  return result;
}

export function returnedPartAmount(lineTotal: number, quantity: number, alreadyReturned: number, returning: number): number {
  if (quantity <= 0 || returning <= 0) return 0;
  const before = Math.floor(lineTotal * Math.max(0, alreadyReturned) / quantity);
  const after = Math.floor(lineTotal * Math.min(quantity, alreadyReturned + returning) / quantity);
  return after - before;
}

/**
 * المبلغ النقدي الذي يجب رده الآن لا يتجاوز ما تم دفعه فعلاً للمورد/من العميل.
 * الجزء الآجل من الفاتورة يُلغى من الذمة فقط.
 */
export function cashRefundDue(invoiceTotal: number, paidAmount: number, alreadyReturned: number, returningNow: number): number {
  const netBefore = Math.max(0, invoiceTotal - alreadyReturned);
  const netAfter = Math.max(0, invoiceTotal - alreadyReturned - returningNow);
  const overpaidBefore = Math.max(0, paidAmount - netBefore);
  const overpaidAfter = Math.max(0, paidAmount - netAfter);
  return overpaidAfter - overpaidBefore;
}
