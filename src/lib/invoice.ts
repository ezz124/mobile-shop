import type { SaleDTO, AppSettings } from '@/shared/ipc';
import { formatDateTime, paymentMethodLabel } from './format';

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const nf = new Intl.NumberFormat('en-US');
function fmt(n: number): string {
  return nf.format(Math.round(n ?? 0));
}

export function buildInvoiceHtml(sale: SaleDTO, settings: AppSettings): string {
  const isThermal = settings.printerWidth === '80mm';
  const cur = esc(settings.currency);
  const rows = (sale.items ?? []).map((item) => {
    const imeis = (item.phoneUnits ?? []).map((u) => `<div class="imei">IMEI: ${esc(u.imei1)}</div>`).join('');
    return `
      <tr>
        <td>${esc(item.productName)}</td>
        <td class="c">${item.quantity}</td>
        <td class="l">${fmt(item.unitPrice)}</td>
        <td class="l bold">${fmt(item.lineTotal)}</td>
      </tr>
      ${imeis ? `<tr class="imei-row"><td colspan="4">${imeis}</td></tr>` : ''}`;
  }).join('');

  const totals = `
    <div class="totals">
      <div class="trow"><span>المجموع الفرعي</span><span>${fmt(sale.subtotal)} ${cur}</span></div>
      ${sale.discount > 0 ? `<div class="trow"><span>الخصم</span><span>-${fmt(sale.discount)} ${cur}</span></div>` : ''}
      ${sale.taxAmount > 0 ? `<div class="trow"><span>الضريبة (${sale.taxRate}%)</span><span>${fmt(sale.taxAmount)} ${cur}</span></div>` : ''}
      <div class="trow grand"><span>الإجمالي</span><span>${fmt(sale.total)} ${cur}</span></div>
      <div class="trow"><span>المدفوع</span><span>${fmt(sale.paidAmount)} ${cur}</span></div>
      <div class="trow ${sale.total - sale.returnedAmount - sale.paidAmount > 0 ? 'remaining' : ''}">
        <span>المتبقي</span><span>${fmt(Math.max(0, sale.total - sale.returnedAmount - sale.paidAmount))} ${cur}</span>
      </div>
      <div class="trow"><span>طريقة الدفع</span><span>${esc(paymentMethodLabel(sale.paymentMethod))}</span></div>
    </div>`;

  const header = `
    <div class="header">
      <div class="store">${esc(settings.storeName)}</div>
      ${settings.storePhone ? `<div class="meta">هاتف: ${esc(settings.storePhone)}</div>` : ''}
      ${settings.storeAddress ? `<div class="meta">${esc(settings.storeAddress)}</div>` : ''}
      <div class="divider"></div>
      <div class="title">فاتورة بيع — ${esc(sale.invoiceNumber)}</div>
      <div class="meta">${formatDateTime(sale.createdAt)}</div>
      <div class="meta">البائع: ${esc(sale.user?.fullName ?? '')}</div>
      <div class="meta">العميل: ${esc(sale.customer?.name ?? 'زبون نقدي')}</div>
      ${sale.customer?.phone ? `<div class="meta">هاتف العميل: ${esc(sale.customer.phone)}</div>` : ''}
    </div>`;

  const common = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Rubik', 'Segoe UI', Tahoma, sans-serif; }
      body { direction: rtl; color: #111; }
      .header { text-align: center; margin-bottom: 12px; }
      .store { font-size: 20px; font-weight: 800; }
      .title { font-weight: 700; font-size: 15px; margin-top: 2px; }
      .meta { font-size: 11px; color: #444; margin-top: 2px; }
      .divider { border-top: 1px dashed #999; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { font-size: 11px; border-bottom: 1.5px solid #111; padding: 4px 2px; text-align: right; }
      td { font-size: 12px; padding: 5px 2px; border-bottom: 1px dashed #ddd; vertical-align: top; }
      .c { text-align: center; } .l { text-align: left; direction: ltr; }
      .bold { font-weight: 700; }
      .imei-row td { border-bottom: none; padding-top: 0; }
      .imei { font-size: 10px; color: #555; direction: ltr; text-align: right; font-family: monospace; }
      .totals { margin-top: 12px; }
      .trow { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
      .grand { font-size: 15px; font-weight: 800; border-top: 1.5px solid #111; margin-top: 5px; padding-top: 6px; }
      .remaining { color: #b91c1c; font-weight: 700; }
      .footer { text-align: center; font-size: 11px; color: #555; margin-top: 14px; }
      @page { margin: ${isThermal ? '4mm' : '12mm'}; }
    </style>`;

  if (isThermal) {
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">${common}</head>
      <body style="width: 72mm; margin: 0 auto;">
        ${header}
        <table>
          <thead><tr><th>المنتج</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${totals}
        <div class="divider"></div>
        <div class="footer">${esc(settings.invoiceFooter)}</div>
      </body></html>`;
  }

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">${common}</head>
    <body style="width: 170mm; margin: 0 auto; padding-top: 10mm;">
      ${header}
      <table>
        <thead><tr><th>المنتج</th><th>كمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${totals}
      <div class="divider"></div>
      <div class="footer">${esc(settings.invoiceFooter)}</div>
      <div style="margin-top: 26mm; display:flex; justify-content: space-between;">
        <div style="border-top:1px solid #999; padding-top:4px; font-size:11px; width:40mm; text-align:center;">توقيع البائع</div>
        <div style="border-top:1px solid #999; padding-top:4px; font-size:11px; width:40mm; text-align:center;">توقيع العميل</div>
      </div>
    </body></html>`;
}
