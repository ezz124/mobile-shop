import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package, Boxes, Coins, BadgeDollarSign, AlertTriangle, SlidersHorizontal,
  ArrowDownLeft, ArrowUpRight, Warehouse,
} from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, num, formatDateTime, MOVEMENT_LABELS, daysAgo, toDateInput } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Badge, Button, FormField, StatCard, EmptyState } from '@/components/ui/primitives';
import { SearchInput, Select, Input, DateRangeInput } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import type { MovementDTO, ProductDTO, InventoryReportData } from '@/shared/ipc';

const MOVEMENT_TONES: Record<string, 'green' | 'blue' | 'purple' | 'amber' | 'gray' | 'red'> = {
  PURCHASE: 'green', SALE: 'blue', RETURN_IN: 'purple', RETURN_OUT: 'amber',
  ADJUSTMENT: 'gray', INITIAL: 'gray', DAMAGE: 'red',
};

export default function Inventory() {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [adjustOpen, setAdjustOpen] = useState(false);

  // حركات المخزون
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(toDateInput(new Date()));
  const [page, setPage] = useState(1);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDebounced(search); setPage(1); }, 250);
    return () => clearTimeout(timer.current);
  }, [search]);
  useEffect(() => { setPage(1); }, [type, from, to]);

  const { data: valuation, isLoading: valLoading } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => invoke('inventory:valuation', {}),
  });

  const { data: movements, isLoading: movLoading } = useQuery({
    queryKey: ['movements', debounced, type, from, to, page],
    queryFn: () => invoke('inventory:movements', {
      search: debounced || undefined,
      type: type || undefined,
      from,
      to,
      page,
      pageSize: 15,
    }),
    placeholderData: (prev) => prev,
  });

  const movementColumns: Column<MovementDTO>[] = [
    { key: 'date', header: 'التاريخ', render: (m) => <span className="text-xs text-ink-soft">{formatDateTime(m.createdAt)}</span> },
    { key: 'product', header: 'المنتج', render: (m) => <span className="font-medium">{m.product?.name ?? '—'}</span> },
    {
      key: 'type', header: 'نوع الحركة', align: 'center',
      render: (m) => <Badge tone={MOVEMENT_TONES[m.type] ?? 'gray'}>{MOVEMENT_LABELS[m.type] ?? m.type}</Badge>,
    },
    {
      key: 'change', header: 'التغيير', align: 'center',
      render: (m) => (
        <span dir="ltr" className={`font-bold inline-flex items-center gap-1 ${m.quantityChange > 0 ? 'text-success' : 'text-danger'}`}>
          {m.quantityChange > 0 ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
          {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
        </span>
      ),
    },
    { key: 'balance', header: 'الرصيد بعدها', align: 'center', render: (m) => <span dir="ltr" className="font-semibold">{num(m.balanceAfter)}</span> },
    { key: 'note', header: 'ملاحظة', render: (m) => <span className="text-xs text-ink-mute truncate block max-w-[220px]">{m.note ?? m.referenceType ?? '—'}</span>, hideOn: 'hidden lg:table-cell' },
  ];

  const v: InventoryReportData | undefined = valuation;

  return (
    <div className="space-y-6">
      {/* بطاقات التقييم */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="إجمالي المنتجات" value={num(v?.totalProducts ?? 0)} icon={<Package size={22} />} tone="blue" delay={0} />
        <StatCard title="القطع بالمخزون" value={num(v?.totalUnits ?? 0)} icon={<Boxes size={22} />} tone="gray" delay={0.05} />
        <StatCard title="قيمة المخزون" value={money(v?.stockValue ?? 0, currency)} sub="بسعر الشراء" icon={<Coins size={22} />} tone="amber" delay={0.1} />
        <StatCard title="القيمة البيعية" value={money(v?.retailValue ?? 0, currency)} sub="بسعر البيع" icon={<BadgeDollarSign size={22} />} tone="green" delay={0.15} />
        <StatCard title="منتجات منتهية" value={num(v?.outOfStock ?? 0)} icon={<AlertTriangle size={22} />} tone={(v?.outOfStock ?? 0) > 0 ? 'red' : 'gray'} delay={0.2} />
      </div>

      {/* تنبيهات النقص */}
      {v && v.lowStock.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-warning-50 text-warning flex items-center justify-center">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="font-bold text-ink text-sm">تنبيهات نقص المخزون</h3>
              <p className="text-[11px] text-ink-mute">{v.lowStock.length} منتج وصل للحد الأدنى أو أقل</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {v.lowStock.slice(0, 9).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-warning-100 bg-warning-50/50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                  <p className="text-[11px] text-ink-mute">الحد الأدنى: {num(p.minStock)}</p>
                </div>
                <Badge tone={p.quantity === 0 ? 'red' : 'amber'}>{num(p.quantity)}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الحركات */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary flex items-center justify-center">
              <Warehouse size={18} />
            </div>
            <h3 className="font-bold text-ink">حركات المخزون</h3>
          </div>
          <Button variant="outline" icon={<SlidersHorizontal size={16} />} onClick={() => setAdjustOpen(true)}>
            تعديل كمية منتج
          </Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث…" className="w-64" />
          <DateRangeInput from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="h-10 w-40 text-xs">
            <option value="">كل الحركات</option>
            {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>

        <DataTable
          columns={movementColumns}
          rows={movements?.data ?? []}
          loading={movLoading || valLoading}
          empty={<EmptyState icon={<Warehouse size={26} />} title="لا توجد حركات" description="ستظهر حركات المخزون هنا بعد أول عملية بيع أو شراء أو تعديل" />}
        />

        <Pagination page={page} pageSize={movements?.pageSize ?? 15} total={movements?.total ?? 0} onChange={setPage} />
      </div>

      <AdjustModal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onDone={() => {
          success('تم تعديل الكمية وتسجيل الحركة');
          queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
          queryClient.invalidateQueries({ queryKey: ['movements'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          setAdjustOpen(false);
        }}
        onError={(m) => toastError(m)}
      />
    </div>
  );
}

function AdjustModal({ open, onClose, onDone, onError }: { open: boolean; onClose: () => void; onDone: () => void; onError: (msg: string) => void }) {
  const [productSearch, setProductSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [productId, setProductId] = useState('');
  const [mode, setMode] = useState<'set' | 'change'>('set');
  const [value, setValue] = useState('');
  const [type, setType] = useState('ADJUSTMENT');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(productSearch), 250);
    return () => clearTimeout(t);
  }, [productSearch]);

  const { data: products } = useQuery({
    queryKey: ['adjust-products', debounced],
    queryFn: () => invoke('products:list', { search: debounced || undefined, type: 'ACCESSORY', pageSize: 50, activeOnly: true }),
    enabled: open,
  });

  const selected = (products?.data ?? []).find((p: ProductDTO) => String(p.id) === productId);

  const submit = async () => {
    if (!productId || value === '') return;
    setLoading(true);
    try {
      await invoke('inventory:adjust', {
        productId: Number(productId),
        ...(mode === 'set' ? { newQuantity: Number(value) } : { change: Number(value) }),
        type: type === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT',
        reason: reason || undefined,
      });
      onDone();
      setValue(''); setReason(''); setProductId('');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'تعذر تعديل الكمية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تعديل كمية منتج"
      subtitle="للهواتف تُدار الكميات تلقائياً عبر أجهزة الـ IMEI"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button loading={loading} disabled={!productId || value === ''} onClick={() => void submit()}>تنفيذ التعديل</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="المنتج" required>
          <SearchInput value={productSearch} onChange={setProductSearch} placeholder="ابحث عن ملحق…" />
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-2">
            <option value="">اختر منتجاً…</option>
            {(products?.data ?? []).map((p: ProductDTO) => (
              <option key={p.id} value={p.id}>{p.name} — متوفر: {p.quantity}</option>
            ))}
          </Select>
        </FormField>

        {selected && (
          <div className="rounded-xl bg-primary-50 border border-primary-100 px-3.5 py-2.5 text-xs text-primary-700 font-semibold">
            الكمية الحالية: {selected.quantity} — الحد الأدنى: {selected.minStock}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="طريقة التعديل">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'set' | 'change')}>
              <option value="set">تعيين كمية جديدة</option>
              <option value="change">تغيير نسبي (±)</option>
            </Select>
          </FormField>
          <FormField label={mode === 'set' ? 'الكمية الجديدة' : 'مقدار التغيير'} required>
            <Input
              dir="ltr" className="text-left font-semibold" inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^-\d]/g, mode === 'set' ? '' : ''))}
              placeholder={mode === 'set' ? '10' : '-2 أو 5'}
            />
          </FormField>
        </div>

        <FormField label="نوع التعديل">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ADJUSTMENT">تعديل جرد</option>
            <option value="DAMAGE">إتلاف / تلف</option>
          </Select>
        </FormField>

        <FormField label="السبب / ملاحظة">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: جرد شهري" />
        </FormField>
      </div>
    </Modal>
  );
}
