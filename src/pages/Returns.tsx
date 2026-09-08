import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { daysAgo, formatDate, formatDateTime, money, toDateInput } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { Badge, Button, EmptyState, PageHeader, Spinner, Tabs } from '@/components/ui/primitives';
import { DateRangeInput, SearchInput } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import ReturnCreateModal from '@/components/ReturnCreateModal';
import type { ReturnDTO } from '@/shared/ipc';

type ReturnTab = 'ALL' | 'SALE_RETURN' | 'PURCHASE_RETURN';
type ReturnType = 'SALE_RETURN' | 'PURCHASE_RETURN';

interface ReturnTarget {
  type: ReturnType;
  id: number;
}

export default function Returns() {
  const { currency } = useSettings();

  const [tab, setTab] = useState<ReturnTab>('ALL');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(toDateInput(new Date()));
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['returns', tab, from, to, page],
    queryFn: () =>
      invoke('returns:list', {
        type: tab === 'ALL' ? undefined : tab,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: 15,
      }),
    placeholderData: (prev) => prev,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['return-detail', detailId],
    queryFn: () => invoke('returns:get', { id: detailId! }),
    enabled: detailId != null,
  });

  const columns: Column<ReturnDTO>[] = [
    {
      key: 'invoice',
      header: 'رقم المرتجع',
      render: (r) => <span dir="ltr" className="font-bold">{r.invoiceNumber}</span>,
    },
    {
      key: 'type',
      header: 'النوع',
      render: (r) =>
        r.type === 'SALE_RETURN' ? <Badge tone="blue">مبيعات</Badge> : <Badge tone="amber">مشتريات</Badge>,
    },
    {
      key: 'original',
      header: 'الفاتورة الأصلية',
      render: (r) => <span dir="ltr" className="text-ink-soft">{r.saleInvoice ?? r.purchaseInvoice ?? '—'}</span>,
    },
    {
      key: 'party',
      header: 'الطرف',
      render: (r) => r.customer?.name ?? r.supplier?.name ?? <span className="text-ink-mute">—</span>,
    },
    {
      key: 'total',
      header: 'المبلغ',
      align: 'end',
      render: (r) => <span dir="ltr" className="font-bold">{money(r.total, currency)}</span>,
    },
    {
      key: 'refund',
      header: 'طريقة الرد',
      render: (r) =>
        r.refundMethod === 'CASH' ? <Badge tone="green">نقدي</Badge> : <Badge tone="gray">على الحساب</Badge>,
    },
    {
      key: 'reason',
      header: 'السبب',
      render: (r) =>
        r.reason
          ? <span className="block max-w-[180px] truncate text-ink-soft" title={r.reason}>{r.reason}</span>
          : <span className="text-ink-mute">—</span>,
      hideOn: 'hidden lg:table-cell',
    },
    {
      key: 'date',
      header: 'التاريخ',
      render: (r) => <span className="text-ink-soft">{formatDate(r.createdAt)}</span>,
    },
  ];

  const target = returnTarget;

  return (
    <div className="space-y-5">
      <PageHeader
        title="المرتجعات"
        subtitle="سجل مرتجعات المبيعات والمشتريات"
        actions={
          <Button icon={<Plus size={17} />} onClick={() => setPickerOpen(true)}>
            مرتجع جديد
          </Button>
        }
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs<ReturnTab>
          tabs={[
            { value: 'ALL', label: 'الكل' },
            { value: 'SALE_RETURN', label: 'مبيعات' },
            { value: 'PURCHASE_RETURN', label: 'مشتريات' },
          ]}
          value={tab}
          onChange={(v) => { setTab(v); setPage(1); }}
        />
        <DateRangeInput
          from={from}
          to={to}
          onFromChange={(v) => { setFrom(v); setPage(1); }}
          onToChange={(v) => { setTo(v); setPage(1); }}
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<RotateCcw size={26} />} title="لا توجد مرتجعات" description="لم يُسجَّل أي مرتجع ضمن هذه الفلاتر" />}
        onRowClick={(r) => setDetailId(r.id)}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.total ?? 0} onChange={setPage} />

      {/* اختيار الفاتورة المصدر */}
      <SourcePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(type, id) => {
          setPickerOpen(false);
          setReturnTarget({ type, id });
        }}
      />

      {/* إنشاء المرتجع */}
      <ReturnCreateModal
        open={returnTarget != null}
        onClose={() => setReturnTarget(null)}
        type={target?.type ?? 'SALE_RETURN'}
        saleId={target && target.type === 'SALE_RETURN' ? target.id : undefined}
        purchaseId={target && target.type === 'PURCHASE_RETURN' ? target.id : undefined}
      />

      {/* تفاصيل المرتجع */}
      <Modal
        open={detailId != null}
        onClose={() => setDetailId(null)}
        size="lg"
        title="تفاصيل المرتجع"
        subtitle={detail?.invoiceNumber}
      >
        {detailLoading || !detail ? (
          <div className="flex items-center justify-center py-14">
            <Spinner size={26} />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">النوع</p>
                {detail.type === 'SALE_RETURN' ? <Badge tone="blue">مبيعات</Badge> : <Badge tone="amber">مشتريات</Badge>}
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">الفاتورة الأصلية</p>
                <p className="text-sm font-bold text-ink" dir="ltr">{detail.saleInvoice ?? detail.purchaseInvoice ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">الطرف</p>
                <p className="text-sm font-bold text-ink truncate">{detail.customer?.name ?? detail.supplier?.name ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">التاريخ</p>
                <p className="text-sm font-bold text-ink">{formatDateTime(detail.createdAt)}</p>
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">طريقة الرد</p>
                {detail.refundMethod === 'CASH' ? <Badge tone="green">نقدي</Badge> : <Badge tone="gray">على الحساب</Badge>}
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">إعادة للمخزون</p>
                {detail.restock ? <Badge tone="green">نعم</Badge> : <Badge tone="gray">لا</Badge>}
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">المستخدم</p>
                <p className="text-sm font-bold text-ink truncate">{detail.user?.fullName ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">المبلغ المردود</p>
                <p className="text-sm font-extrabold text-primary" dir="ltr">{money(detail.total, currency)}</p>
              </div>
            </div>

            {detail.reason && (
              <p className="text-xs text-ink-soft bg-surface-subtle rounded-xl p-3 leading-relaxed">السبب: {detail.reason}</p>
            )}

            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-subtle border-b border-line">
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-start">المنتج</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-center">الكمية</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-end">سعر الوحدة</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-end">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items ?? []).map((it) => (
                    <tr key={it.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 text-sm font-semibold">{it.productName}</td>
                      <td className="px-4 py-2.5 text-sm text-center" dir="ltr">{it.quantity}</td>
                      <td className="px-4 py-2.5 text-sm text-end" dir="ltr">{money(it.unitPrice, currency)}</td>
                      <td className="px-4 py-2.5 text-sm text-end font-bold" dir="ltr">{money(it.lineTotal, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl bg-surface-subtle border border-line p-4 flex items-center justify-between">
              <span className="text-sm font-bold text-ink">إجمالي المرتجع</span>
              <span className="text-lg font-extrabold text-primary" dir="ltr">{money(detail.total, currency)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────── اختيار الفاتورة المصدر ───────────────────────────

function SourcePickerModal({
  open, onClose, onPick,
}: { open: boolean; onClose: () => void; onPick: (type: ReturnType, id: number) => void }) {
  const { currency } = useSettings();
  const [tab, setTab] = useState<ReturnType>('SALE_RETURN');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setDebounced('');
      setTab('SALE_RETURN');
    }
  }, [open]);

  const salesQuery = useQuery({
    queryKey: ['return-source-sales', debounced],
    queryFn: () => invoke('sales:list', { search: debounced, page: 1, pageSize: 20 }),
    enabled: open && tab === 'SALE_RETURN' && debounced.length > 0,
    placeholderData: (prev) => prev,
  });

  const purchasesQuery = useQuery({
    queryKey: ['return-source-purchases', debounced],
    queryFn: () => invoke('purchases:list', { search: debounced, page: 1, pageSize: 20 }),
    enabled: open && tab === 'PURCHASE_RETURN' && debounced.length > 0,
    placeholderData: (prev) => prev,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="مرتجع جديد"
      subtitle="ابحث برقم الفاتورة ثم اخترها لإنشاء المرتجع"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-1 p-1 bg-surface-muted rounded-xl w-fit">
          {([
            { value: 'SALE_RETURN', label: 'مرتجع مبيعات' },
            { value: 'PURCHASE_RETURN', label: 'مرتجع مشتريات' },
          ] as { value: ReturnType; label: string }[]).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`px-4 h-9 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.value ? 'bg-white text-ink shadow-card' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={tab === 'SALE_RETURN' ? 'ابحث برقم فاتورة البيع…' : 'ابحث برقم فاتورة الشراء…'}
          autoFocus
        />

        <div className="rounded-xl border border-line overflow-hidden max-h-80 overflow-y-auto">
          {debounced.length === 0 ? (
            <p className="p-6 text-center text-xs text-ink-mute">اكتب رقم الفاتورة لعرض النتائج</p>
          ) : tab === 'SALE_RETURN' ? (
            (salesQuery.data?.data ?? []).length === 0 && !salesQuery.isFetching ? (
              <p className="p-6 text-center text-xs text-ink-mute">لا توجد فواتير مطابقة</p>
            ) : (
              (salesQuery.data?.data ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPick('SALE_RETURN', s.id)}
                  className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-primary-50/50 transition-colors text-start border-b border-line last:border-0"
                >
                  <div>
                    <p className="text-sm font-bold text-ink" dir="ltr">{s.invoiceNumber}</p>
                    <p className="text-[11px] text-ink-mute">
                      {formatDate(s.createdAt)} — {s.customer?.name ?? 'زبون نقدي'}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-ink-soft" dir="ltr">{money(s.total, currency)}</p>
                </button>
              ))
            )
          ) : (
            (purchasesQuery.data?.data ?? []).length === 0 && !purchasesQuery.isFetching ? (
              <p className="p-6 text-center text-xs text-ink-mute">لا توجد فواتير مطابقة</p>
            ) : (
              (purchasesQuery.data?.data ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick('PURCHASE_RETURN', p.id)}
                  className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-primary-50/50 transition-colors text-start border-b border-line last:border-0"
                >
                  <div>
                    <p className="text-sm font-bold text-ink" dir="ltr">{p.invoiceNumber}</p>
                    <p className="text-[11px] text-ink-mute">
                      {formatDate(p.createdAt)} — {p.supplier?.name ?? '—'}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-ink-soft" dir="ltr">{money(p.total, currency)}</p>
                </button>
              ))
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
