import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Printer, Receipt } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { daysAgo, formatDate, formatDateTime, money, toDateInput } from '@/lib/format';
import { buildInvoiceHtml } from '@/lib/invoice';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { EmptyState, PageHeader, Tabs } from '@/components/ui/primitives';
import { DateRangeInput, SearchInput } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import SaleDetailModal from '@/components/SaleDetailModal';
import PurchaseDetailModal from '@/components/PurchaseDetailModal';
import type { AppSettings, PurchaseDTO, PurchaseRow, SaleRow } from '@/shared/ipc';

type InvoiceTab = 'sale' | 'purchase';

export default function Invoices() {
  const { settings, currency } = useSettings();
  const { error: toastError } = useToast();

  const [tab, setTab] = useState<InvoiceTab>('sale');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(toDateInput(new Date()));
  const [page, setPage] = useState(1);
  const [saleDetailId, setSaleDetailId] = useState<number | null>(null);
  const [purchaseDetailId, setPurchaseDetailId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const salesQuery = useQuery({
    queryKey: ['invoices-sales', debounced, from, to, page],
    queryFn: () =>
      invoke('sales:list', {
        search: debounced || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: 15,
      }),
    enabled: tab === 'sale',
    placeholderData: (prev) => prev,
  });

  const purchasesQuery = useQuery({
    queryKey: ['invoices-purchases', debounced, from, to, page],
    queryFn: () =>
      invoke('purchases:list', {
        search: debounced || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: 15,
      }),
    enabled: tab === 'purchase',
    placeholderData: (prev) => prev,
  });

  async function printSale(row: SaleRow) {
    try {
      const sale = await invoke('sales:get', { id: row.id });
      await invoke('print:html', { html: buildInvoiceHtml(sale, settings), title: sale.invoiceNumber });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'تعذر إرسال أمر الطباعة');
    }
  }

  async function printPurchase(row: PurchaseRow) {
    try {
      const purchase = await invoke('purchases:get', { id: row.id });
      await invoke('print:html', { html: buildPurchaseInvoiceHtml(purchase, settings), title: purchase.invoiceNumber });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'تعذر إرسال أمر الطباعة');
    }
  }

  function printAction(onPrint: () => void) {
    return (
      <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onPrint}
          className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors flex items-center justify-center"
          title="طباعة الفاتورة"
        >
          <Printer size={15} />
        </button>
      </div>
    );
  }

  const saleColumns: Column<SaleRow>[] = [
    {
      key: 'invoice',
      header: 'رقم الفاتورة',
      render: (s) => <span dir="ltr" className="font-bold">{s.invoiceNumber}</span>,
    },
    {
      key: 'date',
      header: 'التاريخ',
      render: (s) => <span className="text-ink-soft">{formatDate(s.createdAt)}</span>,
    },
    {
      key: 'party',
      header: 'الطرف',
      render: (s) => s.customer?.name ?? <span className="text-ink-mute">زبون نقدي</span>,
    },
    {
      key: 'total',
      header: 'الإجمالي',
      align: 'end',
      render: (s) => <span dir="ltr" className="font-semibold">{money(s.total, currency)}</span>,
    },
    {
      key: 'paid',
      header: 'المدفوع',
      align: 'end',
      render: (s) => <span dir="ltr" className="text-success">{money(s.paidAmount, currency)}</span>,
    },
    {
      key: 'remaining',
      header: 'المتبقي',
      align: 'end',
      render: (s) =>
        s.remaining > 0
          ? <span dir="ltr" className="font-bold text-danger">{money(s.remaining, currency)}</span>
          : <span className="text-success font-bold">—</span>,
    },
    {
      key: 'actions',
      header: 'طباعة',
      align: 'center',
      render: (s) => printAction(() => void printSale(s)),
    },
  ];

  const purchaseColumns: Column<PurchaseRow>[] = [
    {
      key: 'invoice',
      header: 'رقم الفاتورة',
      render: (p) => <span dir="ltr" className="font-bold">{p.invoiceNumber}</span>,
    },
    {
      key: 'date',
      header: 'التاريخ',
      render: (p) => <span className="text-ink-soft">{formatDate(p.createdAt)}</span>,
    },
    {
      key: 'party',
      header: 'الطرف',
      render: (p) => p.supplier?.name ?? <span className="text-ink-mute">—</span>,
    },
    {
      key: 'total',
      header: 'الإجمالي',
      align: 'end',
      render: (p) => <span dir="ltr" className="font-semibold">{money(p.total, currency)}</span>,
    },
    {
      key: 'paid',
      header: 'المدفوع',
      align: 'end',
      render: (p) => <span dir="ltr" className="text-success">{money(p.paidAmount, currency)}</span>,
    },
    {
      key: 'remaining',
      header: 'المتبقي',
      align: 'end',
      render: (p) => {
        const remaining = p.total - p.returnedAmount - p.paidAmount;
        return remaining > 0
          ? <span dir="ltr" className="font-bold text-danger">{money(remaining, currency)}</span>
          : <span className="text-success font-bold">—</span>;
      },
    },
    {
      key: 'actions',
      header: 'طباعة',
      align: 'center',
      render: (p) => printAction(() => void printPurchase(p)),
    },
  ];

  const isSaleTab = tab === 'sale';

  return (
    <div className="space-y-5">
      <PageHeader title="الفواتير" subtitle="استعراض وطباعة جميع الفواتير" />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs<InvoiceTab>
          tabs={[
            { value: 'sale', label: 'فواتير البيع' },
            { value: 'purchase', label: 'فواتير الشراء' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={isSaleTab ? 'ابحث برقم الفاتورة أو العميل…' : 'ابحث برقم الفاتورة أو المورد…'}
            className="w-72"
          />
          <DateRangeInput
            from={from}
            to={to}
            onFromChange={(v) => { setFrom(v); setPage(1); }}
            onToChange={(v) => { setTo(v); setPage(1); }}
          />
        </div>
      </div>

      {isSaleTab ? (
        <>
          <DataTable
            columns={saleColumns}
            rows={salesQuery.data?.data ?? []}
            loading={salesQuery.isLoading}
            empty={<EmptyState icon={<Receipt size={26} />} title="لا توجد فواتير بيع" description="لم تُسجَّل أي فاتورة بيع ضمن هذه الفلاتر" />}
            onRowClick={(s) => setSaleDetailId(s.id)}
          />
          <Pagination
            page={page}
            pageSize={salesQuery.data?.pageSize ?? 15}
            total={salesQuery.data?.total ?? 0}
            onChange={setPage}
          />
        </>
      ) : (
        <>
          <DataTable
            columns={purchaseColumns}
            rows={purchasesQuery.data?.data ?? []}
            loading={purchasesQuery.isLoading}
            empty={<EmptyState icon={<FileText size={26} />} title="لا توجد فواتير شراء" description="لم تُسجَّل أي فاتورة شراء ضمن هذه الفلاتر" />}
            onRowClick={(p) => setPurchaseDetailId(p.id)}
          />
          <Pagination
            page={page}
            pageSize={purchasesQuery.data?.pageSize ?? 15}
            total={purchasesQuery.data?.total ?? 0}
            onChange={setPage}
          />
        </>
      )}

      <SaleDetailModal saleId={saleDetailId} onClose={() => setSaleDetailId(null)} />
      <PurchaseDetailModal purchaseId={purchaseDetailId} onClose={() => setPurchaseDetailId(null)} />
    </div>
  );
}

// ─────────────────────────── طباعة فاتورة الشراء ───────────────────────────

function escHtml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const nf = new Intl.NumberFormat('en-US');
function fmt(n: number): string {
  return nf.format(Math.round(n ?? 0));
}

function buildPurchaseInvoiceHtml(p: PurchaseDTO, settings: AppSettings): string {
  const isThermal = settings.printerWidth === '80mm';
  const cur = escHtml(settings.currency);
  const remaining = p.total - p.returnedAmount - p.paidAmount;

  const rows = (p.items ?? []).map((it) => {
    const imeis = (it.phoneUnits ?? []).map((u) => `<div class="imei">IMEI: ${escHtml(u.imei1)}</div>`).join('');
    return `
      <tr>
        <td>${escHtml(it.productName)}</td>
        <td class="c">${it.quantity}</td>
        <td class="l">${fmt(it.unitCost)}</td>
        <td class="l bold">${fmt(it.lineTotal)}</td>
      </tr>
      ${imeis ? `<tr class="imei-row"><td colspan="4">${imeis}</td></tr>` : ''}`;
  }).join('');

  const totals = `
    <div class="totals">
      <div class="trow"><span>المجموع الفرعي</span><span>${fmt(p.subtotal)} ${cur}</span></div>
      ${p.discount > 0 ? `<div class="trow"><span>الخصم</span><span>-${fmt(p.discount)} ${cur}</span></div>` : ''}
      ${p.taxAmount > 0 ? `<div class="trow"><span>الضريبة (${p.taxRate}%)</span><span>${fmt(p.taxAmount)} ${cur}</span></div>` : ''}
      <div class="trow grand"><span>الإجمالي</span><span>${fmt(p.total)} ${cur}</span></div>
      <div class="trow"><span>المدفوع</span><span>${fmt(p.paidAmount)} ${cur}</span></div>
      <div class="trow ${remaining > 0 ? 'remaining' : ''}">
        <span>المتبقي</span><span>${fmt(Math.max(0, remaining))} ${cur}</span>
      </div>
    </div>`;

  const header = `
    <div class="header">
      <div class="store">${escHtml(settings.storeName)}</div>
      ${settings.storePhone ? `<div class="meta">هاتف: ${escHtml(settings.storePhone)}</div>` : ''}
      ${settings.storeAddress ? `<div class="meta">${escHtml(settings.storeAddress)}</div>` : ''}
      <div class="divider"></div>
      <div class="title">فاتورة شراء — ${escHtml(p.invoiceNumber)}</div>
      <div class="meta">${formatDateTime(p.createdAt)}</div>
      <div class="meta">المورد: ${escHtml(p.supplier?.name ?? '')}</div>
      ${p.user ? `<div class="meta">المستخدم: ${escHtml(p.user.fullName)}</div>` : ''}
    </div>`;

  const style = `
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

  const body = `
    ${header}
    <table>
      <thead><tr><th>المنتج</th><th>كمية</th><th>التكلفة</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${totals}
    <div class="divider"></div>
    <div class="footer">${escHtml(settings.invoiceFooter)}</div>`;

  if (isThermal) {
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">${style}</head>
      <body style="width: 72mm; margin: 0 auto;">${body}</body></html>`;
  }

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">${style}</head>
    <body style="width: 170mm; margin: 0 auto; padding-top: 10mm;">${body}</body></html>`;
}
