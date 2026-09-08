import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Smartphone, Undo2 } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money } from '@/lib/format';
import { allocateInvoiceAmount, returnedPartAmount } from '@/shared/invoice';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Badge, Button, FormField, Spinner, Switch } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/Modal';
import type { CreateReturnInput, PhoneUnitDTO, PurchaseDTO, SaleDTO } from '@/shared/ipc';

export interface ReturnCreateModalProps {
  open: boolean;
  onClose: () => void;
  type: 'SALE_RETURN' | 'PURCHASE_RETURN';
  saleId?: number;
  purchaseId?: number;
}

interface ReturnableItem {
  itemId: number;
  productName: string;
  quantity: number;
  returnable: number;
  lineTotal: number;
  netLineTotal: number;
  isPhone: boolean;
  units: PhoneUnitDTO[];
}

interface ItemState {
  qty: number;
  unitIds: number[];
}

const EMPTY_STATE: ItemState = { qty: 0, unitIds: [] };

export default function ReturnCreateModal({ open, onClose, type, saleId, purchaseId }: ReturnCreateModalProps) {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const isSale = type === 'SALE_RETURN';
  const sourceId = isSale ? saleId : purchaseId;

  const saleQuery = useQuery({
    queryKey: ['sale-detail', saleId],
    queryFn: (): Promise<SaleDTO> => invoke('sales:get', { id: saleId! }),
    enabled: open && isSale && saleId != null,
  });
  const purchaseQuery = useQuery({
    queryKey: ['purchase-detail', purchaseId],
    queryFn: (): Promise<PurchaseDTO> => invoke('purchases:get', { id: purchaseId! }),
    enabled: open && !isSale && purchaseId != null,
  });

  const returnableItems = useMemo<ReturnableItem[]>(() => {
    if (isSale) {
      const sale = saleQuery.data;
      if (!sale) return [];
      const discounts = allocateInvoiceAmount(sale.items ?? [], sale.discount);
      const taxes = allocateInvoiceAmount(sale.items ?? [], sale.taxAmount);
      return (sale.items ?? [])
        .map((it) => {
          const all = it.phoneUnits ?? [];
          return {
            itemId: it.id,
            productName: it.productName,
            quantity: it.quantity,
            returnable: it.quantity - it.returnedQuantity,
            lineTotal: it.lineTotal,
            netLineTotal: it.lineTotal - (discounts.get(it.id) ?? 0) + (taxes.get(it.id) ?? 0),
            isPhone: all.length > 0,
            units: all.filter((u) => u.status !== 'RETURNED'),
          };
        })
        .filter((it) => it.returnable > 0);
    }
    const purchase = purchaseQuery.data;
    if (!purchase) return [];
    const discounts = allocateInvoiceAmount(purchase.items ?? [], purchase.discount);
    const taxes = allocateInvoiceAmount(purchase.items ?? [], purchase.taxAmount);
    return (purchase.items ?? [])
      .map((it) => {
        const all = it.phoneUnits ?? [];
        return {
          itemId: it.id,
          productName: it.productName,
          quantity: it.quantity,
          returnable: it.quantity - it.returnedQuantity,
          lineTotal: it.lineTotal,
          netLineTotal: it.lineTotal - (discounts.get(it.id) ?? 0) + (taxes.get(it.id) ?? 0),
          isPhone: all.length > 0,
          units: all.filter((u) => u.status === 'IN_STOCK'),
        };
      })
      .filter((it) => it.returnable > 0);
  }, [isSale, saleQuery.data, purchaseQuery.data]);

  const [states, setStates] = useState<Record<number, ItemState>>({});
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CREDIT'>('CASH');
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState('');

  // إعادة التهيئة عند فتح النافذة أو تغيّر الفاتورة المصدر
  useEffect(() => {
    if (!open) return;
    const init: Record<number, ItemState> = {};
    for (const it of returnableItems) init[it.itemId] = { qty: 0, unitIds: [] };
    setStates(init);
    setRefundMethod('CASH');
    setRestock(true);
    setReason('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceId]);

  const totalRefund = returnableItems.reduce((sum, it) => {
    const st = states[it.itemId];
    if (!st || st.qty <= 0) return sum;
    return sum + returnedPartAmount(it.netLineTotal, it.quantity, it.quantity - it.returnable, st.qty);
  }, 0);

  const chosenCount = returnableItems.filter((it) => (states[it.itemId] ?? EMPTY_STATE).qty > 0).length;

  const createMutation = useMutation({
    mutationFn: (input: CreateReturnInput) => invoke('returns:create', input),
    onSuccess: (r) => {
      success(`تم إنشاء المرتجع ${r.invoiceNumber} بنجاح`);
      onClose();
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['sale-detail'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-detail'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر إنشاء المرتجع'),
  });

  function setQty(itemId: number, maxQty: number, raw: string) {
    const q = Math.max(0, Math.min(maxQty, parseInt(raw, 10) || 0));
    setStates((prev) => {
      const st = prev[itemId] ?? EMPTY_STATE;
      return { ...prev, [itemId]: { qty: q, unitIds: st.unitIds.slice(0, q) } };
    });
  }

  function toggleUnit(itemId: number, unitId: number) {
    setStates((prev) => {
      const st = prev[itemId] ?? EMPTY_STATE;
      if (st.unitIds.includes(unitId)) {
        return { ...prev, [itemId]: { ...st, unitIds: st.unitIds.filter((x) => x !== unitId) } };
      }
      if (st.unitIds.length >= st.qty) return prev;
      return { ...prev, [itemId]: { ...st, unitIds: [...st.unitIds, unitId] } };
    });
  }

  function submit() {
    const chosen = returnableItems
      .map((it) => ({ it, st: states[it.itemId] ?? EMPTY_STATE }))
      .filter((x) => x.st.qty > 0);
    if (chosen.length === 0) {
      toastError('حدد الكمية المرتجعة لبند واحد على الأقل');
      return;
    }
    for (const { it, st } of chosen) {
      if (st.qty > it.returnable) {
        toastError(`الكمية المرتجعة من «${it.productName}» تتجاوز المسموح`);
        return;
      }
      if (it.isPhone && st.unitIds.length !== st.qty) {
        toastError(`اختر ${st.qty} جهاز (IMEI) للبند «${it.productName}»`);
        return;
      }
    }
    createMutation.mutate({
      type,
      saleId: isSale ? saleId : undefined,
      purchaseId: !isSale ? purchaseId : undefined,
      items: chosen.map(({ it, st }) => ({
        itemId: it.itemId,
        quantity: st.qty,
        phoneUnitIds: it.isPhone ? st.unitIds : undefined,
      })),
      refundMethod,
      restock,
      reason: reason.trim() || undefined,
    });
  }

  const invoiceNumber = isSale ? saleQuery.data?.invoiceNumber : purchaseQuery.data?.invoiceNumber;
  const partyName = isSale
    ? saleQuery.data?.customer?.name ?? 'زبون نقدي'
    : purchaseQuery.data?.supplier?.name ?? '—';
  const loading = isSale ? saleQuery.isLoading : purchaseQuery.isLoading;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isSale ? 'إنشاء مرتجع مبيعات' : 'إنشاء مرتجع مشتريات'}
      subtitle={invoiceNumber ? `الفاتورة الأصلية: ${invoiceNumber} — ${partyName}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            loading={createMutation.isPending}
            disabled={chosenCount === 0}
            icon={<Undo2 size={16} />}
            onClick={submit}
          >
            إنشاء المرتجع ({money(totalRefund, currency)})
          </Button>
        </>
      }
    >
      {loading || (!isSale && !purchaseQuery.data) || (isSale && !saleQuery.data) ? (
        <div className="flex items-center justify-center py-14">
          <Spinner size={26} />
        </div>
      ) : returnableItems.length === 0 ? (
        <p className="text-sm text-ink-soft text-center py-10 bg-surface-subtle rounded-xl">
          لا توجد بنود قابلة للإرجاع في هذه الفاتورة
        </p>
      ) : (
        <div className="space-y-4">
          {returnableItems.map((it) => {
            const st = states[it.itemId] ?? EMPTY_STATE;
            const maxQty = it.isPhone ? Math.min(it.returnable, it.units.length) : it.returnable;
            const unitRefund = it.quantity > 0 ? Math.floor(it.netLineTotal / it.quantity) : 0;
            return (
              <div key={it.itemId} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.isPhone && <Smartphone size={15} className="text-primary" />}
                    <p className="text-sm font-bold text-ink">{it.productName}</p>
                    <Badge tone="gray">مبيع: {it.quantity}</Badge>
                    <Badge tone="blue">قابل للإرجاع: {it.returnable}</Badge>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <label className="text-xs font-semibold text-ink-soft">الكمية المرتجعة</label>
                    <input
                      dir="ltr"
                      inputMode="numeric"
                      value={st.qty || ''}
                      placeholder="0"
                      onChange={(e) => setQty(it.itemId, maxQty, e.target.value)}
                      className="input-base h-9 w-20 text-sm text-left font-bold"
                    />
                  </div>
                </div>

                {it.isPhone && (
                  <div>
                    <p className="text-[11px] font-semibold text-ink-mute mb-2">
                      اختر الأجهزة المطلوب إرجاعها ({st.unitIds.length}/{st.qty}) — يجب تطابق العدد مع الكمية
                    </p>
                    {it.units.length === 0 ? (
                      <p className="text-[11px] text-danger font-semibold">لا توجد أجهزة متاحة للإرجاع لهذا البند</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {it.units.map((u) => {
                          const selected = st.unitIds.includes(u.id);
                          const full = st.unitIds.length >= st.qty;
                          return (
                            <button
                              key={u.id}
                              type="button"
                              disabled={!selected && full}
                              onClick={() => toggleUnit(it.itemId, u.id)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 font-mono text-xs transition-colors ${
                                selected
                                  ? 'border-primary bg-primary-50 text-primary'
                                  : 'border-line bg-white text-ink-soft hover:border-line-strong'
                              } ${!selected && full ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              {selected && <Check size={12} />}
                              <span dir="ltr">{u.imei1}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {st.qty > 0 && (
                  <p className="text-end text-xs font-bold text-ink-soft mt-2.5">
                    قيمة الإرجاع: <span dir="ltr" className="text-primary">{money(returnedPartAmount(it.netLineTotal, it.quantity, it.quantity - it.returnable, st.qty), currency)}</span>
                  </p>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="طريقة رد المبلغ" required>
              <Select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value === 'CREDIT' ? 'CREDIT' : 'CASH')}
              >
                <option value="CASH">رد نقدي</option>
                <option value="CREDIT">خصم من الدين/الذمة</option>
              </Select>
            </FormField>
            <FormField label="إعادة للمخزون">
              <div className="h-10 flex items-center gap-3">
                <Switch checked={restock} onChange={setRestock} />
                <span className="text-xs text-ink-soft">{restock ? 'ستُعاد الكميات للمخزون' : 'لن تُعاد الكميات للمخزون'}</span>
              </div>
            </FormField>
            <FormField label="السبب" className="sm:col-span-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب الإرجاع (اختياري)…" />
            </FormField>
          </div>

          <div className="rounded-xl bg-surface-subtle border border-line p-4 flex items-center justify-between">
            <span className="text-sm font-bold text-ink">إجمالي المبلغ المردود</span>
            <span className="text-lg font-extrabold text-primary" dir="ltr">{money(totalRefund, currency)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
