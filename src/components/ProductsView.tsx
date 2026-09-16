import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Pencil, Trash2, Power, Smartphone, Headphones, PlusCircle, MinusCircle, Scale } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, num, formatDate, UNIT_STATUS_LABELS } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Badge, Switch, PageHeader, EmptyState } from '@/components/ui/primitives';
import { SearchInput, Select } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import ProductFormModal from '@/components/ProductFormModal';
import { AddPhoneUnitsModal, RemovePhoneUnitsModal, AdjustAccessoryModal } from './ProductAdjustModals';
import type { ProductDTO, CategoryDTO, BrandDTO, PhoneUnitDTO } from '@/shared/ipc';

export default function ProductsView({ type }: { type?: 'PHONE' | 'ACCESSORY' }) {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [lowStock, setLowStock] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDTO | null>(null);
  const [deleting, setDeleting] = useState<ProductDTO | null>(null);
  const [addingUnits, setAddingUnits] = useState<ProductDTO | null>(null);
  const [removingUnits, setRemovingUnits] = useState<ProductDTO | null>(null);
  const [adjusting, setAdjusting] = useState<{ product: ProductDTO, defaultMode: 'add' | 'remove' } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDebounced(search); setPage(1); }, 250);
    return () => clearTimeout(timer.current);
  }, [search]);
  useEffect(() => { setPage(1); }, [categoryId, brandId, lowStock, type]);

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => invoke('categories:list', {}) });
  const { data: brands } = useQuery({ queryKey: ['brands'], queryFn: () => invoke('brands:list', {}) });

  const { data, isLoading } = useQuery({
    queryKey: ['products', debounced, type, categoryId, brandId, lowStock, page],
    queryFn: () => invoke('products:list', {
      search: debounced || undefined,
      type,
      categoryId: categoryId ? Number(categoryId) : undefined,
      brandId: brandId ? Number(brandId) : undefined,
      lowStock: lowStock || undefined,
      page,
      pageSize: 15,
    }),
    placeholderData: (prev) => prev,
  });

  const toggleActive = useMutation({
    mutationFn: (p: ProductDTO) => invoke('products:update', { id: p.id, isActive: !p.isActive }),
    onSuccess: (_d, p) => {
      success(p.isActive ? `تم تعطيل «${p.name}»` : `تم تفعيل «${p.name}»`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر التنفيذ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoke('products:delete', { id }),
    onSuccess: () => {
      success('تم حذف المنتج');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حذف المنتج'),
  });

  const { data: detail } = useQuery({
    queryKey: ['product-detail', detailId],
    queryFn: () => invoke('products:get', { id: detailId! }),
    enabled: detailId != null,
  });

  const title = type === 'PHONE' ? 'الهواتف' : type === 'ACCESSORY' ? 'الملحقات' : 'المنتجات';
  const subtitle = type === 'PHONE'
    ? 'إدارة موديلات الهواتف — الكميات تُدار عبر أجهزة الـ IMEI'
    : type === 'ACCESSORY'
      ? 'الشواحن والسماعات والحمايات وغيرها'
      : 'كل منتجات المتجر — هواتف وملحقات';

  const columns: Column<ProductDTO>[] = [
    {
      key: 'name',
      header: 'المنتج',
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${p.type === 'PHONE' ? 'bg-primary-50 text-primary' : 'bg-surface-muted text-ink-soft'}`}>
            {p.type === 'PHONE' ? <Smartphone size={16} /> : <Headphones size={16} />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate max-w-[260px]">{p.name}</p>
            <p className="text-[11px] text-ink-mute" dir="ltr">{p.sku ?? p.barcode ?? '—'}</p>
          </div>
        </div>
      ),
    },
    ...(type == null ? [{
      key: 'type', header: 'النوع', align: 'center' as const,
      render: (p: ProductDTO) => p.type === 'PHONE' ? <Badge tone="blue">هاتف</Badge> : <Badge tone="gray">ملحق</Badge>,
    }] : []),
    { key: 'category', header: 'التصنيف', render: (p) => <span className="text-ink-soft">{p.category?.name ?? '—'}</span>, hideOn: 'hidden md:table-cell' },
    { key: 'brand', header: 'الماركة', render: (p) => <span className="text-ink-soft" dir="ltr">{p.brand?.name ?? '—'}</span>, hideOn: 'hidden lg:table-cell' },
    { key: 'purchasePrice', header: 'سعر الشراء', align: 'end', render: (p) => <span dir="ltr" className="text-ink-soft">{money(p.purchasePrice, currency)}</span>, hideOn: 'hidden md:table-cell' },
    { key: 'sellingPrice', header: 'سعر البيع', align: 'end', render: (p) => <span dir="ltr" className="font-bold">{money(p.sellingPrice, currency)}</span> },
    {
      key: 'quantity', header: 'الكمية', align: 'center',
      render: (p) => {
        if (p.quantity === 0) return <Badge tone="red">منتهي</Badge>;
        if (p.quantity <= p.minStock) return <Badge tone="amber">منخفض • المتاح: {num(p.quantity)}</Badge>;
        return <span className="font-bold" dir="ltr">{num(p.quantity)}</span>;
      },
    },
    {
      key: 'isActive', header: 'الحالة', align: 'center', hideOn: 'hidden lg:table-cell',
      render: (p) => p.isActive ? <Badge tone="green">مفعّل</Badge> : <Badge tone="gray">معطّل</Badge>,
    },
    {
      key: 'actions', header: 'إجراءات', align: 'center',
      render: (p) => (
        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          {p.type === 'PHONE' && (
            <>
              <button onClick={() => setAddingUnits(p)} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-success-50 hover:text-success transition-colors" title="إضافة أجهزة (زيادة كمية)">
                <PlusCircle size={15} className="mx-auto" />
              </button>
              <button onClick={() => setRemovingUnits(p)} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-warning-50 hover:text-warning transition-colors" title="إزالة أجهزة (تقليل كمية)">
                <MinusCircle size={15} className="mx-auto" />
              </button>
            </>
          )}
          {p.type === 'ACCESSORY' && (
            <>
              <button onClick={() => setAdjusting({ product: p, defaultMode: 'add' })} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-success-50 hover:text-success transition-colors" title="زيادة كمية">
                <PlusCircle size={15} className="mx-auto" />
              </button>
              <button onClick={() => setAdjusting({ product: p, defaultMode: 'remove' })} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-warning-50 hover:text-warning transition-colors" title="تقليل كمية">
                <MinusCircle size={15} className="mx-auto" />
              </button>
            </>
          )}
          <button onClick={() => { setEditing(p); setFormOpen(true); }} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors" title="تعديل">
            <Pencil size={15} className="mx-auto" />
          </button>
          <button onClick={() => toggleActive.mutate(p)} className={`w-8 h-8 rounded-lg transition-colors ${p.isActive ? 'text-ink-soft hover:bg-warning-50 hover:text-warning' : 'text-success hover:bg-success-50'}`} title={p.isActive ? 'تعطيل' : 'تفعيل'}>
            <Power size={15} className="mx-auto" />
          </button>
          <button onClick={() => setDeleting(p)} className="w-8 h-8 rounded-lg text-ink-soft hover:bg-danger-50 hover:text-danger transition-colors" title="حذف">
            <Trash2 size={15} className="mx-auto" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <ButtonPlus onClick={() => { setEditing(null); setFormOpen(true); }} type={type ?? 'ACCESSORY'} />
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو SKU أو الباركود…" className="w-72" />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 w-40 text-xs">
          <option value="">كل التصنيفات</option>
          {(categories ?? []).map((c: CategoryDTO) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-10 w-36 text-xs">
          <option value="">كل الماركات</option>
          {(brands ?? []).map((b: BrandDTO) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <Switch checked={lowStock} onChange={setLowStock} />
          تحت الحد الأدنى فقط
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<Package size={26} />} title="لا توجد منتجات" description="أضف أول منتج لبدء إدارة المخزون والمبيعات" />}
        onRowClick={(p) => setDetailId(p.id)}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.total ?? 0} onChange={setPage} />

      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        product={editing}
        defaultType={editing?.type ?? type ?? 'ACCESSORY'}
        allowTypeSelect={!editing && type == null}
      />

      {/* تفاصيل المنتج */}
      <Modal
        open={detailId != null}
        onClose={() => setDetailId(null)}
        title={detail?.name ?? ''}
        subtitle={detail ? `${detail.category?.name ?? 'بدون تصنيف'} • ${detail.brand?.name ?? 'بدون ماركة'}` : undefined}
        size="md"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InfoTile label="سعر الشراء" value={money(detail.purchasePrice, currency)} ltr />
              <InfoTile label="سعر البيع" value={money(detail.sellingPrice, currency)} ltr />
              <InfoTile label="الكمية" value={num(detail.quantity)} />
              <InfoTile label="الحد الأدنى" value={num(detail.minStock)} />
              {detail.type === 'PHONE' && <InfoTile label="التخزين" value={detail.storageGb ? `${detail.storageGb} GB` : '—'} />}
              {detail.type === 'PHONE' && <InfoTile label="الذاكرة" value={detail.ramGb ? `${detail.ramGb} GB` : '—'} />}
              {detail.type === 'PHONE' && <InfoTile label="اللون" value={detail.color ?? '—'} />}
              {detail.warrantyMonths != null && <InfoTile label="الضمان" value={`${detail.warrantyMonths} شهر`} />}
            </div>

            {detail.type === 'PHONE' && (
              <div>
                <h4 className="text-sm font-bold text-ink mb-2.5 flex items-center gap-2">
                  <Smartphone size={15} className="text-primary" /> أجهزة الـ IMEI ({(detail as ProductDTO & { phoneUnits?: PhoneUnitDTO[] }).phoneUnits?.length ?? 0})
                </h4>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {((detail as ProductDTO & { phoneUnits?: PhoneUnitDTO[] }).phoneUnits ?? []).length === 0 ? (
                    <p className="text-xs text-ink-mute bg-surface-subtle rounded-xl p-4 text-center">لا توجد أجهزة مسجلة — تُضاف تلقائياً من فواتير الشراء</p>
                  ) : (
                    (detail as ProductDTO & { phoneUnits?: PhoneUnitDTO[] }).phoneUnits!.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                        <p className="text-sm font-bold font-mono" dir="ltr">{u.imei1}</p>
                        <div className="flex items-center gap-2">
                          {u.soldAt && <span className="text-[11px] text-ink-mute">{formatDate(u.soldAt)}</span>}
                          <Badge tone={u.status === 'IN_STOCK' ? 'green' : u.status === 'SOLD' ? 'gray' : u.status === 'DEFECTIVE' ? 'red' : 'amber'}>
                            {UNIT_STATUS_LABELS[u.status]}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {detail.notes && (
              <div className="rounded-xl bg-surface-subtle p-3.5">
                <p className="text-[11px] text-ink-mute mb-1">ملاحظات</p>
                <p className="text-sm text-ink leading-relaxed">{detail.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        title="حذف المنتج"
        message={`هل أنت متأكد من حذف «${deleting?.name}»؟ لا يمكن الحذف إذا كان مرتبطاً بحركات بيع أو شراء (يمكنك تعطيله بدلاً من ذلك).`}
        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
      />

      <AddPhoneUnitsModal product={addingUnits} onClose={() => setAddingUnits(null)} />
      <RemovePhoneUnitsModal product={removingUnits} onClose={() => setRemovingUnits(null)} />
      <AdjustAccessoryModal product={adjusting?.product ?? null} defaultMode={adjusting?.defaultMode ?? 'add'} onClose={() => setAdjusting(null)} />
    </div>
  );
}

function ButtonPlus({ onClick, type }: { onClick: () => void; type: 'PHONE' | 'ACCESSORY' }) {
  return (
    <button
      onClick={onClick}
      className="btn-transition h-11 px-5 rounded-xl text-sm font-semibold flex items-center gap-2 bg-primary text-white hover:bg-primary-700 shadow-sm shadow-primary/25"
    >
      <Plus size={17} />
      {type === 'PHONE' ? 'هاتف جديد' : 'منتج جديد'}
    </button>
  );
}

function InfoTile({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-subtle p-3">
      <p className="text-[11px] text-ink-mute mb-0.5">{label}</p>
      <p className="text-sm font-bold text-ink" dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'right' } : undefined}>{value}</p>
    </div>
  );
}
