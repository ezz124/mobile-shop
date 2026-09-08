import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Pencil, Trash2, FolderTree, CalendarDays } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, num, formatDate, formatDateTime, PAYMENT_METHODS, paymentMethodLabel, daysAgo, toDateInput } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Button, PageHeader, Badge, FormField, StatCard, EmptyState } from '@/components/ui/primitives';
import { SearchInput, Input, Select, Textarea, DateRangeInput } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import type { ExpenseDTO, ExpenseCategoryDTO } from '@/shared/ipc';

interface ExpenseForm { id?: number; categoryId: string; amount: string; description: string; method: string }
const EMPTY: ExpenseForm = { categoryId: '', amount: '', description: '', method: 'CASH' };

export default function Expenses() {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const now = new Date();
  const monthStart = toDateInput(new Date(now.getFullYear(), now.getMonth(), 1));

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(toDateInput(now));
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseForm>(EMPTY);
  const [deleting, setDeleting] = useState<ExpenseDTO | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);

  useEffect(() => { setPage(1); }, [from, to, categoryId]);

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => invoke('expenseCategories:list', {}),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', from, to, categoryId, page],
    queryFn: () => invoke('expenses:list', {
      from, to,
      categoryId: categoryId ? Number(categoryId) : undefined,
      page, pageSize: 15,
    }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        categoryId: Number(editing.categoryId),
        amount: Number(editing.amount),
        description: editing.description.trim() || undefined,
        method: editing.method,
      };
      return editing.id
        ? invoke('expenses:update', { id: editing.id, ...payload })
        : invoke('expenses:create', payload);
    },
    onSuccess: () => {
      success(editing.id ? 'تم تحديث المصروف' : 'تم تسجيل المصروف وخصمه من الصندوق');
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حفظ المصروف'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoke('expenses:delete', { id }),
    onSuccess: () => {
      success('تم حذف المصروف وإرجاع المبلغ للصندوق');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حذف المصروف'),
  });

  const columns: Column<ExpenseDTO>[] = [
    { key: 'date', header: 'التاريخ', render: (e) => <span className="text-xs text-ink-soft">{formatDate(e.createdAt)}</span> },
    {
      key: 'category', header: 'التصنيف',
      render: (e) => <Badge tone="gray">{e.category?.name ?? '—'}</Badge>,
    },
    { key: 'description', header: 'الوصف', render: (e) => <span className="text-ink-soft truncate block max-w-[260px]">{e.description ?? '—'}</span> },
    { key: 'method', header: 'طريقة الدفع', render: (e) => <span className="text-ink-soft">{paymentMethodLabel(e.method)}</span>, hideOn: 'hidden md:table-cell' },
    { key: 'user', header: 'المستخدم', render: (e) => <span className="text-ink-soft">{e.user?.fullName ?? '—'}</span>, hideOn: 'hidden lg:table-cell' },
    { key: 'amount', header: 'المبلغ', align: 'end', render: (e) => <span dir="ltr" className="font-bold text-danger">{money(e.amount, currency)}</span> },
    {
      key: 'actions', header: 'إجراءات', align: 'center',
      render: (e) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => { setEditing({ id: e.id, categoryId: String(e.categoryId), amount: String(e.amount), description: e.description ?? '', method: e.method }); setFormOpen(true); }} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors">
            <Pencil size={15} className="mx-auto" />
          </button>
          <button onClick={() => setDeleting(e)} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-danger-50 hover:text-danger transition-colors">
            <Trash2 size={15} className="mx-auto" />
          </button>
        </div>
      ),
    },
  ];

  const monthTotal = data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="المصروفات"
        subtitle="تسجيل مصروفات المتجر — تُخصم تلقائياً من رصيد الصندوق"
        actions={
          <>
            <Button variant="outline" icon={<FolderTree size={16} />} onClick={() => setCatsOpen(true)}>التصنيفات</Button>
            <Button icon={<Plus size={17} />} onClick={() => { setEditing(EMPTY); setFormOpen(true); }}>مصروف جديد</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="مجموع مصروفات الفترة" value={money(monthTotal, currency)} sub={`من ${formatDate(from)} إلى ${formatDate(to)}`} icon={<Receipt size={22} />} tone="red" />
        <StatCard title="عدد السجلات" value={num(data?.count ?? 0)} icon={<CalendarDays size={22} />} tone="gray" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeInput from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 w-44 text-xs">
          <option value="">كل التصنيفات</option>
          {(categories ?? []).map((c: ExpenseCategoryDTO) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<Receipt size={26} />} title="لا توجد مصروفات" description="سجّل مصروفات المتجر ليتم خصمها من الصندوق تلقائياً" />}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.count ?? 0} onChange={setPage} />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing.id ? 'تعديل المصروف' : 'تسجيل مصروف جديد'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button variant="danger" loading={saveMutation.isPending} disabled={!editing.categoryId || !editing.amount} onClick={() => saveMutation.mutate()}>
              {editing.id ? 'حفظ التعديلات' : 'تسجيل المصروف'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="التصنيف" required>
            <Select value={editing.categoryId} onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}>
              <option value="">اختر التصنيف…</option>
              {(categories ?? []).map((c: ExpenseCategoryDTO) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="المبلغ" required>
              <Input dir="ltr" className="text-left font-bold" inputMode="numeric" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value.replace(/\D/g, '') })} placeholder="0" />
            </FormField>
            <FormField label="طريقة الدفع">
              <Select value={editing.method} onChange={(e) => setEditing({ ...editing, method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="الوصف">
            <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="تفاصيل المصروف…" className="min-h-[64px]" />
          </FormField>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        title="حذف المصروف"
        message={`سيتم حذف المصروف بقيمة ${money(deleting?.amount ?? 0, currency)} وإرجاع المبلغ إلى الصندوق. متابعة؟`}
        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
      />

      <ManageExpenseCategories open={catsOpen} onClose={() => setCatsOpen(false)} />
    </div>
  );
}

function ManageExpenseCategories({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => invoke('expenseCategories:list', {}),
    enabled: open,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['expense-categories'] });

  const addMutation = useMutation({
    mutationFn: () => invoke('expenseCategories:create', { name: name.trim() }),
    onSuccess: () => { success('تمت إضافة التصنيف'); setName(''); invalidate(); },
    onError: (e) => toastError(e instanceof Error ? e.message : 'خطأ'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoke('expenseCategories:delete', { id }),
    onSuccess: () => { success('تم الحذف'); invalidate(); },
    onError: (e) => toastError(e instanceof Error ? e.message : 'لا يمكن حذف تصنيف مرتبط بمصروفات'),
  });

  return (
    <Modal open={open} onClose={onClose} title="تصنيفات المصروفات" size="sm">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="تصنيف جديد…" className="h-10 text-sm" />
          <Button size="sm" onClick={() => addMutation.mutate()} loading={addMutation.isPending} disabled={!name.trim()} icon={<Plus size={14} />} className="shrink-0">إضافة</Button>
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {(categories ?? []).map((c: ExpenseCategoryDTO) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5">
              <span className="text-sm font-medium text-ink">{c.name}</span>
              <div className="flex items-center gap-2">
                {c.usageCount != null && <Badge tone="gray">{c.usageCount}</Badge>}
                <button onClick={() => deleteMutation.mutate(c.id)} className="text-ink-mute hover:text-danger transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
