import JsBarcode from 'jsbarcode';
import type { AppSettings } from '@/shared/ipc';
import { money } from './format';

export interface LabelSizeOption {
  id: string;
  name: string;
  width: number; // بالملليمتر
  height: number; // بالملليمتر
}

export const STANDARD_LABEL_SIZES: LabelSizeOption[] = [
  { id: '38x25', name: '38 × 25 مم (المقاس الأكثر شيوعاً)', width: 38, height: 25 },
  { id: '40x30', name: '40 × 30 مم', width: 40, height: 30 },
  { id: '50x25', name: '50 × 25 مم', width: 50, height: 25 },
  { id: '50x30', name: '50 × 30 مم', width: 50, height: 30 },
  { id: '60x40', name: '60 × 40 مم (كبير)', width: 60, height: 40 },
];

export interface PrintItem {
  id: number | string;
  name: string;
  barcode: string;
  price: number;
  quantity: number;
  sku?: string | null;
  categoryName?: string | null;
  details?: string | null; // e.g. IMEI or storage
}

export interface BarcodePrintOptions {
  labelSize: LabelSizeOption;
  showStoreName: boolean;
  showProductName: boolean;
  showPrice: boolean;
  showBarcodeValue: boolean;
  storeName?: string;
  currency?: string;
}

/** توليد رمز باركود احتياطي إذا لم يكن للمنتج باركود */
export function getProductBarcode(product: { id: number; barcode?: string | null; sku?: string | null }): string {
  if (product.barcode && product.barcode.trim()) {
    return product.barcode.trim();
  }
  if (product.sku && product.sku.trim()) {
    return product.sku.trim();
  }
  // رمز افتراضي بناءً على معرف المنتج (مثل P000123)
  return `P${String(product.id).padStart(6, '0')}`;
}

/** توليد SVG للباركود كسلسلة نصية */
export function generateBarcodeSvgString(
  value: string,
  options?: {
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
  }
): string {
  if (typeof document === 'undefined') return '';
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, {
      format: 'CODE128',
      width: options?.width ?? 1.3,
      height: options?.height ?? 30,
      displayValue: options?.displayValue ?? true,
      fontSize: options?.fontSize ?? 10,
      font: 'monospace',
      margin: 0,
      textMargin: 2,
    });
    return new XMLSerializer().serializeToString(svg);
  } catch (err) {
    console.error('Failed to generate barcode SVG:', err);
    return `<div style="font-family:monospace;font-size:12px;font-weight:bold;padding:4px 0;">*${value}*</div>`;
  }
}

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** بناء صفحة HTML كاملة للطباعة الحرارية المباشرة */
export function buildBarcodePrintHtml(
  items: PrintItem[],
  options: BarcodePrintOptions,
  settings: AppSettings
): string {
  const { labelSize, showStoreName, showProductName, showPrice, showBarcodeValue } = options;
  const storeName = options.storeName ?? settings.storeName ?? 'محسن ستور';
  const currency = options.currency ?? settings.currency ?? 'ج.م';
  const { width, height } = labelSize;

  // معايرة أحجام الخطوط بحسب أبعاد الاستيكر
  const isSmall = height <= 25;
  const storeFontSize = isSmall ? 7.5 : 8.5;
  const productFontSize = isSmall ? 8 : 9;
  const priceFontSize = isSmall ? 9 : 10.5;
  const barcodeHeight = isSmall ? 22 : 30;

  // تكرار الملصقات بحسب الكمية المحددة لكل صنف
  const labelsHtmlList: string[] = [];

  for (const item of items) {
    const copies = Math.max(1, Math.min(item.quantity || 1, 500));
    const barcodeCode = item.barcode || `P${String(item.id).padStart(6, '0')}`;
    const svgContent = generateBarcodeSvgString(barcodeCode, {
      height: barcodeHeight,
      width: isSmall ? 1.2 : 1.4,
      displayValue: showBarcodeValue,
      fontSize: 9,
    });

    const singleLabel = `
      <div class="label-page">
        ${showStoreName ? `<div class="store-name">${esc(storeName)}</div>` : ''}
        ${showProductName ? `<div class="product-name">${esc(item.name)}${item.details ? ` (${esc(item.details)})` : ''}</div>` : ''}
        <div class="barcode-wrap">
          ${svgContent}
        </div>
        ${
          showPrice
            ? `
          <div class="bottom-row">
            <span class="price-val">${money(item.price, currency)}</span>
            ${item.sku ? `<span class="sku-code">${esc(item.sku)}</span>` : ''}
          </div>`
            : ''
        }
      </div>
    `;

    for (let i = 0; i < copies; i++) {
      labelsHtmlList.push(singleLabel);
    }
  }

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>طباعة ملصقات الباركود</title>
  <style>
    @page {
      size: ${width}mm ${height}mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: ${width}mm;
      background: #ffffff;
      font-family: 'Rubik', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #000000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-page {
      width: ${width}mm;
      height: ${height}mm;
      max-height: ${height}mm;
      padding: 1.2mm 1.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      background: #ffffff;
    }
    .label-page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    .store-name {
      font-size: ${storeFontSize}pt;
      font-weight: 700;
      color: #111;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      line-height: 1.1;
    }
    .product-name {
      font-size: ${productFontSize}pt;
      font-weight: 700;
      color: #000;
      max-height: 2.4em;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.15;
      max-width: 100%;
    }
    .barcode-wrap {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0.5mm 0;
      overflow: hidden;
    }
    .barcode-wrap svg {
      max-width: 98%;
      height: auto;
      display: block;
    }
    .bottom-row {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 1mm;
      line-height: 1;
    }
    .price-val {
      font-size: ${priceFontSize}pt;
      font-weight: 800;
      color: #000;
      direction: rtl;
    }
    .sku-code {
      font-size: 7pt;
      color: #444;
      font-family: monospace;
      direction: ltr;
    }
  </style>
</head>
<body>
  ${labelsHtmlList.join('')}
</body>
</html>`;
}
