export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function err(message: string): never {
  throw new AppError(message);
}

/** تحويل أخطاء Prisma إلى رسائل عربية واضحة */
export function toUserMessage(e: unknown): string {
  const error = e as { code?: string; meta?: { target?: string[] }; message?: string };
  if (error?.code === 'P2002') {
    const target = error.meta?.target?.join('، ') ?? '';
    if (target.includes('imei')) return 'رقم IMEI مستخدم مسبقاً لجهاز آخر';
    if (target.includes('serialNumber')) return 'الرقم التسلسلي مستخدم مسبقاً لجهاز آخر';
    if (target.includes('barcode')) return 'الباركود مستخدم مسبقاً لمنتج آخر';
    if (target.includes('sku')) return 'رمز المنتج (SKU) مستخدم مسبقاً';
    if (target.includes('username')) return 'اسم المستخدم موجود مسبقاً';
    if (target.includes('name')) return 'الاسم مستخدم مسبقاً';
    return 'هذه القيمة مستخدمة مسبقاً ولا يمكن تكرارها';
  }
  if (error?.code === 'P2025') return 'السجل غير موجود أو تم حذفه';
  return error?.message ?? 'حدث خطأ غير متوقع';
}
