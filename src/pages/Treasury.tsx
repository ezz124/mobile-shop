import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus, ArrowDownLeft, ArrowUpRight, HandCoins } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, formatDateTime, PAYMENT_METHODS, paymentMethodLabel, daysAgo, toDateInput } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Button, PageHeader, Badge, FormField, StatCard, EmptyState, Card } from '@/components/ui/primitives';
import { Select, Input, DateRangeInput } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { TREASURY_LABELS, type TreasuryTxDTO, type TreasuryType } from '@/shared/ipc';

type ManualTxType = 'WITHDRAWAL' | 'DEPOSIT' | 'OTHER_INCOME' | 'OTHER_EXPENSE';

const MANUAL_TYPES: { value: ManualTxType; label: string; direction: 'IN' | 'OUT' }[] = [
  { value: 'WITHDRAWAL', label: 'سحب نقدي', direction: 'OUT' },
  { value: 'DEPOSIT', label: 'إيداع نقدي', direction: 'IN' },
  { value: 'OTHER_INCOME', label: 'إيراد آخر', direction: 'IN' },
  { value: 'OTHER_EXPENSE', label: 'مصروف آخر', direction: 'OUT' },
];

export default function Treasury() {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(toDateInput(new Date()));
  const [type, setType] = useState('');
  const [direction, setDirection] = useState('');
  const [page, setPage] = useState(1);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => { setPage(1); }, [from, to, type, direction]);

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['treasury-summary', from, to],
    queryFn: () => invoke('treasury:summary', { from, to }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['treasury-list', from, to, type, direction, page],
    queryFn: () => invoke('treasury:list', {
      from, to,
      type: (type || undefined) as TreasuryType | undefined,
      direction: (direction || undefined) as 'IN' | 'OUT' | undefined,
      page, pageSize: 15,
    }),
    placeholderData: (prev) => prev,
  });

  const manualMutation = useMutation({
    mutationFn: (input: { type: ManualTxType; amount: number; method: string; note?: string }) => invoke('treasury:manual', input),
    onSuccess: () => {
      success('تم تسجيل الحركة بنجاح');
      setManualOpen(false);
      queryClient.invalidateQueries({ queryKey: ['treasury-list'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر تسجيل الحركة'),
  });

  const columns: Column<TreasuryTxDTO>[] = [
    { key: 'date', header: 'التاريخ', render: (t) => <span className="text-xs text-ink-soft">{formatDateTime(t.createdAt)}</span> },
    {
      key: 'type', header: 'نوع الحركة',
      render: (t) => (
        <Badge tone={t.direction === 'IN' ? 'green' : 'red'}>
          {TREASURY_LABELS[t.type] ?? t.type}
        </Badge>
      ),
    },
    {
      key: 'in', header: 'وارد', align: 'end',
      render: (t) => t.direction === 'IN'
        ? <span dir="ltr" className="font-bold text-success">{money(t.amount, currency)}</span>
        : <span className="text-ink-mute">—</span>,
    },
    {
      key: 'out', header: 'صادر', align: 'end',
      render: (t) => t.direction === 'OUT'
        ? <span dir="ltr" className="font-bold text-danger">{money(t.amount, currency)}</span>
        : <span className="text-ink-mute">—</span>,
    },
    { key: 'method', header: 'الوسيلة', render: (t) => <span className="text-ink-soft">{paymentMethodLabel(t.method)}</span>, hideOn: 'hidden md:table-cell' },
    { key: 'note', header: 'ملاحظة', render: (t) => <span className="text-xs text-ink-mute truncate block max-w-[240px]">{t.note ?? '—'}</span>, hideOn: 'hidden lg:table-cell' },
    { key: 'user', header: 'المستخدم', render: (t) => <span className="text-ink-soft">{t.user?.fullName ?? '—'}</span>, hideOn: 'hidden lg:table-cell' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="الصندوق"
        subtitle="كل الحركات المالية للمتجر — دخل وصادر بأي وقت"
        actions={
          <Button icon={<Plus size={17} />} onClick={() => setManualOpen(true)}>حركة يدوية</Button>
        }
      />

      {/* الملخص */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard
          title="الرصيد الحالي" value={money(summary?.balance ?? 0, currency)}
          sub="رصيد الصندوق الكلي (كل الفترات)"
          icon={<Wallet size={22} />} tone={(summary?.balance ?? 0) >= 0 ? 'blue' : 'red'} delay={0}
        />
        <StatCard
          title="إجمالي الوارد (الفترة)" value={money(summary?.totalIn ?? 0, currency)}
          icon={<ArrowDownLeft size={22} />} tone="green" delay={0.05}
        />
        <StatCard
          title="إجمالي الصادر (الفترة)" value={money(summary?.totalOut ?? 0, currency)}
          icon={<ArrowUpRight size={22} />} tone="red" delay={0.1}
        />
      </div>

      {/* توزيع الأنواع */}
      <Card className="p-5">
        <h3 className="font-bold text-ink text-sm mb-3 flex items-center gap-2">
          <HandCoins size={16} className="text-primary" /> توزيع الحركات حسب النوع (الفترة المحددة)
        </h3>
        {sumLoading ? (
          <p className="text-xs text-ink-mute">جارٍ التحميل…</p>
        ) : (summary?.byType ?? []).length === 0 ? (
          <p className="text-xs text-ink-mute">لا توجد حركات في الفترة المحددة</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {summary!.byType.map((b) => (
              <div
                key={b.type}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold ${
                  b.direction === 'IN' ? 'border-success-100 bg-success-50 text-success-700' : 'border-danger-100 bg-danger-50 text-danger-600'
                }`}
              >
                <span>{TREASURY_LABELS[b.type] ?? b.type}</span>
                <span dir="ltr">{money(b.total, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* الجدول */}
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeInput from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-10 w-44 text-xs">
          <option value="">كل الأنواع</option>
          {Object.entries(TREASURY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Select value={direction} onChange={(e) => setDirection(e.target.value)} className="h-10 w-32 text-xs">
          <option value="">الكل</option>
          <option value="IN">وارد</option>
          <option value="OUT">صادر</option>
        </Select>
        {data?.sumIn != null && (
          <div className="flex items-center gap-2 text-xs font-bold">
            <Badge tone="green">وارد: {money(data.sumIn, currency)}</Badge>
            <Badge tone="red">صادر: {money(data.sumOut, currency)}</Badge>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<Wallet size={26} />} title="لا توجد حركات" description="ستظهر كل الحركات المالية هنا تلقائياً — مبيعات ومشتريات ومصروفات ومدفوعات" />}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.total ?? 0} onChange={setPage} />

      <ManualTxModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        loading={manualMutation.isPending}
        onSubmit={(v) => manualMutation.mutate(v)}
      />
    </div>
  );
}

function ManualTxModal({ open, onClose, onSubmit, loading }: {
  open: boolean; onClose: () => void;
  onSubmit: (v: { type: ManualTxType; amount: number; method: string; note?: string }) => void;
  loading: boolean;
}) {
  const [type, setType] = useState<ManualTxType>('WITHDRAWAL');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');

  const selected = MANUAL_TYPES.find((t) => t.value === type);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="حركة مالية يدوية"
      subtitle="سحب نقدي، إيداع، إيراد أو مصروف غير مرتبط بفواتير"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button loading={loading} disabled={!amount} onClick={() => onSubmit({ type, amount: Number(amount), method, note: note || undefined })}>
            تسجيل الحركة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="نوع الحركة" required>
          <Select value={type} onChange={(e) => setType(e.target.value as ManualTxType)}>
            {MANUAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label} ({t.direction === 'IN' ? 'وارد' : 'صادر'})</option>
            ))}
          </Select>
        </FormField>

        {selected && (
          <div className={`rounded-xl px-3.5 py-2.5 text-xs font-bold border ${
            selected.direction === 'IN' ? 'bg-success-50 border-success-100 text-success-700' : 'bg-danger-50 border-danger-100 text-danger-600'
          }`}>
            سيتم تسجيل الحركة كـ {selected.direction === 'IN' ? 'وارد (زيادة الرصيد)' : 'صادر (نقصان الرصيد)'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="المبلغ" required>
            <Input dir="ltr" className="text-left font-bold" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </FormField>
          <FormField label="الوسيلة">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </FormField>
        </div>

        <FormField label="ملاحظة">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: سحب شخصي، إيداع رأس مال…" />
        </FormField>
      </div>
    </Modal>
  );
}
