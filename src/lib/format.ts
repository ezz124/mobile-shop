const numberFmt = new Intl.NumberFormat('en-US');

/** تنسيق مبلغ مالي بأرقام لاتينية مقروءة */
export function money(value: number | null | undefined, currency = 'ج.م'): string {
  const v = Math.round(value ?? 0);
  return `${numberFmt.format(v)} ${currency}`;
}

export function num(value: number | null | undefined): string {
  return numberFmt.format(Math.round(value ?? 0));
}

export function formatNumber(value: number | null | undefined): string {
  return numberFmt.format(value ?? 0);
}

const dateFmt = new Intl.DateTimeFormat('ar-u-nu-latn', {
  year: 'numeric', month: '2-digit', day: '2-digit',
});
const dateTimeFmt = new Intl.DateTimeFormat('ar-u-nu-latn', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '—';
  return dateFmt.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '—';
  return dateTimeFmt.format(d);
}

/** تحويل تاريخ إلى قيمة حقل input[type=date] بالتوقيت المحلي */
export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
}

export function shortDayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'CASH', label: 'نقداً' },
  { value: 'CARD', label: 'بطاقة' },
  { value: 'BANK', label: 'حوالة بنكية' },
  { value: 'OTHER', label: 'أخرى' },
];
export function paymentMethodLabel(m: string): string {
  return PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;
}

export const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: 'شراء',
  SALE: 'بيع',
  RETURN_IN: 'مرتجع مبيعات',
  RETURN_OUT: 'مرتجع مشتريات',
  ADJUSTMENT: 'تعديل يدوي',
  INITIAL: 'رصيد افتتاحي',
  DAMAGE: 'تالف',
};

export const UNIT_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'متوفر',
  SOLD: 'مبيع',
  RETURNED: 'مُرجع',
  DEFECTIVE: 'تالف',
};

export const SALE_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'مكتملة',
  PARTIALLY_RETURNED: 'مرتجع جزئياً',
  RETURNED: 'مرتجعة',
};

export function initials(name: string): string {
  return name.trim().slice(0, 2);
}
