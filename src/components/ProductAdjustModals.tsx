import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/ipc';
import { useToast } from '@/store/toast';
import { Button, FormField, EmptyState } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/Modal';
import type { ProductDTO, PhoneUnitDTO } from '@/shared/ipc';
import { Trash2 } from 'lucide-react';

export function AddPhoneUnitsModal({ product, onClose }: { product: ProductDTO | null; onClose: () => void }) {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [quantityStr, setQuantityStr] = useState('');
  const [imeis, setImeis] = useState<string[]>([]);

  const addMutation = useMutation({
    mutationFn: () => invoke('phoneUnits:add', {
      productId: product!.id,
      quantity: parseInt(quantityStr) || 1,
      imeis: imeis.filter(Boolean),
    }),
    onSuccess: () => {
      success('تم إضافة الأجهزة بنجاح');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
      setQuantityStr('');
      setImeis([]);
    },
    onError: (e) => error(e instanceof Error ? e.message : 'تعذر الإضافة'),
  });

  if (!product) return null;

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="إضافة أجهزة (رصيد افتتاحي)"
      subtitle={`للمنتج: ${product.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button loading={addMutation.isPending} onClick={() => void addMutation.mutate()}>حفظ الأجهزة</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="الكمية المراد إضافتها">
          <Input
            type="number" min={1} max={100}
            value={quantityStr}
            placeholder="مثلاً: 5"
            onChange={(e) => {
              setQuantityStr(e.target.value);
              const q = parseInt(e.target.value) || 0;
              if (q > 0 && q <= 100) {
                setImeis(prev => Array(q).fill('').map((_, i) => prev[i] || ''));
              }
            }}
          />
        </FormField>
        
        <div className="bg-surface-muted p-3 rounded-lg text-sm text-ink-soft">
          يمكنك إدخال أرقام الـ IMEI للأجهزة الجديدة. إذا تركت الحقل فارغاً، سيقوم النظام بإنشاء أرقام وهمية تلقائياً لتسجيلها في المخزون.
        </div>

        {parseInt(quantityStr) > 0 && parseInt(quantityStr) <= 100 && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {Array(parseInt(quantityStr)).fill(0).map((_, i) => (
              <Input
                key={i}
                placeholder={`رقم IMEI للجهاز ${i + 1} (اختياري)`}
                value={imeis[i] || ''}
                onChange={(e) => {
                  const newImeis = [...imeis];
                  newImeis[i] = e.target.value;
                  setImeis(newImeis);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function RemovePhoneUnitsModal({ product, onClose }: { product: ProductDTO | null; onClose: () => void }) {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['product-units', product?.id],
    queryFn: () => invoke('phoneUnits:list', { productId: product!.id, status: 'IN_STOCK', pageSize: 100 }),
    enabled: !!product,
  });

  const removeMutation = useMutation({
    mutationFn: () => invoke('phoneUnits:remove', { unitIds: selectedIds }),
    onSuccess: () => {
      success('تم إزالة الأجهزة وتحديث المخزون بنجاح');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
      setSelectedIds([]);
    },
    onError: (e) => error(e instanceof Error ? e.message : 'تعذر الإزالة'),
  });

  if (!product) return null;
  const units = data?.data ?? [];

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="إزالة أجهزة (تقليل كمية)"
      subtitle={`حدد الأجهزة المراد إزالتها من «${product.name}»`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="danger" disabled={selectedIds.length === 0} loading={removeMutation.isPending} onClick={() => void removeMutation.mutate()}>
            إزالة ({selectedIds.length}) أجهزة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-4 text-center text-ink-mute">جاري التحميل...</div>
        ) : units.length === 0 ? (
          <EmptyState icon={<span className="text-3xl">📵</span>} title="لا توجد أجهزة متوفرة" description="لا يوجد أي جهاز في المخزون لهذا الهاتف" />
        ) : (
          <div className="max-h-80 overflow-y-auto border border-border-mute rounded-lg divide-y divide-border-mute">
            {units.map((u) => (
              <label key={u.id} className="flex items-center p-3 gap-3 hover:bg-surface-muted cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-primary focus:ring-primary"
                  checked={selectedIds.includes(u.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds([...selectedIds, u.id]);
                    else setSelectedIds(selectedIds.filter(id => id !== u.id));
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium font-mono text-sm">{u.imei1}</div>
                  {u.imei1.startsWith('AUTO-') && <div className="text-xs text-ink-mute">رقم تلقائي (بدون IMEI)</div>}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function AdjustAccessoryModal({ product, defaultMode, onClose }: { product: ProductDTO | null; defaultMode: 'add' | 'remove'; onClose: () => void }) {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [type, setType] = useState<'ADJUSTMENT' | 'DAMAGE'>('ADJUSTMENT');
  const [reason, setReason] = useState('');

  const submit = useMutation({
    mutationFn: () => invoke('inventory:adjust', {
      productId: product!.id,
      change: defaultMode === 'add' ? Number(value) : -Number(value),
      type,
      reason: reason || undefined,
    }),
    onSuccess: () => {
      success('تم تسوية الكمية بنجاح');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
      setValue(''); setReason('');
    },
    onError: (e) => error(e instanceof Error ? e.message : 'تعذر التعديل'),
  });

  if (!product) return null;

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={defaultMode === 'add' ? 'إضافة كمية (ملحق)' : 'تقليل كمية (ملحق)'}
      subtitle={product.name}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button loading={submit.isPending} disabled={value === ''} onClick={() => void submit.mutate()}>تنفيذ</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="الكمية المراد تعديلها" required>
          <Input type="number" min={1} dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} placeholder="مثلاً: 5" />
        </FormField>
        
        <FormField label="نوع التسوية" required>
          <Select value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="ADJUSTMENT">تسوية (تعديل رصيد)</option>
            {defaultMode === 'remove' && <option value="DAMAGE">إهلاك (تالف)</option>}
          </Select>
        </FormField>
        
        <FormField label="السبب / ملاحظات">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب التسوية (اختياري)" />
        </FormField>
      </div>
    </Modal>
  );
}
