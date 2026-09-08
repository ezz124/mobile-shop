# -*- coding: utf-8 -*-
p = 'src/pages/Customers.tsx'
s = open(p, encoding='utf-8').read()

s = s.replace("import { Users, UserPlus, Pencil, Trash2, Phone, MapPin, Wallet, ShoppingCart, Eye } from 'lucide-react';",
              "import { Users, UserPlus, Pencil, Trash2, Phone, MapPin, Wallet, ShoppingCart, Eye, HandCoins } from 'lucide-react';")

s = s.replace("import { money, formatDate, num } from '@/lib/format';",
              "import { money, formatDate, num, PAYMENT_METHODS } from '@/lib/format';")

s = s.replace("import { SearchInput, Input, Textarea } from '@/components/ui/inputs';",
              "import { SearchInput, Input, Textarea, Select } from '@/components/ui/inputs';")

s = s.replace("""  const [detail, setDetail] = useState<CustomerDTO | null>(null);""",
"""  const [detail, setDetail] = useState<CustomerDTO | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payFor, setPayFor] = useState<CustomerDTO | null>(null);""")

s = s.replace("""        actions={
          <Button icon={<UserPlus size={17} />} onClick={() => { setEditing(EMPTY_FORM); setFormOpen(true); }}>
            عميل جديد
          </Button>
        }""",
"""        actions={
          <>
            <Button variant="outline" icon={<HandCoins size={16} />} onClick={() => { setPayFor(null); setPayOpen(true); }}>
              سداد دين عميل
            </Button>
            <Button icon={<UserPlus size={17} />} onClick={() => { setEditing(EMPTY_FORM); setFormOpen(true); }}>
              عميل جديد
            </Button>
          </>
        }""")

s = s.replace("""              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">الدين الحالي</p>
                <p className={`text-lg font-extrabold ${detailData.debt > 0 ? 'text-danger' : 'text-success'}`} dir="ltr">{money(detailData.debt, currency)}</p>
              </div>""",
"""              <div className="rounded-xl bg-surface-subtle p-3.5">
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
              </div>""")

pay_component = '''
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
            <Input dir="ltr" className="text-left font-bold" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\\D/g, ''))} placeholder="0" />
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
'''

# استبدال نهاية الملف: آخر ConfirmDialog ثم إغلاق المكون
old_tail = '''        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
'''
new_tail = '''        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
      />
''' + pay_component

assert old_tail in s, 'tail not found'
s = s.replace(old_tail, new_tail)

open(p, 'w', encoding='utf-8').write(s)
print('Customers.tsx patched OK')
