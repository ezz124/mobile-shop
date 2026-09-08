import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Trash2, Undo2 } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { PAYMENT_METHODS, formatDate, formatDateTime, money, num, paymentMethodLabel } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Badge, Button, FormField, Spinner } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/inputs';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import ReturnCreateModal from './ReturnCreateModal';
import type { PaymentDTO, PurchaseDTO } from '@/shared/ipc';

/** فاتورة الشراء مع الدفعات إن أعادها الخادم */
type PurchaseDetail = PurchaseDTO & { payments?: PaymentDTO[] };

export interface PurchaseStatusMeta { label: string; tone: 'green' | 'amber' | 'gray' }

export function purchaseStatusMeta(status: string): PurchaseStatusMeta {
  if (status === 'RETURNED') return { label: 'مرتجعة', tone: 'gray' };
  if (status === 'PARTIALLY_RETURNED') return { label: 'مرتجع جزئياً', tone: 'amber' };
  return { label: 'مكتملة', tone: 'green' };
}

function TotalRow({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-soft">{label}</span>
      <span dir="ltr" className={`font-bold ${className}`}>{value}</span>
    </div>
  );
}

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-subtle p-3.5">
      <p className="text-[11px] text-ink-mute mb-1">{label}</p>
      <p className="text-sm font-bold text-ink truncate">{children}</p>
    </div>
  );
}

