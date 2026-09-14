import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Trash2, Smartphone, Headphones } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useToast } from '@/store/toast';
import { Button as Btn, Badge as Bdg, FormField } from '@/components/ui/primitives';
import { Modal as Mdl } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/inputs';
import type { ProductDTO, CategoryDTO, BrandDTO, InitialPhoneUnitInput } from '@/shared/ipc';

export interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  product: ProductDTO | null;
  defaultType: 'PHONE' | 'ACCESSORY';
  /** إذا كان true يظهر toggle لاختيار النوع عند الإضافة */
  allowTypeSelect?: boolean;
  onSaved?: () => void;
}

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  brandId: string;
  storageGb: string;
  ramGb: string;
  color: string;
  warrantyMonths: string;
  purchasePrice: string;
  sellingPrice: string;
  minStock: string;
  quantity: string;
  notes: string;
}

const EMPTY: FormState = {
  name: '', sku: '', barcode: '', categoryId: '', brandId: '',
  storageGb: '', ramGb: '', color: '', warrantyMonths: '',
  purchasePrice: '', sellingPrice: '', minStock: '3', quantity: '', notes: '',
};

export default function ProductFormModal({ open, onClose, product, defaultType, allowTypeSelect, onSaved }: ProductFormModalProps) {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<'PHONE' | 'ACCESSORY'>(defaultType);
  const [phoneUnits, setPhoneUnits] = useState<InitialPhoneUnitInput[]>([]);

  const isEdit = product != null;
  const isPhone = isEdit ? product.type === 'PHONE' : selectedType === 'PHONE';

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => invoke('categories:list', {}) });
  const { data: brands } = useQuery({ queryKey: ['brands'], queryFn: () => invoke('brands:list', {}) });

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku ?? '',
        barcode: product.barcode ?? '',
        categoryId: product.categoryId ? String(product.categoryId) : '',
        brandId: product.brandId ? String(product.brandId) : '',
        storageGb: product.storageGb ? String(product.storageGb) : '',
        ramGb: product.ramGb ? String(product.ramGb) : '',
        color: product.color ?? '',
        warrantyMonths: product.warrantyMonths ? String(product.warrantyMonths) : '',
        purchasePrice: String(product.purchasePrice),
        sellingPrice: String(product.sellingPrice),
        minStock: String(product.minStock),
        quantity: '',
        notes: product.notes ?? '',
      });
      setPhoneUnits([]);
    } else {
      setForm(EMPTY);
      setSelectedType(defaultType);
      setPhoneUnits([]);
    }
  }, [open, product, defaultType]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const base = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        brandId: form.brandId ? Number(form.brandId) : undefined,
        purchasePrice: Number(form.purchasePrice || 0),
        sellingPrice: Number(form.sellingPrice || 0),
        minStock: Number(form.minStock || 0),
        notes: form.notes.trim() || undefined,
      };
      if (isEdit) {
        return invoke('products:update', {
          id: product.id,
          ...base,
          storageGb: isPhone && form.storageGb ? Number(form.storageGb) : undefined,
          ramGb: isPhone && form.ramGb ? Number(form.ramGb) : undefined,
          color: isPhone && form.color ? form.color : undefined,
          warrantyMonths: isPhone && form.warrantyMonths ? Number(form.warrantyMonths) : undefined,
        });
      }
      return invoke('products:create', {
        ...base,
        type: isPhone ? 'PHONE' : 'ACCESSORY',
        quantity: form.quantity ? Number(form.quantity) : undefined,
        initialPhoneUnits: isPhone ? phoneUnits.map((unit, idx) => ({
          imei1: unit.imei1.trim() || `MB-${Date.now().toString().slice(-4)}${idx}${Math.floor(Math.random() * 1000)}`,
          imei2: unit.imei2?.trim() || undefined,
          serialNumber: unit.serialNumber?.trim() || undefined,
        })) : undefined,
        storageGb: isPhone && form.storageGb ? Number(form.storageGb) : undefined,
        ramGb: isPhone && form.ramGb ? Number(form.ramGb) : undefined,
        color: isPhone && form.color ? form.color.trim() : undefined,
        warrantyMonths: isPhone && form.warrantyMonths ? Number(form.warrantyMonths) : undefined,
      });
    },
    onSuccess: () => {
      success(isEdit ? 'تم تحديث المنتج بنجاح' : 'تمت إضافة المنتج بنجاح');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      onSaved?.();
      onClose();
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حفظ المنتج'),
  });

  const phoneQuantity = Math.max(0, Number(form.quantity || 0));
  const validPhoneUnits = phoneUnits.length === phoneQuantity && phoneQuantity > 0
    && new Set(phoneUnits.map((unit) => unit.imei1.trim()).filter(Boolean)).size === phoneUnits.filter((u) => u.imei1.trim()).length;
  const valid = form.name.trim().length > 0 && form.purchasePrice !== '' && form.sellingPrice !== '' && (isEdit || !isPhone || validPhoneUnits);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  function setPhoneQuantity(raw: string) {
    const quantity = Math.min(100, Math.max(0, Number(raw.replace(/\D/g, '') || 0)));
    set({ quantity: quantity ? String(quantity) : '' });
    setPhoneUnits((current) => Array.from({ length: quantity }, (_, index) => current[index] ?? { imei1: '' }));
  }

  function updatePhoneUnit(index: number, patch: Partial<InitialPhoneUnitInput>) {
    setPhoneUnits((current) => current.map((unit, unitIndex) => unitIndex === index ? { ...unit, ...patch } : unit));
  }

  return (
    <>
      <Mdl
        open={open}
        onClose={onClose}
        title={isEdit ? `تعديل: ${product?.name}` : isPhone ? 'إضافة هاتف جديد' : 'إضافة منتج جديد'}
        subtitle={isPhone && !isEdit ? 'حدد الكمية ثم أدخل IMEI مستقلًا لكل جهاز' : undefined}
        footer={
          <>
            <Btn variant="ghost" onClick={onClose}>إلغاء</Btn>
            <Btn loading={saveMutation.isPending} disabled={!valid} onClick={() => saveMutation.mutate()}>
              {isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* نوع المنتج — يظهر فقط عند الإضافة من صفحة المنتجات */}
          {!isEdit && allowTypeSelect && (
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-ink-soft mb-2">نوع المنتج</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedType('PHONE')}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    selectedType === 'PHONE'
                      ? 'border-primary bg-primary-50 text-primary'
                      : 'border-line bg-surface text-ink-soft hover:border-primary/40'
                  }`}
                >
                  <Smartphone size={20} />
                  <div className="text-right">
                    <p className="text-sm font-bold">هاتف</p>
                    <p className="text-[11px] opacity-70">يُدار بأرقام IMEI</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType('ACCESSORY')}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    selectedType === 'ACCESSORY'
                      ? 'border-primary bg-primary-50 text-primary'
                      : 'border-line bg-surface text-ink-soft hover:border-primary/40'
                  }`}
                >
                  <Headphones size={20} />
                  <div className="text-right">
                    <p className="text-sm font-bold">ملحق</p>
                    <p className="text-[11px] opacity-70">شواحن وسماعات وغيرها</p>
                  </div>
                </button>
              </div>
            </div>
          )}
          <FormField label="اسم المنتج" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={isPhone ? 'مثال: Samsung Galaxy A55 — 128GB' : 'مثال: شاحن Samsung 25W أصلي'} autoFocus />
          </FormField>

          {!isPhone && (
            <FormField label="التصنيف">
              <div className="flex items-center gap-2">
                <Select value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                  <option value="">بدون تصنيف</option>
                  {(categories ?? []).map((c: CategoryDTO) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <Btn size="sm" variant="outline" onClick={() => setManageOpen(true)} icon={<Package size={14} />} className="shrink-0">إدارة</Btn>
              </div>
            </FormField>
          )}

          <FormField label="الماركة">
            <Select value={form.brandId} onChange={(e) => set({ brandId: e.target.value })}>
              <option value="">بدون ماركة</option>
              {(brands ?? []).map((b: BrandDTO) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="سعر الشراء" required hint="سعر الوحدة الواحدة">
            <Input dir="ltr" className="text-left font-semibold" inputMode="numeric" value={form.purchasePrice} onChange={(e) => set({ purchasePrice: e.target.value.replace(/\D/g, '') })} placeholder="0" />
          </FormField>
          <FormField label="سعر البيع" required hint="سعر الوحدة الواحدة">
            <Input dir="ltr" className="text-left font-semibold" inputMode="numeric" value={form.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value.replace(/\D/g, '') })} placeholder="0" />
          </FormField>

          {isPhone ? (
            <>
              {!isEdit && (
                <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-primary-50/40 p-4 space-y-3">
                  <FormField label="كمية الهواتف" required hint="سيظهر حقل IMEI لكل جهاز">
                    <Input dir="ltr" className="text-left font-bold" inputMode="numeric" value={form.quantity} onChange={(e) => setPhoneQuantity(e.target.value)} placeholder="مثال: 3" />
                  </FormField>
                  {phoneQuantity > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                      <p className="text-xs font-bold text-ink">أرقام IMEI المطلوبة ({phoneUnits.length}/{phoneQuantity})</p>
                      {phoneUnits.map((unit, index) => {
                        const duplicate = unit.imei1.trim() && phoneUnits.some((other, otherIndex) => otherIndex !== index && other.imei1.trim() === unit.imei1.trim());
                        return (
                          <div key={index} className="grid grid-cols-[auto_1fr] gap-2 items-center">
                            <span className="w-7 text-center text-xs font-bold text-primary" dir="ltr">{index + 1}</span>
                            <Input dir="ltr" className={`text-left font-mono ${duplicate ? 'border-danger' : ''}`} value={unit.imei1} onChange={(e) => updatePhoneUnit(index, { imei1: e.target.value })} placeholder="أدخل IMEI (اختياري)" />
                            {duplicate && <p className="col-start-2 text-[11px] text-danger">رقم IMEI مكرر</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <FormField label="مساحة التخزين (GB)">
                <Input dir="ltr" className="text-left" inputMode="numeric" value={form.storageGb} onChange={(e) => set({ storageGb: e.target.value.replace(/\D/g, '') })} placeholder="128" />
              </FormField>
              <FormField label="الذاكرة (GB)">
                <Input dir="ltr" className="text-left" inputMode="numeric" value={form.ramGb} onChange={(e) => set({ ramGb: e.target.value.replace(/\D/g, '') })} placeholder="8" />
              </FormField>
              <FormField label="اللون">
                <Input value={form.color} onChange={(e) => set({ color: e.target.value })} placeholder="أسود" />
              </FormField>
              <FormField label="مدة الضمان (شهر)">
                <Input dir="ltr" className="text-left" inputMode="numeric" value={form.warrantyMonths} onChange={(e) => set({ warrantyMonths: e.target.value.replace(/\D/g, '') })} placeholder="12" />
              </FormField>
            </>
          ) : (
            !isEdit && (
              <FormField label="الكمية الابتدائية" hint="يمكن تعديلها لاحقاً من المخزون">
                <Input dir="ltr" className="text-left font-semibold" inputMode="numeric" value={form.quantity} onChange={(e) => set({ quantity: e.target.value.replace(/\D/g, '') })} placeholder="0" />
              </FormField>
            )
          )}

          <FormField label="الحد الأدنى للمخزون" hint="تنبيه عند الوصول لهذه الكمية">
            <Input dir="ltr" className="text-left" inputMode="numeric" value={form.minStock} onChange={(e) => set({ minStock: e.target.value.replace(/\D/g, '') })} />
          </FormField>

          <FormField label="الباركود">
            <Input dir="ltr" className="text-left" value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} placeholder="امسح الباركود هنا" />
          </FormField>
          <FormField label="رمز المنتج SKU">
            <Input dir="ltr" className="text-left" value={form.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="CHG-S25" />
          </FormField>

          <FormField label="ملاحظات" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="ملاحظات إضافية…" />
          </FormField>
        </div>
      </Mdl>

      <ManageCategoriesModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </>
  );
}

// ─────────────────────────── إدارة التصنيفات والماركات ───────────────────────────

export function ManageCategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [newCat, setNewCat] = useState('');
  const [newBrand, setNewBrand] = useState('');

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => invoke('categories:list', {}) });
  const { data: brands } = useQuery({ queryKey: ['brands'], queryFn: () => invoke('brands:list', {}) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['brands'] });
  };

  const addCat = useMutation({
    mutationFn: () => invoke('categories:create', { name: newCat.trim() }),
    onSuccess: () => { success('تمت إضافة التصنيف'); setNewCat(''); invalidate(); },
    onError: (e) => toastError(e instanceof Error ? e.message : 'خطأ'),
  });
  const addBrand = useMutation({
    mutationFn: () => invoke('brands:create', { name: newBrand.trim() }),
    onSuccess: () => { success('تمت إضافة الماركة'); setNewBrand(''); invalidate(); },
    onError: (e) => toastError(e instanceof Error ? e.message : 'خطأ'),
  });
  const delCat = useMutation({
    mutationFn: (id: number) => invoke('categories:delete', { id }),
    onSuccess: () => { success('تم الحذف'); invalidate(); },
    onError: (e) => toastError(e instanceof Error ? e.message : 'لا يمكن حذف تصنيف مرتبط بمنتجات'),
  });
  const delBrand = useMutation({
    mutationFn: (id: number) => invoke('brands:delete', { id }),
    onSuccess: () => { success('تم الحذف'); invalidate(); },
    onError: (e) => toastError(e instanceof Error ? e.message : 'لا يمكن حذف ماركة مرتبطة بمنتجات'),
  });

  const ListSection = ({ title, items, onAdd, addLoading, newValue, setNewValue, onDelete }: {
    title: string; items: { id: number; name: string; productCount?: number }[];
    onAdd: () => void; addLoading: boolean; newValue: string; setNewValue: (v: string) => void;
    onDelete: (id: number) => void;
  }) => (
    <div className="space-y-2.5">
      <h4 className="text-sm font-bold text-ink">{title}</h4>
      <div className="flex items-center gap-2">
        <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="أضف جديد…" className="h-10 text-sm" />
        <Btn size="sm" onClick={onAdd} loading={addLoading} disabled={!newValue.trim()} icon={<Plus size={14} />} className="shrink-0">إضافة</Btn>
      </div>
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {items.length === 0 && <p className="text-xs text-ink-mute text-center py-4">لا يوجد</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
            <span className="text-sm font-medium text-ink">{item.name}</span>
            <div className="flex items-center gap-2">
              {item.productCount != null && <Bdg tone="gray">{item.productCount} منتج</Bdg>}
              <button onClick={() => onDelete(item.id)} className="text-ink-mute hover:text-danger transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Mdl open={open} onClose={onClose} title="إدارة التصنيفات والماركات" size="md">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ListSection
          title="التصنيفات" items={categories ?? []}
          onAdd={() => addCat.mutate()} addLoading={addCat.isPending}
          newValue={newCat} setNewValue={setNewCat}
          onDelete={(id) => delCat.mutate(id)}
        />
        <ListSection
          title="الماركات" items={brands ?? []}
          onAdd={() => addBrand.mutate()} addLoading={addBrand.isPending}
          newValue={newBrand} setNewValue={setNewBrand}
          onDelete={(id) => delBrand.mutate(id)}
        />
      </div>
    </Mdl>
  );
}
