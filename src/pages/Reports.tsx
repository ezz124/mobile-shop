import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Printer, ShoppingCart, Truck, Package, Users as UsersIcon, Wallet, Boxes,
  Receipt, TrendingUp, TrendingDown, Percent, RotateCcw, PackageX, Coins, UserX, Building2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { invoke } from '@/lib/ipc';
import {
  money, num, formatDate, formatDateTime, daysAgo, toDateInput,
  paymentMethodLabel, shortDayLabel,
} from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import {
  Button, PageHeader, Badge, Card, StatCard, Tabs, EmptyState, Spinner,
} from '@/components/ui/primitives';
import { DateRangeInput } from '@/components/ui/inputs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { TREASURY_LABELS, type TreasuryTxDTO } from '@/shared/ipc';

type ReportTab = 'sales' | 'purchases' | 'products' | 'employees' | 'treasury' | 'debts' | 'inventory';

const TABS: { value: ReportTab; label: string }[] = [
  { value: 'sales', label: 'المبيعات' },
  { value: 'purchases', label: 'المشتريات' },
  { value: 'products', label: 'المنتجات' },
  { value: 'employees', label: 'الموظفون' },
  { value: 'treasury', label: 'الصندوق' },
  { value: 'debts', label: 'الديون' },
  { value: 'inventory', label: 'المخزون' },
];

const TAB_TITLES: Record<ReportTab, string> = {
  sales: 'تقرير المبيعات',
  purchases: 'تقرير المشتريات',
  products: 'تقرير المنتجات الأكثر مبيعاً',
  employees: 'تقرير أداء الموظفين',
  treasury: 'تقرير حركة الصندوق',
  debts: 'تقرير الديون والذمم',
  inventory: 'تقرير المخزون',
};

interface SalesRow { id: number; date: string; count: number; total: number; profit: number; discounts: number }
interface PurchasesRow { id: number; date: string; count: number; total: number }
interface ProductRow { id: number; name: string; quantitySold: number; revenue: number; profit: number; quantityReturned: number }
interface EmployeeRow { id: number; name: string; salesCount: number; total: number; profit: number }
interface LowStockRow { id: number; name: string; quantity: number; minStock: number; type: string }

function LoadingCenter() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size={28} />
    </div>
  );
}

// ─────────────────────── أدوات الطباعة ───────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tableHtml(headers: string[], rows: (string | number)[][]): string {
  const head = `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${typeof c === 'number' ? num(c) : esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table>${head}${body}</table>`;
}

const PRINT_STYLE =
  'body{direction:rtl;font-family:Tahoma,Arial,sans-serif;padding:24px;color:#111827}' +
  'h1{font-size:20px;margin:0 0 6px}h3{font-size:14px;margin:18px 0 8px}' +
  'p.date{font-size:12px;color:#6B7280;margin:0 0 16px}' +
  'table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}' +
  'th,td{border:1px solid #9CA3AF;padding:6px 8px;text-align:right}' +
  'th{background:#F3F4F6;font-weight:bold}' +
  'p.totals{font-size:13px;font-weight:bold;margin-top:12px}';

