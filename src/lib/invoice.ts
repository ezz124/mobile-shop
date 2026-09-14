import type { SaleDTO, AppSettings } from '@/shared/ipc';
import { formatDateTime, paymentMethodLabel } from './format';

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const nf = new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmt(n: number): string {
  return nf.format(Math.round((n ?? 0) * 100) / 100);
}

/** تحويل الصورة إلى Base64 لتضمينها في الفاتورة */
async function logoToBase64(): Promise<string> {
  try {
    const res = await fetch('/logo.jpg');
    if (!res.ok) return '';
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

export async function buildInvoiceHtml(sale: SaleDTO, settings: AppSettings): Promise<string> {
  const isThermal = settings.printerWidth === '80mm';
  const cur = esc(settings.currency);

  const rows = (sale.items ?? []).map((item) => {
    const imeis = (item.phoneUnits ?? []).map((u) => `<div class="imei">IMEI: ${esc(u.imei1)}</div>`).join('');
    return `
      <tr>
        <td class="col-name">${esc(item.productName)}${imeis ? `<div class="imeis">${imeis}</div>` : ''}</td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-price">${fmt(item.unitPrice)}</td>
        <td class="col-total">${fmt(item.lineTotal)}</td>
      </tr>`;
  }).join('');

  const header = `
    <div class="header">
      <div class="header-info">
        <div class="store-name">${esc(settings.storeName)}</div>
        ${settings.storeAddress ? `<div class="store-sub">${esc(settings.storeAddress)}</div>` : ''}
        ${settings.storePhone ? `<div class="store-phone">📞 ${esc(settings.storePhone)}</div>` : ''}
      </div>
      <div class="divider-dashed"></div>
      <table class="invoice-meta-table">
        <tr>
          <td class="meta-label">رقم الفاتورة</td>
          <td class="meta-val">${esc(sale.invoiceNumber)}</td>
          <td class="meta-label">التاريخ</td>
          <td class="meta-val">${formatDateTime(sale.createdAt)}</td>
        </tr>
        <tr>
          <td class="meta-label">البائع</td>
          <td class="meta-val">${esc(sale.user?.fullName ?? '')}</td>
          <td class="meta-label">العميل</td>
          <td class="meta-val">${esc(sale.customer?.name ?? 'زبون نقدي')}</td>
        </tr>
        ${sale.customer?.phone ? `<tr><td class="meta-label">هاتف العميل</td><td class="meta-val" colspan="3">${esc(sale.customer.phone)}</td></tr>` : ''}
      </table>
      <div class="divider-dashed"></div>
    </div>`;

  const totals = `
    <div class="totals-section">
      <div class="divider-dashed"></div>
      <table class="totals-table">
        ${sale.discount > 0 ? `<tr><td class="tot-label">الخصم</td><td class="tot-val tot-discount">- ${fmt(sale.discount)} ${cur}</td></tr>` : ''}
        ${sale.taxAmount > 0 ? `<tr><td class="tot-label">الضريبة (${sale.taxRate}%)</td><td class="tot-val">${fmt(sale.taxAmount)} ${cur}</td></tr>` : ''}
        <tr class="grand-row"><td class="tot-label grand-label">الإجمالي النهائي</td><td class="tot-val grand-val">${fmt(sale.total)} ${cur}</td></tr>
        <tr><td class="tot-label">المدفوع</td><td class="tot-val">${fmt(sale.paidAmount)} ${cur} <span class="method-badge">${esc(paymentMethodLabel(sale.paymentMethod))}</span></td></tr>
        ${Math.max(0, sale.total - sale.returnedAmount - sale.paidAmount) > 0
          ? `<tr class="remaining-row"><td class="tot-label">المتبقي</td><td class="tot-val tot-remaining">${fmt(Math.max(0, sale.total - sale.returnedAmount - sale.paidAmount))} ${cur}</td></tr>`
          : ''}
      </table>
    </div>`;

  const styles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        direction: rtl;
        color: #1a1a1a;
        background: #fff;
        font-size: 13px;
      }

      /* ===== HEADER ===== */
      .header { text-align: center; margin-bottom: 10px; }
      .header-logo { display: flex; justify-content: center; margin-bottom: 6px; }
      .logo-img { height: ${isThermal ? '55px' : '75px'}; width: auto; object-fit: contain; mix-blend-mode: multiply; }
      .store-name { font-size: ${isThermal ? '15px' : '18px'}; font-weight: 900; color: #1a1a1a; }
      .store-sub { font-size: 11px; color: #555; margin-top: 1px; }
      .store-phone { font-size: 12px; font-weight: 700; color: #d97706; margin-top: 3px; direction: ltr; }

      /* ===== DIVIDER ===== */
      .divider-dashed { border: none; border-top: 1.5px dashed #1a1a1a; margin: 8px 0; }

      /* ===== META TABLE ===== */
      .invoice-meta-table { width: 100%; border-collapse: collapse; margin: 6px 0; }
      .invoice-meta-table td { font-size: 11px; padding: 2px 4px; vertical-align: top; border: none; }
      .meta-label { color: #666; font-weight: 600; white-space: nowrap; width: 22%; }
      .meta-val { color: #111; font-weight: 700; width: 28%; }

      /* ===== ITEMS TABLE ===== */
      .items-table { width: 100%; border-collapse: collapse; margin-top: 6px; border: 1.5px solid #1a1a1a; }
      .items-table thead tr { border-bottom: 1.5px solid #1a1a1a; }
      .items-table th {
        padding: ${isThermal ? '5px 3px' : '6px 6px'};
        font-size: ${isThermal ? '11px' : '12px'};
        font-weight: 700;
        text-align: center;
        border-left: 1px dashed #1a1a1a;
      }
      .items-table th:last-child { border-left: none; }
      .items-table td {
        padding: ${isThermal ? '5px 3px' : '6px 6px'};
        font-size: ${isThermal ? '11px' : '13px'};
        border-bottom: 1px dashed #1a1a1a;
        border-left: 1px dashed #1a1a1a;
        vertical-align: middle;
      }
      .items-table td:last-child { border-left: none; }
      .items-table tbody tr:last-child td { border-bottom: none; }

      .col-name { text-align: right; min-width: ${isThermal ? '80px' : '120px'}; }
      .col-qty  { text-align: center; width: ${isThermal ? '30px' : '45px'}; }
      .col-price { text-align: center; direction: ltr; width: ${isThermal ? '60px' : '85px'}; font-family: monospace; font-size: ${isThermal ? '12px' : '14px'}; }
      .col-total { text-align: center; direction: ltr; font-weight: 700; width: ${isThermal ? '60px' : '85px'}; font-family: monospace; font-size: ${isThermal ? '12px' : '14px'}; }

      .imeis { margin-top: 3px; }
      .imei { font-size: 9px; color: #666; direction: ltr; text-align: right; font-family: 'Courier New', monospace; }

      /* ===== TOTALS ===== */
      .totals-section { margin-top: 6px; }
      .totals-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
      .totals-table td { padding: 3px 4px; font-size: 12px; }
      .tot-label { text-align: right; color: #444; }
      .tot-val { text-align: left; direction: ltr; font-weight: 700; color: #111; }
      .tot-discount { color: #16a34a; }
      .tot-remaining { color: #dc2626; }
      .grand-row { border-top: 2px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; }
      .grand-label { font-size: 14px; font-weight: 900; color: #1a1a1a; }
      .grand-val { font-size: 15px; font-weight: 900; color: #1a1a1a; }
      .method-badge {
        display: inline-block;
        background: #f0f0f0;
        color: #555;
        font-size: 10px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 10px;
        margin-right: 4px;
        direction: rtl;
      }

      /* ===== FOOTER ===== */
      .footer-section { text-align: center; margin-top: 12px; }
      .footer-msg { font-size: 11px; color: #555; }
      .footer-brand { font-size: 10px; color: #aaa; margin-top: 6px; }

      /* ===== SIGNATURES (A4 only) ===== */
      .signatures {
        display: flex;
        justify-content: space-between;
        margin-top: 20mm;
      }
      .sig-box {
        border-top: 1px solid #999;
        padding-top: 4px;
        font-size: 11px;
        width: 40mm;
        text-align: center;
        color: #555;
      }

      @page { margin: ${isThermal ? '4mm' : '12mm'}; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>`;

  if (isThermal) {
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">${styles}</head>
      <body style="width:72mm;margin:0 auto;">
        ${header}
        <table class="items-table">
          <thead><tr>
            <th class="col-name">المنتج</th>
            <th class="col-qty">كمية</th>
            <th class="col-price">سعر</th>
            <th class="col-total">إجمالي</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${totals}
        <div class="divider-dashed"></div>
        <div class="footer-section">
          <div class="footer-msg">${esc(settings.invoiceFooter)}</div>
          <div class="footer-brand">محسن ستور — جميع خدمات المحمول</div>
        </div>
      </body></html>`;
  }

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">${styles}</head>
    <body style="width:190mm;margin:0 auto;padding-top:8mm;">
      ${header}
      <table class="items-table">
        <thead><tr>
          <th class="col-name">المنتج / الصنف</th>
          <th class="col-qty">الكمية</th>
          <th class="col-price">سعر الوحدة</th>
          <th class="col-total">الإجمالي</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${totals}
      <div class="divider-dashed"></div>
      <div class="footer-section">
        <div class="footer-msg">${esc(settings.invoiceFooter)}</div>
        <div class="footer-brand">محسن ستور — جميع خدمات المحمول | 📞 01000055512</div>
      </div>
      <div class="signatures">
        <div class="sig-box">توقيع البائع</div>
        <div class="sig-box">توقيع العميل</div>
      </div>
    </body></html>`;
}
