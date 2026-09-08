import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, UserPlus, Pencil, Trash2, Phone, MapPin, Wallet, Truck, Eye, HandCoins } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, formatDate, num, PAYMENT_METHODS } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Button, PageHeader, Badge, FormField, EmptyState } from '@/components/ui/primitives';
import { SearchInput, Input, Textarea, Select } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import type { SupplierDTO } from '@/shared/ipc';

interface SupplierForm { id?: number; name: string; phone: string; address: string; notes: string }
const EMPTY_FORM: SupplierForm = { name: '', phone: '', address: '', notes: '' };

export default function Suppliers() {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierForm>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<SupplierDTO | null>(null);
  const [detail, setDetail] = useState<SupplierDTO | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDebounced(search); setPage(1); }, 250);
    return () => clearTimeout(timer.current);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', debounced, page],
    queryFn: () => invoke('suppliers:list', { search: debounced || undefined, page, pageSize: 15 }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (form: SupplierForm) =>
      form.id
        ? invoke('suppliers:update', { id: form.id, name: form.name, phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined })
        : invoke('suppliers:create', { name: form.name, phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined }),
    onSuccess: () => {
      success(editing.id ? 'تم تحديث بيانات المورد' : 'تمت إضافة المورد بنجاح');
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حفظ المورد'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoke('suppliers:delete', { id }),
    onSuccess: () => {
      success('تم حذف المورد');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حذف المورد'),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['supplier-detail', detail?.id],
    queryFn: () => invoke('suppliers:get', { id: detail!.id }),
    enabled: detail != null,
  });

  const columns: Column<SupplierDTO>[] = [
    {
      key: 'name', header: 'المورد',
      render: (s) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary flex items-center justify-center shrink-0">
            <Building2 size={16} />
          </div>
          <div>
            <p className="font-semibold">{s.name}</p>
            {s.phone && <p className="text-[11px] text-ink-mute" dir="ltr">{s.phone}</p>}
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'الهاتف', render: (s) => s.phone ? <span dir="ltr" className="text-ink-soft">{s.phone}</span> : <span className="text-ink-mute">—</span>, hideOn: 'hidden md:table-cell' },
    { key: 'purchasesCount', header: 'عدد الفواتير', align: 'center', render: (s) => num(s.purchasesCount ?? 0), hideOn: 'hidden lg:table-cell' },
    { key: 'totalPurchases', header: 'إجمالي المشتريات', align: 'end', render: (s) => <span dir="ltr">{money(s.totalPurchases ?? 0, currency)}</span>, hideOn: 'hidden md:table-cell' },
    {
      key: 'balance', header: 'الذمة المتبقية', align: 'end',
      render: (s) => {
        const bal = s.balance ?? 0;
        return bal > 0 ? <Badge tone="red">{money(bal, currency)}</Badge> : <Badge tone="green">مسدّد</Badge>;
      },
    },
    {
      key: 'actions', header: 'إجراءات', align: 'center',
      render: (s) => (
        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setEditing({ id: s.id, name: s.name, phone: s.phone ?? '', address: s.address ?? '', notes: s.notes ?? '' }); setFormOpen(true); }} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors" title="تعديل">
            <Pencil size={15} className="mx-auto" />
          </button>
          <button onClick={() => setDetail(s)} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors" title="السجل">
            <Eye size={15} className="mx-auto" />
          </button>
          <button onClick={() => setDeleting(s)} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-danger-50 hover:text-danger transition-colors" title="حذف">
            <Trash2 size={15} className="mx-auto" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="الموردون"
        subtitle="إدارة الموردين وذممهم وسجل المشتريات"
        actions={
          <>
            <Button variant="outline" icon={<HandCoins size={16} />} onClick={() => setPayOpen(true)}>سداد لمورد</Button>
            <Button icon={<UserPlus size={17} />} onClick={() => { setEditing(EMPTY_FORM); setFormOpen(true); }}>مورد جديد</Button>
          </>
        }
      />

      <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو رقم الهاتف…" className="w-80" />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<Building2 size={26} />} title="لا يوجد موردون" description="أضف أول مورد لبدء تسجيل فواتير الشراء والذمم" />}
        onRowClick={(s) => setDetail(s)}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.total ?? 0} onChange={setPage} />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing.id ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button loading={saveMutation.isPending} disabled={!editing.name.trim()} onClick={() => saveMutation.mutate(editing)}>
              {editing.id ? 'حفظ التعديلات' : 'إضافة المورد'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="اسم المورد" required className="sm:col-span-2">
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="الاسم أو اسم الشركة" />
          </FormField>
          <FormField label="رقم الهاتف">
            <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="01xxxxxxxxx" dir="ltr" className="text-left" />
          </FormField>
          <FormField label="العنوان">
            <Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} placeholder="المدينة — المنطقة" icon={<MapPin size={15} />} />
          </FormField>
          <FormField label="ملاحظات" className="sm:col-span-2">
            <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="ملاحظات إضافية…" />
          </FormField>
        </div>
      </Modal>

      {/* تفاصيل المورد */}
      <Modal open={detail != null} onClose={() => setDetail(null)} title={detail?.name} subtitle="سجل المورد الكامل" size="lg">
        {detailLoading || !detailData ? (
          <p className="text-sm text-ink-mute text-center py-8">جارٍ التحميل…</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">الذمة الحالية</p>
                <p className={`text-lg font-extrabold ${detailData.balance > 0 ? 'text-danger' : 'text-success'}`} dir="ltr">{money(detailData.balance, currency)}</p>
              </div>
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">عدد الفواتير</p>
                <p className="text-lg font-extrabold text-ink">{num(detailData.purchases.length)}</p>
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
              <h4 className="text-sm font-bold text-ink mb-2.5 flex items-center gap-2"><Truck size={15} className="text-primary" /> فواتير الشراء</h4>
              {detailData.purchases.length === 0 ? (
                <p className="text-xs text-ink-mute bg-surface-subtle rounded-xl p-4 text-center">لا توجد فواتير بعد</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {detailData.purchases.map((p) => {
                    const remaining = p.total - p.returnedAmount - p.paidAmount;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                        <div>
                          <p className="text-sm font-bold text-ink" dir="ltr">{p.invoiceNumber}</p>
                          <p className="text-[11px] text-ink-mute">{formatDate(p.createdAt)}</p>
                        </div>
                        <div className="text-end">
                          <p className="text-sm font-bold" dir="ltr">{money(p.total - p.returnedAmount, currency)}</p>
                          {remaining > 0 && <Badge tone="red">متبقٍ: {money(remaining, currency)}</Badge>}
                        </div>
                      </div>
                    );
                  })}
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
                        <p className="text-sm font-bold text-danger" dir="ltr">{money(p.amount, currency)}</p>
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
        title="حذف المورد"
        message={`هل أنت متأكد من حذف المورد «${deleting?.name}»؟ لا يمكن حذف مورد له فواتير شراء.`}
        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
      />

      <PaySupplierModal open={payOpen} onClose={() => setPayOpen(false)} />
    </div>
  );
}

function PaySupplierModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => invoke('suppliers:list', { pageSize: 100, page: 1 }),
    enabled: open,
  });

  const selected = (suppliers?.data ?? []).find((s) => String(s.id) === supplierId);

  const submit = async () => {
    if (!supplierId || !amount) return;
    setLoading(true);
    try {
      await invoke('suppliers:payDebt', { supplierId: Number(supplierId), amount: Number(amount), method, note: note || undefined });
      success('تم تسجيل الدفعة بنجاح');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      setSupplierId(''); setAmount(''); setNote('');
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
      title="سداد دفعة لمورد"
      subtitle="تُخصم من الذمة وتُسجَّل كحركة صادر في الصندوق"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="success" loading={loading} disabled={!supplierId || !amount} onClick={() => void submit()}>تسجيل الدفعة</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="المورد" required>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">اختر مورداً…</option>
            {(suppliers?.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name} — الذمة: {s.balance ?? 0}</option>
            ))}
          </Select>
        </FormField>

        {selected && (
          <div className="rounded-xl bg-danger-50 border border-danger-100 px-3.5 py-2.5 text-xs text-danger font-semibold" dir="ltr" style={{ textAlign: 'right' }}>
            الذمة الحالية: {money(selected.balance ?? 0, currency)}
          </div>
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