export default function Reports() {
  const { currency } = useSettings();
  const { error: toastError } = useToast();

  const [tab, setTab] = useState<ReportTab>('sales');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));

  const showRange =
    tab === 'sales' || tab === 'purchases' || tab === 'products' || tab === 'employees' || tab === 'treasury';

  const now = new Date();
  const presets: { label: string; from: string; to: string }[] = [
    { label: 'اليوم', from: daysAgo(0), to: daysAgo(0) },
    { label: 'آخر 7 أيام', from: daysAgo(7), to: daysAgo(0) },
    { label: 'هذا الشهر', from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: daysAgo(0) },
    { label: 'هذا العام', from: toDateInput(new Date(now.getFullYear(), 0, 1)), to: daysAgo(0) },
  ];

  const salesQuery = useQuery({
    queryKey: ['report-sales', from, to],
    queryFn: () => invoke('reports:sales', { from, to }),
    enabled: tab === 'sales',
  });
  const purchasesQuery = useQuery({
    queryKey: ['report-purchases', from, to],
    queryFn: () => invoke('reports:purchases', { from, to }),
    enabled: tab === 'purchases',
  });
  const productsQuery = useQuery({
    queryKey: ['report-products', from, to],
    queryFn: () => invoke('reports:products', { from, to }),
    enabled: tab === 'products',
  });
  const employeesQuery = useQuery({
    queryKey: ['report-employees', from, to],
    queryFn: () => invoke('reports:employees', { from, to }),
    enabled: tab === 'employees',
  });
  const treasuryQuery = useQuery({
    queryKey: ['report-treasury', from, to],
    queryFn: () => invoke('reports:treasury', { from, to }),
    enabled: tab === 'treasury',
  });
  const debtsQuery = useQuery({
    queryKey: ['report-debts'],
    queryFn: () => invoke('reports:debts', {}),
    enabled: tab === 'debts',
  });
  const inventoryQuery = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => invoke('reports:inventory', {}),
    enabled: tab === 'inventory',
  });

  // ─────────────────────── الطباعة ───────────────────────

  async function printReport(): Promise<void> {
    const title = TAB_TITLES[tab];
    const dateLine = showRange
      ? `الفترة: من ${from} إلى ${to}`
      : `تاريخ الطباعة: ${toDateInput(new Date())}`;
    let body = '';

    if (tab === 'sales') {
      const d = salesQuery.data;
      if (!d) return;
      body =
        tableHtml(
          ['التاريخ', 'عدد الفواتير', 'الإجمالي', 'الخصومات', 'الربح'],
          d.rows.map((r) => [r.date, r.count, money(r.total, currency), money(r.discounts, currency), money(r.profit, currency)])
        ) +
        `<p class="totals">الإجماليات: ${num(d.totals.count)} فاتورة — المبيعات ${money(d.totals.total, currency)} — الأرباح ${money(d.totals.profit, currency)} — الخصومات ${money(d.totals.discounts, currency)} — المرتجعات ${money(d.totals.returns, currency)}</p>`;
    } else if (tab === 'purchases') {
      const d = purchasesQuery.data;
      if (!d) return;
      body =
        tableHtml(['التاريخ', 'عدد الفواتير', 'الإجمالي'], d.rows.map((r) => [r.date, r.count, money(r.total, currency)])) +
        `<p class="totals">الإجماليات: ${num(d.totals.count)} فاتورة — ${money(d.totals.total, currency)}</p>`;
    } else if (tab === 'products') {
      const d = productsQuery.data;
      if (!d) return;
      body = tableHtml(
        ['المنتج', 'الكمية المبيعة', 'الإيرادات', 'الربح', 'المرتجع'],
        d.map((r) => [r.name, r.quantitySold, money(r.revenue, currency), money(r.profit, currency), r.quantityReturned])
      );
    } else if (tab === 'employees') {
      const d = employeesQuery.data;
      if (!d) return;
      body = tableHtml(
        ['الموظف', 'عدد الفواتير', 'إجمالي المبيعات', 'الربح'],
        d.map((r) => [r.name, r.salesCount, money(r.total, currency), money(r.profit, currency)])
      );
    } else if (tab === 'treasury') {
      const d = treasuryQuery.data;
      if (!d) return;
      body =
        tableHtml(
          ['التاريخ', 'النوع', 'الوارد', 'الصادر', 'ملاحظة'],
          d.rows.slice(0, 20).map((r) => [
            r.createdAt,
            TREASURY_LABELS[r.type],
            r.direction === 'IN' ? money(r.amount, currency) : '—',
            r.direction === 'OUT' ? money(r.amount, currency) : '—',
            r.note ?? '—',
          ])
        ) +
        `<p class="totals">الرصيد الحالي: ${money(d.balance, currency)} — الوارد ${money(d.totalIn, currency)} — الصادر ${money(d.totalOut, currency)}</p>`;
    } else if (tab === 'debts') {
      const d = debtsQuery.data;
      if (!d) return;
      body =
        '<h3>ديون العملاء</h3>' +
        (d.customers.length > 0
          ? tableHtml(['العميل', 'الهاتف', 'الدين', 'عدد الفواتير'], d.customers.map((c) => [c.name, c.phone ?? '—', money(c.debt, currency), c.salesCount]))
          : '<p>لا توجد ديون عملاء</p>') +
        '<h3>ذمم الموردين</h3>' +
        (d.suppliers.length > 0
          ? tableHtml(['المورد', 'الرصيد المستحق', 'عدد الفواتير'], d.suppliers.map((s) => [s.name, money(s.balance, currency), s.purchasesCount]))
          : '<p>لا توجد ذمم موردين</p>');
    } else {
      const d = inventoryQuery.data;
      if (!d) return;
      body =
        `<p class="totals">إجمالي المنتجات: ${num(d.totalProducts)} — القطع بالمخزون: ${num(d.totalUnits)} — قيمة المخزون: ${money(d.stockValue, currency)} — القيمة البيعية: ${money(d.retailValue, currency)} — منتجات منتهية: ${num(d.outOfStock)}</p>` +
        '<h3>منتجات وصلت الحد الأدنى</h3>' +
        (d.lowStock.length > 0
          ? tableHtml(['المنتج', 'النوع', 'الكمية', 'الحد الأدنى'], d.lowStock.map((r) => [r.name, r.type === 'PHONE' ? 'هاتف' : 'ملحق', r.quantity, r.minStock]))
          : '<p>لا توجد منتجات تحت الحد الأدنى</p>');
    }

    const html =
      `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير</title><style>${PRINT_STYLE}</style></head>` +
      `<body><h1>${title}</h1><p class="date">${dateLine}</p>${body}</body></html>`;

    try {
      await invoke('print:html', { html, title: 'تقرير' });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'تعذر إرسال التقرير للطباعة');
    }
  }

  // ─────────────────────── أعمدة الجداول ───────────────────────

  const salesColumns: Column<SalesRow>[] = [
    { key: 'date', header: 'التاريخ', render: (r) => formatDate(r.date) },
    { key: 'count', header: 'عدد الفواتير', align: 'center', render: (r) => num(r.count) },
    { key: 'total', header: 'الإجمالي', align: 'end', render: (r) => <span dir="ltr">{money(r.total, currency)}</span> },
    { key: 'discounts', header: 'الخصومات', align: 'end', render: (r) => <span dir="ltr" className="text-ink-soft">{money(r.discounts, currency)}</span>, hideOn: 'hidden md:table-cell' },
    { key: 'profit', header: 'الربح', align: 'end', render: (r) => <span dir="ltr" className="text-success font-semibold">{money(r.profit, currency)}</span> },
  ];

  const purchasesColumns: Column<PurchasesRow>[] = [
    { key: 'date', header: 'التاريخ', render: (r) => formatDate(r.date) },
    { key: 'count', header: 'عدد الفواتير', align: 'center', render: (r) => num(r.count) },
    { key: 'total', header: 'الإجمالي', align: 'end', render: (r) => <span dir="ltr">{money(r.total, currency)}</span> },
  ];

  const productColumns: Column<ProductRow>[] = [
    { key: 'name', header: 'المنتج', render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'quantitySold', header: 'الكمية المبيعة', align: 'center', render: (r) => num(r.quantitySold) },
    { key: 'revenue', header: 'الإيرادات', align: 'end', render: (r) => <span dir="ltr">{money(r.revenue, currency)}</span> },
    { key: 'profit', header: 'الربح', align: 'end', render: (r) => <span dir="ltr" className="text-success font-semibold">{money(r.profit, currency)}</span> },
    { key: 'quantityReturned', header: 'المرتجع', align: 'center', render: (r) => (r.quantityReturned > 0 ? <span className="text-warning font-semibold">{num(r.quantityReturned)}</span> : <span className="text-ink-mute">—</span>) },
  ];

  const employeeColumns: Column<EmployeeRow>[] = [
    { key: 'name', header: 'الموظف', render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'salesCount', header: 'عدد الفواتير', align: 'center', render: (r) => num(r.salesCount) },
    { key: 'total', header: 'إجمالي المبيعات', align: 'end', render: (r) => <span dir="ltr">{money(r.total, currency)}</span> },
    { key: 'profit', header: 'الربح', align: 'end', render: (r) => <span dir="ltr" className="text-success font-semibold">{money(r.profit, currency)}</span> },
  ];

  const treasuryColumns: Column<TreasuryTxDTO>[] = [
    { key: 'createdAt', header: 'التاريخ', render: (r) => <span className="text-ink-soft">{formatDateTime(r.createdAt)}</span> },
    { key: 'type', header: 'النوع', render: (r) => <Badge tone={r.direction === 'IN' ? 'green' : 'red'}>{TREASURY_LABELS[r.type]}</Badge> },
    { key: 'in', header: 'الوارد', align: 'end', render: (r) => (r.direction === 'IN' ? <span dir="ltr" className="text-success font-semibold">{money(r.amount, currency)}</span> : <span className="text-ink-mute">—</span>) },
    { key: 'out', header: 'الصادر', align: 'end', render: (r) => (r.direction === 'OUT' ? <span dir="ltr" className="text-danger font-semibold">{money(r.amount, currency)}</span> : <span className="text-ink-mute">—</span>) },
    { key: 'note', header: 'ملاحظة', render: (r) => <p className="max-w-[240px] truncate text-ink-soft">{r.note ?? '—'}</p> },
  ];

  const lowStockColumns: Column<LowStockRow>[] = [
    { key: 'name', header: 'المنتج', render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'type', header: 'النوع', render: (r) => (r.type === 'PHONE' ? <Badge tone="purple">هاتف</Badge> : <Badge tone="blue">ملحق</Badge>) },
    { key: 'quantity', header: 'الكمية', align: 'center', render: (r) => <span className="font-bold text-danger">{num(r.quantity)}</span> },
    { key: 'minStock', header: 'الحد الأدنى', align: 'center', render: (r) => num(r.minStock) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="التقارير والتحليلات"
        subtitle="تحليل شامل للمبيعات والأرباح وحركة الصندوق والمخزون"
        actions={
          <Button variant="outline" icon={<Printer size={16} />} onClick={() => void printReport()}>
            طباعة التقرير
          </Button>
        }
      />

      {/* شريط الأدوات */}
      <div className="space-y-3">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        {showRange && (
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeInput from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <div className="w-px h-6 bg-line" />
            {presets.map((p) => {
              const active = from === p.from && to === p.to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setFrom(p.from); setTo(p.to); }}
                  className={`h-10 px-3.5 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/25'
                      : 'border-line bg-white text-ink-soft hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── المبيعات ── */}
      {tab === 'sales' && (salesQuery.isLoading ? <LoadingCenter /> : salesQuery.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard title="عدد الفواتير" value={num(salesQuery.data.totals.count)} icon={<Receipt size={22} />} tone="blue" />
            <StatCard title="المبيعات" value={<span dir="ltr">{money(salesQuery.data.totals.total, currency)}</span>} icon={<ShoppingCart size={22} />} tone="green" delay={0.05} />
            <StatCard title="الأرباح" value={<span dir="ltr">{money(salesQuery.data.totals.profit, currency)}</span>} icon={<TrendingUp size={22} />} tone="blue" delay={0.1} />
            <StatCard title="الخصومات" value={<span dir="ltr">{money(salesQuery.data.totals.discounts, currency)}</span>} icon={<Percent size={22} />} tone="amber" delay={0.15} />
            <StatCard title="المرتجعات" value={<span dir="ltr">{money(salesQuery.data.totals.returns, currency)}</span>} icon={<RotateCcw size={22} />} tone="red" delay={0.2} />
          </div>

          <Card className="p-5">
            <h3 className="font-bold text-ink mb-4">المبيعات والأرباح اليومية</h3>
            <div className="h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesQuery.data.rows.map((r) => ({ ...r, label: shortDayLabel(r.date) }))} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip
                    formatter={(value: number, name: string) => [money(value, currency), name === 'total' ? 'المبيعات' : 'الأرباح']}
                    labelStyle={{ fontFamily: 'Rubik' }}
                    contentStyle={{ fontFamily: 'Rubik', borderRadius: 14, border: '1px solid #E5E7EB', fontSize: 12, direction: 'rtl' }}
                  />
                  <Bar dataKey="total" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill="#16A34A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {salesQuery.data.paymentBreakdown.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {salesQuery.data.paymentBreakdown.map((p) => (
                <span key={p.method} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-subtle px-3.5 py-1.5 text-xs font-semibold">
                  <span className="text-ink-soft">{paymentMethodLabel(p.method)}</span>
                  <span className="text-ink" dir="ltr">{money(p.total, currency)}</span>
                </span>
              ))}
            </div>
          )}

          <DataTable
            columns={salesColumns}
            rows={salesQuery.data.rows.map((r, i) => ({ ...r, id: i }))}
            empty={<EmptyState icon={<Receipt size={26} />} title="لا توجد مبيعات في هذه الفترة" description="جرّب توسيع نطاق التاريخ أو اختيار فترة أخرى" />}
          />
        </div>
      ) : (
        <Card><EmptyState icon={<Receipt size={26} />} title="تعذر تحميل التقرير" /></Card>
      ))}

      {/* ── المشتريات ── */}
      {tab === 'purchases' && (purchasesQuery.isLoading ? <LoadingCenter /> : purchasesQuery.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="عدد الفواتير" value={num(purchasesQuery.data.totals.count)} icon={<Receipt size={22} />} tone="blue" />
            <StatCard title="الإجمالي" value={<span dir="ltr">{money(purchasesQuery.data.totals.total, currency)}</span>} icon={<Truck size={22} />} tone="gray" delay={0.05} />
          </div>

          <Card className="p-5">
            <h3 className="font-bold text-ink mb-4">المشتريات اليومية</h3>
            <div className="h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={purchasesQuery.data.rows.map((r) => ({ ...r, label: shortDayLabel(r.date) }))} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip
                    formatter={(value: number) => [money(value, currency), 'الإجمالي']}
                    labelStyle={{ fontFamily: 'Rubik' }}
                    contentStyle={{ fontFamily: 'Rubik', borderRadius: 14, border: '1px solid #E5E7EB', fontSize: 12, direction: 'rtl' }}
                  />
                  <Bar dataKey="total" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <DataTable
            columns={purchasesColumns}
            rows={purchasesQuery.data.rows.map((r, i) => ({ ...r, id: i }))}
            empty={<EmptyState icon={<Truck size={26} />} title="لا توجد مشتريات في هذه الفترة" description="جرّب توسيع نطاق التاريخ أو اختيار فترة أخرى" />}
          />
        </div>
      ) : (
        <Card><EmptyState icon={<Truck size={26} />} title="تعذر تحميل التقرير" /></Card>
      ))}

      {/* ── المنتجات ── */}
      {tab === 'products' && (productsQuery.isLoading ? <LoadingCenter /> : (
        <DataTable
          columns={productColumns}
          rows={(productsQuery.data ?? []).map((r) => ({ ...r, id: r.productId }))}
          empty={<EmptyState icon={<Package size={26} />} title="لا توجد منتجات مبيعة في هذه الفترة" description="جرّب توسيع نطاق التاريخ أو اختيار فترة أخرى" />}
        />
      ))}

      {/* ── الموظفون ── */}
      {tab === 'employees' && (employeesQuery.isLoading ? <LoadingCenter /> : (
        <DataTable
          columns={employeeColumns}
          rows={(employeesQuery.data ?? []).map((r) => ({ ...r, id: r.userId }))}
          empty={<EmptyState icon={<UsersIcon size={26} />} title="لا يوجد أداء موظفين في هذه الفترة" description="ستظهر نتائج الموظفين بعد تسجيل المبيعات" />}
        />
      ))}

      {/* ── الصندوق ── */}
      {tab === 'treasury' && (treasuryQuery.isLoading ? <LoadingCenter /> : treasuryQuery.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="الرصيد الحالي" value={<span dir="ltr">{money(treasuryQuery.data.balance, currency)}</span>} icon={<Wallet size={22} />} tone="blue" />
            <StatCard title="الوارد" value={<span dir="ltr">{money(treasuryQuery.data.totalIn, currency)}</span>} icon={<TrendingUp size={22} />} tone="green" delay={0.05} />
            <StatCard title="الصادر" value={<span dir="ltr">{money(treasuryQuery.data.totalOut, currency)}</span>} icon={<TrendingDown size={22} />} tone="red" delay={0.1} />
          </div>

          {treasuryQuery.data.byType.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {treasuryQuery.data.byType.map((bt) => (
                <span
                  key={bt.type}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                    bt.direction === 'IN'
                      ? 'border-success-100 bg-success-50 text-success-700'
                      : 'border-danger-100 bg-danger-50 text-danger-600'
                  }`}
                >
                  {TREASURY_LABELS[bt.type]}
                  <span dir="ltr">{money(bt.total, currency)}</span>
                </span>
              ))}
            </div>
          )}

          <DataTable
            columns={treasuryColumns}
            rows={treasuryQuery.data.rows.slice(0, 20)}
            empty={<EmptyState icon={<Coins size={26} />} title="لا توجد حركة صندوق في هذه الفترة" description="جرّب توسيع نطاق التاريخ أو اختيار فترة أخرى" />}
          />
        </div>
      ) : (
        <Card><EmptyState icon={<Coins size={26} />} title="تعذر تحميل التقرير" /></Card>
      ))}

      {/* ── الديون ── */}
      {tab === 'debts' && (debtsQuery.isLoading ? <LoadingCenter /> : debtsQuery.data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-danger-50 text-danger flex items-center justify-center"><UserX size={17} /></div>
              <h3 className="font-bold text-ink">ديون العملاء</h3>
            </div>
            {debtsQuery.data.customers.length === 0 ? (
              <EmptyState icon={<UserX size={24} />} title="لا توجد ديون عملاء" description="جميع العملاء مسدَّدون" />
            ) : (
              <div className="divide-y divide-line">
                {debtsQuery.data.customers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{c.name}</p>
                      <p className="text-[11px] text-ink-mute" dir="ltr">{c.phone ?? '—'}</p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-bold text-danger" dir="ltr">{money(c.debt, currency)}</p>
                      <p className="text-[11px] text-ink-mute">{num(c.salesCount)} فاتورة</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-danger-50 text-danger flex items-center justify-center"><Building2 size={17} /></div>
              <h3 className="font-bold text-ink">ذمم الموردين</h3>
            </div>
            {debtsQuery.data.suppliers.length === 0 ? (
              <EmptyState icon={<Building2 size={24} />} title="لا توجد ذمم موردين" description="تمت تسوية جميع أرصدة الموردين" />
            ) : (
              <div className="divide-y divide-line">
                {debtsQuery.data.suppliers.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{s.name}</p>
                      <p className="text-[11px] text-ink-mute" dir="ltr">{s.phone ?? '—'}</p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-bold text-danger" dir="ltr">{money(s.balance, currency)}</p>
                      <p className="text-[11px] text-ink-mute">{num(s.purchasesCount)} فاتورة</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card><EmptyState icon={<UserX size={26} />} title="تعذر تحميل التقرير" /></Card>
      ))}

      {/* ── المخزون ── */}
      {tab === 'inventory' && (inventoryQuery.isLoading ? <LoadingCenter /> : inventoryQuery.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard title="إجمالي المنتجات" value={num(inventoryQuery.data.totalProducts)} icon={<Package size={22} />} tone="blue" />
            <StatCard title="القطع بالمخزون" value={num(inventoryQuery.data.totalUnits)} icon={<Boxes size={22} />} tone="gray" delay={0.05} />
            <StatCard title="قيمة المخزون" value={<span dir="ltr">{money(inventoryQuery.data.stockValue, currency)}</span>} icon={<Wallet size={22} />} tone="blue" delay={0.1} />
            <StatCard title="القيمة البيعية" value={<span dir="ltr">{money(inventoryQuery.data.retailValue, currency)}</span>} icon={<TrendingUp size={22} />} tone="green" delay={0.15} />
            <StatCard title="منتجات منتهية" value={num(inventoryQuery.data.outOfStock)} icon={<PackageX size={22} />} tone={inventoryQuery.data.outOfStock > 0 ? 'red' : 'gray'} delay={0.2} />
          </div>

          <div>
            <h3 className="font-bold text-ink mb-3 flex items-center gap-2">
              <PackageX size={17} className="text-danger" />
              منتجات وصلت الحد الأدنى
            </h3>
            <DataTable
              columns={lowStockColumns}
              rows={inventoryQuery.data.lowStock}
              empty={<EmptyState icon={<Boxes size={26} />} title="لا توجد منتجات تحت الحد الأدنى" description="جميع المنتجات ضمن الكميات الآمنة" />}
            />
          </div>
        </div>
      ) : (
        <Card><EmptyState icon={<Boxes size={26} />} title="تعذر تحميل التقرير" /></Card>
      ))}
    </div>
  );
}
