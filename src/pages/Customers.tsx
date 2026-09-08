import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Pencil, Trash2, Phone, MapPin, Wallet, ShoppingCart, Eye, HandCoins } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, formatDate, num, PAYMENT_METHODS } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Button, PageHeader, Badge, FormField, EmptyState } from '@/components/ui/primitives';
import { SearchInput, Input, Textarea, Select } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import type { CustomerDTO } from '@/shared/ipc';

interface CustomerForm {
  id?: number;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: CustomerForm = { name: '', phone: '', address: '', notes: '' };

export default function Customers() {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerForm>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<CustomerDTO | null>(null);
  const [detail, setDetail] = useState<CustomerDTO | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payFor, setPayFor] = useState<CustomerDTO | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', debounced, page],
    queryFn: () => invoke('customers:list', { search: debounced || undefined, page, pageSize: 15 }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (form: CustomerForm) =>
      form.id
        ? invoke('customers:update', { id: form.id, name: form.name, phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined })
        : invoke('customers:create', { name: form.name, phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined }),
    onSuccess: () => {
      success(formStateHasId() ? 'تم تحديث بيانات العميل' : 'تمت إضافة العميل بنجاح');
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حفظ العميل'),
  });

  function formStateHasId() { return editing.id != null; }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoke('customers:delete', { id }),
    onSuccess: () => {
      success('تم حذف العميل');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حذف العميل'),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['customer-detail', detail?.id],
    queryFn: () => invoke('customers:get', { id: detail!.id }),
    enabled: detail != null,
  });

  const columns: Column<CustomerDTO>[] = [
    {
      key: 'name',
      header: 'الاسم',
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary flex items-center justify-center shrink-0">
            <Users size={16} />
          </div>
          <div>
            <p className="font-semibold">{c.name}</p>
            {c.phone && <p className="text-[11px] text-ink-mute" dir="ltr">{c.phone}</p>}
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'الهاتف', render: (c) => c.phone ? <span dir="ltr" className="text-ink-soft">{c.phone}</span> : <span className="text-ink-mute">—</span>, hideOn: 'hidden md:table-cell' },
    { key: 'salesCount', header: 'عدد الفواتير', align: 'center', render: (c) => num(c.salesCount ?? 0), hideOn: 'hidden lg:table-cell' },
    { key: 'totalPurchases', header: 'إجمالي الشراء', align: 'end', render: (c) => <span dir="ltr">{money(c.totalPurchases ?? 0, currency)}</span>, hideOn: 'hidden md:table-cell' },
    {
      key: 'debt',
      header: 'الدين',
      align: 'end',
      render: (c) => {
        const debt = c.debt ?? 0;
        return debt > 0
          ? <Badge tone="red">{money(debt, currency)}</Badge>
          : <Badge tone="green">لا دين</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      render: (c) => (
        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setEditing({ id: c.id, name: c.name, phone: c.phone ?? '', address: c.address ?? '', notes: c.notes ?? '' }); setFormOpen(true); }} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors" title="تعديل">
            <Pencil size={15} className="mx-auto" />
          </button>
          <button onClick={() => setDetail(c)} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors" title="السجل">
            <Eye size={15} className="mx-auto" />
          </button>
          <button onClick={() => setDeleting(c)} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-danger-50 hover:text-danger transition-colors" title="حذف">
            <Trash2 size={15} className="mx-auto" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="العملاء"
        subtitle="إدارة بيانات العملاء وديونهم وسجل مشترياتهم"
        actions={
          <>
            <Button variant="outline" icon={<HandCoins size={16} />} onClick={() => { setPayFor(null); setPayOpen(true); }}>
              سداد دين عميل
            </Button>
            <Button icon={<UserPlus size={17} />} onClick={() => { setEditing(EMPTY_FORM); setFormOpen(true); }}>
              عميل جديد
            </Button>
          </>
        }
      />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); clearTimeout(searchTimer); searchTimer = setTimeout(() => { setDebounced(v); setPage(1); }, 250); }}
          placeholder="ابحث بالاسم أو رقم الهاتف…"
          className="w-80"
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<Users size={26} />} title="لا يوجد عملاء" description="أضف أول عميل لبدء تتبع مبيعاته وديونه" />}
        onRowClick={(c) => setDetail(c)}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.total ?? 0} onChange={setPage} />

      {/* نموذج الإضافة/التعديل */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing.id ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button loading={saveMutation.isPending} disabled={!editing.name.trim()} onClick={() => saveMutation.mutate(editing)}>
              {editing.id ? 'حفظ التعديلات' : 'إضافة العميل'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="اسم العميل" required className="sm:col-span-2">
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="الاسم الكامل" />
          </FormField>
          <FormField label="رقم الهاتف">
            <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="01xxxxxxxxx" dir="ltr" className="text-left" />
          </FormField>
          <FormField label="العنوان">
            <Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} placeholder="المدينة — المنطقة" icon={<MapPin size={15} />} />
          </FormField>
          <FormField label="ملاحظات" className="sm:col-span-2">
            <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="ملاحظات إضافية عن العميل…" />
          </FormField>
        </div>
      </Modal>

      {/* تفاصيل العميل */}
      <Modal open={detail != null} onClose={() => setDetail(null)} title={detail?.name} subtitle="سجل العميل الكامل" size="lg">
        {detailLoading || !detailData ? (
          <p className="text-sm text-ink-mute text-center py-8">جارٍ التحميل…</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">الدين الحالي</p>
                <p className={`text-lg font-extrabold ${detailData.debt > 0 ? 'text-danger' : 'text-success'}`} dir="ltr">{money(detailData.debt, currency)}</p>
                {detailData.debt > 0 && (
                  <button
                    onClick={() => { setPayFor(detailData); setPayOpen(true); }}
                    className="mt-2 h-8 px-3 rounded-lg text-[11px] font-bold text-white bg-success hover:bg-success-700 transition-colors inline-flex items-center gap-1.5"
                  >
                    <HandCoins size={13} /> سداد الدين
                  </button>
                )}
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">عدد الفواتير</p>
                <p className="text-lg font-extrabold text-ink">{num(detailData.sales.length)}</p>
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">الهاتف</p>
                <p className="text-sm font-bold text-ink flex items-center gap-1.5" dir="ltr"><Phone size={13} />{detailData.phone ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">تاريخ التسجيل</p>
                <p className="text-sm font-bold text-ink">{formatDate(detailData.createdAt)}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-ink mb-2.5 flex items-center gap-2"><ShoppingCart size={15} className="text-primary" /> فواتير العميل</h4>
              {detailData.sales.length === 0 ? (
                <p className="text-xs text-ink-mute bg-surface-subtle rounded-xl p-4 text-center">لا توجد فواتير بعد</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {detailData.sales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                      <div>
                        <p className="text-sm font-bold text-ink" dir="ltr">{s.invoiceNumber}</p>
                        <p className="text-[11px] text-ink-mute">{formatDate(s.createdAt)}</p>
                      </div>
                      <div className="text-end">
                        <p className="text-sm font-bold" dir="ltr">{money(s.total - s.returnedAmount, currency)}</p>
                        {s.remaining > 0 && <Badge tone="red">متبقٍ: {money(s.remaining, currency)}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-bold text-ink mb-2.5 flex items-center gap-2"><Wallet size={15} className="text-success" /> الدفعات</h4>
              {detailData.payments.length === 0 ? (
                <p className="text-xs text-ink-mute bg-surface-subtle rounded-xl p-4 text-center">لا توجد دفعات</p>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {detailData.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                      <div>
                        <p className="text-sm font-bold text-success" dir="ltr">{money(p.amount, currency)}</p>
                        <p className="text-[11px] text-ink-mute">{formatDate(p.createdAt)} — {p.note ?? ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        title="حذف العميل"
        message={`هل أنت متأكد من حذف العميل «${deleting?.name}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
      />

      <PayCustomerModal
        open={payOpen}
        preset={payFor}
        onClose={() => setPayOpen(false)}
        onPaid={() => {
          queryClient.invalidateQueries({ queryKey: ['customers'] });
          queryClient.invalidateQueries({ queryKey: ['customer-detail'] });
          queryClient.invalidateQueries({ queryKey: ['treasury'] });
        }}
      />
    </div>
  );
}

// ---------------------------------- سداد دين عميل ----------------------------------

function PayCustomerModal({ open, preset, onClose, onPaid }: {
  open: boolean; preset: CustomerDTO | null; onClose: () => void; onPaid: () => void;
}) {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => invoke('customers:list', { pageSize: 100, page: 1 }),
    enabled: open,
  });

  const effectiveId = preset ? String(preset.id) : customerId;
  const selected = (customers?.data ?? []).find((c) => String(c.id) === effectiveId);

  const submit = async () => {
    if (!effectiveId || !amount) return;
    setLoading(true);
    try {
      await invoke('customers:payDebt', { customerId: Number(effectiveId), amount: Number(amount), method, note: note || undefined });
      success(`تم تسجيل الدفعة بنجاح — ${money(Number(amount), currency)}`);
      setAmount(''); setNote(''); setCustomerId('');
      onPaid();
      onClose();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'تعذر تسجيل الدفعة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="سداد دين عميل"
      subtitle="تُخصم من دين العميل وتُسجَّل كحركة وارد في الصندوق"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="success" loading={loading} disabled={!effectiveId || !amount} onClick={() => void submit()}>
            تسجيل الدفعة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!preset && (
          <FormField label="العميل" required>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">اختر عميلاً…</option>
              {(customers?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} — الدين: {c.debt ?? 0}</option>
              ))}
            </Select>
          </FormField>
        )}
        {preset && (
          <div className="rounded-xl bg-primary-50 border border-primary-100 px-3.5 py-2.5">
            <p className="text-xs text-primary-700 font-bold">{preset.name}</p>
          </div>
        )}

        {selected && (
          <div className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold ${(selected.debt ?? 0) > 0 ? 'bg-danger-50 border-danger-100 text-danger' : 'bg-success-50 border-success-100 text-success'}`} dir="ltr" style={{ textAlign: 'right' }}>
            الدين الحالي: {money(selected.debt ?? 0, currency)}
          </div>
        )}
        {selected && (selected.debt ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => setAmount(String(selected.debt ?? 0))}
            className="w-full h-9 rounded-xl bg-surface-muted text-xs font-bold text-primary hover:bg-primary-50 transition-colors"
          >
            سداد كامل الدين ({money(selected.debt ?? 0, currency)})
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="المبلغ" required>
            <Input dir="ltr" className="text-left font-bold" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </FormField>
          <FormField label="طريقة الدفع">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </FormField>
        </div>

        <FormField label="ملاحظة">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
        </FormField>
      </div>
    </Modal>
  );
}

let searchTimer: ReturnType<typeof setTimeout>;