export default function PurchaseDetailModal({ purchaseId, onClose }: { purchaseId: number | null; onClose: () => void }) {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: purchase, isLoading } = useQuery({
    queryKey: ['purchase-detail', purchaseId],
    queryFn: (): Promise<PurchaseDetail> => invoke('purchases:get', { id: purchaseId! }),
    enabled: purchaseId != null,
  });

  const remaining = purchase ? purchase.total - purchase.returnedAmount - purchase.paidAmount : 0;
  const hasReturnable = (purchase?.items ?? []).some((it) => it.quantity - it.returnedQuantity > 0);
  const status = purchaseStatusMeta(purchase?.status ?? '');

  const deleteMutation = useMutation({
    mutationFn: () => invoke('purchases:delete', { id: purchaseId! }),
    onSuccess: () => {
      success('تم حذف فاتورة الشراء بنجاح');
      setDeleteOpen(false);
      onClose();
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حذف فاتورة الشراء'),
  });

  const footer = purchase ? (
    <>
      <Button variant="ghost" className="text-danger hover:bg-danger-50" icon={<Trash2 size={16} />} onClick={() => setDeleteOpen(true)}>
        حذف
      </Button>
      {hasReturnable && (
        <Button variant="outline" icon={<Undo2 size={16} />} onClick={() => setReturnOpen(true)}>
          مرتجع مشتريات
        </Button>
      )}
      {remaining > 0 && (
        <Button variant="success" icon={<HandCoins size={16} />} onClick={() => setPayOpen(true)}>
          دفعة للمورد
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <>
      <Modal
        open={purchaseId != null}
        onClose={onClose}
        size="lg"
        title="تفاصل فاتورة الشراء"
        subtitle={purchase?.invoiceNumber}
        footer={footer}
      >
        {isLoading || !purchase ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xl font-extrabold text-ink" dir="ltr">{purchase.invoiceNumber}</p>
                <p className="text-xs text-ink-soft mt-1">{formatDateTime(purchase.createdAt)}</p>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InfoCell label="المورد">{purchase.supplier?.name ?? '—'}</InfoCell>
              <InfoCell label="المستخدم">{purchase.user?.fullName ?? '—'}</InfoCell>
              <InfoCell label="عدد البنود">{num(purchase.items?.length ?? 0)}</InfoCell>
              <InfoCell label="التاريخ">{formatDate(purchase.createdAt)}</InfoCell>
            </div>

            {purchase.note && (
              <p className="text-xs text-ink-soft bg-surface-subtle rounded-xl p-3 leading-relaxed">ملاحظة: {purchase.note}</p>
            )}

            {/* البنود */}
            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-subtle border-b border-line">
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-start">المنتج</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-center">الكمية</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-end">تكلفة الوحدة</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-end">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(purchase.items ?? []).map((it) => (
                    <tr key={it.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 text-sm align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{it.productName}</span>
                          {it.returnedQuantity > 0 && <Badge tone="amber">مرتجع: {it.returnedQuantity}</Badge>}
                        </div>
                        {(it.phoneUnits ?? []).map((u) => (
                          <p key={u.id} className="text-[10px] text-ink-mute font-mono mt-0.5" dir="ltr">IMEI: {u.imei1}</p>
                        ))}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-center" dir="ltr">{it.quantity}</td>
                      <td className="px-4 py-2.5 text-sm text-end" dir="ltr">{money(it.unitCost, currency)}</td>
                      <td className="px-4 py-2.5 text-sm text-end font-bold" dir="ltr">{money(it.lineTotal, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* الإجماليات */}
            <div className="rounded-xl bg-surface-subtle border border-line p-4 space-y-1.5">
              <TotalRow label="المجموع الفرعي" value={money(purchase.subtotal, currency)} />
              {purchase.discount > 0 && <TotalRow label="الخصم" value={`-${money(purchase.discount, currency)}`} className="text-warning" />}
              {purchase.taxAmount > 0 && <TotalRow label={`الضريبة (${purchase.taxRate}%)`} value={money(purchase.taxAmount, currency)} />}
              <div className="flex items-center justify-between pt-1.5 border-t border-line">
                <span className="text-sm font-bold text-ink">الإجمالي</span>
                <span className="text-lg font-extrabold text-primary" dir="ltr">{money(purchase.total, currency)}</span>
              </div>
              <TotalRow label="المدفوع" value={money(purchase.paidAmount, currency)} className="text-success" />
              <TotalRow
                label="المتبقي"
                value={money(remaining, currency)}
                className={remaining > 0 ? 'text-danger' : 'text-ink-mute'}
              />
              {purchase.returnedAmount > 0 && (
                <TotalRow label="المرتجع" value={money(purchase.returnedAmount, currency)} className="text-warning" />
              )}
            </div>

            {/* الدفعات */}
            {(purchase.payments ?? []).length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-ink mb-2.5">الدفعات</h4>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {(purchase.payments ?? []).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                      <p className="text-sm font-bold text-danger" dir="ltr">-{money(p.amount, currency)}</p>
                      <p className="text-[11px] text-ink-mute">
                        {formatDate(p.createdAt)} — {paymentMethodLabel(p.method)}{p.note ? ` — ${p.note}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        purchaseId={purchaseId ?? 0}
        maxAmount={Math.max(0, remaining)}
      />

      <ReturnCreateModal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        type="PURCHASE_RETURN"
        purchaseId={purchaseId ?? undefined}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="حذف فاتورة الشراء"
        message={`هل أنت متأكد من حذف الفاتورة «${purchase?.invoiceNumber ?? ''}»؟ قد يرفض النظام الحذف إذا تم بيع أحد الأجهزة.`}
        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
      />
    </>
  );
}

// ─────────────────────────── دفعة للمورد ───────────────────────────

function PaymentModal({ open, onClose, purchaseId, maxAmount }: { open: boolean; onClose: () => void; purchaseId: number; maxAmount: number }) {
  const { currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(maxAmount > 0 ? String(maxAmount) : '');
      setMethod('CASH');
      setNote('');
    }
  }, [open, maxAmount]);

  const payMutation = useMutation({
    mutationFn: () =>
      invoke('purchases:addPayment', {
        purchaseId,
        amount: Math.max(0, parseInt(amount, 10) || 0),
        method,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      success('تم تسجيل الدفعة للمورد بنجاح');
      onClose();
      queryClient.invalidateQueries({ queryKey: ['purchase-detail', purchaseId] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر تسجيل الدفعة'),
  });

  const amountNum = Math.max(0, parseInt(amount, 10) || 0);
  const valid = amountNum > 0 && amountNum <= maxAmount;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="دفعة للمورد"
      subtitle={`المبلغ المتبقي: ${money(maxAmount, currency)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="success" loading={payMutation.isPending} disabled={!valid} onClick={() => payMutation.mutate()}>
            تسجيل الدفعة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="المبلغ" required hint={amountNum > maxAmount ? 'المبلغ يتجاوز المتبقي على الفاتورة' : undefined}>
          <input
            dir="ltr"
            inputMode="numeric"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            placeholder={String(maxAmount)}
            className="input-base h-11 text-left text-lg font-extrabold text-success"
          />
        </FormField>
        <FormField label="طريقة الدفع">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="ملاحظة">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة اختيارية…" />
        </FormField>
      </div>
    </Modal>
  );
}
