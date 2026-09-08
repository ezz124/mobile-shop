import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Smartphone, ShieldCheck, RotateCcw } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, formatDate, UNIT_STATUS_LABELS } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Badge, Tabs, EmptyState } from '@/components/ui/primitives';
import { SearchInput, Select } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/Modal';
import ProductsView from '@/components/ProductsView';
import type { PhoneUnitDTO } from '@/shared/ipc';

type Tab = 'products' | 'units';

export default function Phones() {
  const [tab, setTab] = useState<Tab>('products');
  return (
    <div className="space-y-5">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'products', label: 'موديلات الهواتف' },
          { value: 'units', label: 'الأجهزة (IMEI)' },
        ]}
      />
      {tab === 'products' ? <ProductsView type="PHONE" /> : <UnitsBrowser />}
    </div>
  );
}

function UnitsBrowser() {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<{ unit: PhoneUnitDTO; next: PhoneUnitDTO['status'] } | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDebounced(search); setPage(1); }, 250);
    return () => clearTimeout(timer.current);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['phone-units', debounced, status, page],
    queryFn: () => invoke('phoneUnits:list', {
      search: debounced || undefined,
      status: status || undefined,
      page,
      pageSize: 15,
    }),
    placeholderData: (prev) => prev,
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: PhoneUnitDTO['status'] }) => invoke('phoneUnits:setStatus', input),
    onSuccess: () => {
      success('تم تحديث حالة الجهاز');
      setConfirming(null);
      queryClient.invalidateQueries({ queryKey: ['phone-units'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر تحديث الحالة'),
  });

  const columns: Column<PhoneUnitDTO>[] = [
    {
      key: 'imei1', header: 'IMEI 1',
      render: (u) => <p className="font-mono font-bold text-sm" dir="ltr">{u.imei1}</p>,
    },
    { key: 'imei2', header: 'IMEI 2', render: (u) => u.imei2 ? <span dir="ltr" className="font-mono text-xs text-ink-soft">{u.imei2}</span> : <span className="text-ink-mute">—</span>, hideOn: 'hidden lg:table-cell' },
    { key: 'serial', header: 'الرقم التسلسلي', render: (u) => u.serialNumber ? <span dir="ltr" className="font-mono text-xs text-ink-soft">{u.serialNumber}</span> : <span className="text-ink-mute">—</span>, hideOn: 'hidden md:table-cell' },
    { key: 'product', header: 'المنتج', render: (u) => <span className="font-medium">{u.product?.name ?? '—'}</span> },
    {
      key: 'status', header: 'الحالة', align: 'center',
      render: (u) => {
        const tone = u.status === 'IN_STOCK' ? 'green' : u.status === 'SOLD' ? 'gray' : u.status === 'DEFECTIVE' ? 'red' : 'amber';
        return <Badge tone={tone}>{UNIT_STATUS_LABELS[u.status]}</Badge>;
      },
    },
    { key: 'price', header: 'سعر البيع', align: 'end', render: (u) => u.sellingPrice != null ? <span dir="ltr" className="font-bold">{money(u.sellingPrice, currency)}</span> : <span className="text-ink-mute">—</span>, hideOn: 'hidden md:table-cell' },
    { key: 'soldAt', header: 'تاريخ البيع', render: (u) => u.soldAt ? formatDate(u.soldAt) : <span className="text-ink-mute">—</span>, hideOn: 'hidden lg:table-cell' },
    {
      key: 'actions', header: 'إجراءات', align: 'center',
      render: (u) => (
        u.status === 'SOLD' ? <span className="text-[11px] text-ink-mute">مبيع</span> : (
          u.status === 'IN_STOCK' ? (
            <button
              onClick={() => setConfirming({ unit: u, next: 'DEFECTIVE' })}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-warning bg-warning-50 hover:bg-warning-100 transition-colors flex items-center gap-1.5 mx-auto"
            >
              <ShieldCheck size={13} /> تعليم كتالف
            </button>
          ) : (
            <button
              onClick={() => setConfirming({ unit: u, next: 'IN_STOCK' })}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-success bg-success-50 hover:bg-success-100 transition-colors flex items-center gap-1.5 mx-auto"
            >
              <RotateCcw size={13} /> إعادة للمخزون
            </button>
          )
        )
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="ابحث برقم IMEI أو الرقم التسلسلي…" className="w-80" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 w-36 text-xs">
          <option value="">كل الحالات</option>
          <option value="IN_STOCK">متوفر</option>
          <option value="SOLD">مبيع</option>
          <option value="RETURNED">مُرجع</option>
          <option value="DEFECTIVE">تالف</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<Smartphone size={26} />} title="لا توجد أجهزة" description="أجهزة الـ IMEI تُسجَّل تلقائياً عند إنشاء فواتير الشراء" />}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.total ?? 0} onChange={setPage} />

      <ConfirmDialog
        open={confirming != null}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && statusMutation.mutate({ id: confirming.unit.id, status: confirming.next })}
        title={confirming?.next === 'DEFECTIVE' ? 'تعليم الجهاز كتالف' : 'إعادة الجهاز للمخزون'}
        message={
          confirming?.next === 'DEFECTIVE'
            ? `سيتم تعليم الجهاز ${confirming?.unit.imei1} كتالف وخصمه من المخزون. متابعة؟`
            : `سيتم إعادة الجهاز ${confirming?.unit.imei1} للمخزون وإضافه للكمية المتاحة. متابعة؟`
        }
        confirmLabel="متابعة"
        danger={confirming?.next === 'DEFECTIVE'}
        loading={statusMutation.isPending}
      />
    </div>
  );
}
