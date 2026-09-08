import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { SALE_STATUS_LABELS, daysAgo, formatDate, money, toDateInput } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { Badge, Button, EmptyState, PageHeader } from '@/components/ui/primitives';
import { DateRangeInput, SearchInput, Select } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import SaleDetailModal from '@/components/SaleDetailModal';
import type { SaleRow } from '@/shared/ipc';

const STATUS_TONES: Record<string, 'green' | 'amber' | 'gray'> = {
  COMPLETED: 'green',
  PARTIALLY_RETURNED: 'amber',
  RETURNED: 'gray',
};

export default function Sales() {
  const { currency } = useSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusParam = searchParams.get('focus');

  const [detailId, setDetailId] = useState<number | null>(focusParam ? Number(focusParam) : null);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(toDateInput(new Date()));
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  // قراءة ?focus=<id> مرة واحدة عند فتح الصفحة ثم إزالة المعامل
  useEffect(() => {
    if (!focusParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales', debounced, from, to, status, page],
    queryFn: () =>
      invoke('sales:list', {
        search: debounced || undefined,
        from: from || undefined,
        to: to || undefined,
        status: status || undefined,
        page,
        pageSize: 15,
      }),
    placeholderData: (prev) => prev,
  });

  const columns: Column<SaleRow>[] = [
    {
      key: 'invoice',
      header: 'رقم الفاتورة',
      render: (s) => <span dir="ltr" className="font-bold">{s.invoiceNumber}</span>,
    },
    {
      key: 'date',
      header: 'التاريخ',
      render: (s) => <span className="text-ink-soft">{formatDate(s.createdAt)}</span>,
      hideOn: 'hidden md:table-cell',
    },
    {
      key: 'customer',
      header: 'العميل',
      render: (s) => s.customer?.name ?? <span className="text-ink-mute">زبون نقدي</span>,
    },
    {
      key: 'seller',
      header: 'البائع',
      render: (s) => <span className="text-ink-soft">{s.user?.fullName ?? '—'}</span>,
      hideOn: 'hidden lg:table-cell',
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
      hideOn: 'hidden md:table-cell',
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
      key: 'returned',
      header: 'المرتجع',
      align: 'end',
      render: (s) =>
        s.returnedAmount > 0
          ? <Badge tone="amber">{money(s.returnedAmount, currency)}</Badge>
          : <span className="text-ink-mute">—</span>,
      hideOn: 'hidden lg:table-cell',
    },
    {
      key: 'profit',
      header: 'الربح',
      align: 'end',
      render: (s) =>
        s.profit != null
          ? <span dir="ltr" className="text-success font-semibold">{money(s.profit, currency)}</span>
          : <span className="text-ink-mute">—</span>,
      hideOn: 'hidden lg:table-cell',
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (s) => (
        <Badge tone={STATUS_TONES[s.status] ?? 'gray'}>{SALE_STATUS_LABELS[s.status] ?? s.status}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="المبيعات"
        subtitle="سجل فواتير البيع والتحصيلات"
        actions={
          <Button icon={<Plus size={17} />} onClick={() => navigate('/pos')}>
            بيع جديد
          </Button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ابحث برقم الفاتورة أو اسم العميل…"
          className="w-72"
        />
        <DateRangeInput
          from={from}
          to={to}
          onFromChange={(v) => { setFrom(v); setPage(1); }}
          onToChange={(v) => { setTo(v); setPage(1); }}
        />
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-10 w-44 text-xs"
        >
          <option value="">الكل</option>
          {Object.entries(SALE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<Receipt size={26} />} title="لا توجد فواتير" description="لم تُسجَّل أي فاتورة بيع ضمن هذه الفلاتر" />}
        onRowClick={(s) => setDetailId(s.id)}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.total ?? 0} onChange={setPage} />

      <SaleDetailModal saleId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
