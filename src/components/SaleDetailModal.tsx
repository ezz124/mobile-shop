import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Printer, Trash2, Undo2 } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { PAYMENT_METHODS, SALE_STATUS_LABELS, formatDate, formatDateTime, money, num, paymentMethodLabel } from '@/lib/format';
import { buildInvoiceHtml } from '@/lib/invoice';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Badge, Button, FormField, Spinner } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/inputs';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import ReturnCreateModal from './ReturnCreateModal';
import type { PaymentDTO, SaleDTO } from '@/shared/ipc';

/** فاتورة البيع مع الدفعات إن أعادها الخادم */
type SaleDetail = SaleDTO & { payments?: PaymentDTO[] };

const STATUS_TONES: Record<string, 'green' | 'amber' | 'gray'> = {
  COMPLETED: 'green',
  PARTIALLY_RETURNED: 'amber',
  RETURNED: 'gray',
};

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

export default function SaleDetailModal({ saleId, onClose }: { saleId: number | null; onClose: () => void }) {
  const { settings, currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale-detail', saleId],
    queryFn: (): Promise<SaleDetail> => invoke('sales:get', { id: saleId! }),
    enabled: saleId != null,
  });

  const remaining = sale ? sale.total - sale.returnedAmount - sale.paidAmount : 0;
  const hasReturnable = (sale?.items ?? []).some((it) => it.quantity - it.returnedQuantity > 0);

  async function handlePrint() {
    if (!sale) return;
    try {
      await invoke('print:html', { html: await buildInvoiceHtml(sale, settings), title: sale.invoiceNumber });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'تعذر إرسال أمر الطباعة');
    }
  }

  const deleteMutation = useMutation({
    mutationFn: () => invoke('sales:delete', { id: saleId! }),
    onSuccess: () => {
      success('تم حذف الفاتورة بنجاح');
      setDeleteOpen(false);
      onClose();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حذف الفاتورة'),
  });

  const footer = sale ? (
    <>
      <Button variant="ghost" className="text-danger hover:bg-danger-50" icon={<Trash2 size={16} />} onClick={() => setDeleteOpen(true)}>
        حذف الفاتورة
      </Button>
      {hasReturnable && (
        <Button variant="outline" icon={<Undo2 size={16} />} onClick={() => setReturnOpen(true)}>
          مرتجع
        </Button>
      )}
      {remaining > 0 && (
        <Button variant="success" icon={<HandCoins size={16} />} onClick={() => setPayOpen(true)}>
          تحصيل دفعة
        </Button>
      )}
      <Button icon={<Printer size={16} />} onClick={() => void handlePrint()}>
        طباعة
      </Button>
    </>
  ) : undefined;

  return (
    <>
      <Modal
        open={saleId != null}
        onClose={onClose}
        size="lg"
        title="تفاصل فاتورة البيع"
        subtitle={sale?.invoiceNumber}
        footer={footer}
      >
        {isLoading || !sale ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xl font-extrabold text-ink" dir="ltr">{sale.invoiceNumber}</p>
                <p className="text-xs text-ink-soft mt-1">{formatDateTime(sale.createdAt)}</p>
              </div>
              <Badge tone={STATUS_TONES[sale.status] ?? 'gray'}>{SALE_STATUS_LABELS[sale.status] ?? sale.status}</Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InfoCell label="العميل">{sale.customer?.name ?? 'زبون نقدي'}</InfoCell>
              <InfoCell label="البائع">{sale.user?.fullName ?? '—'}</InfoCell>
              <InfoCell label="طريقة الدفع">{paymentMethodLabel(sale.paymentMethod)}</InfoCell>
              <InfoCell label="عدد البنود">{num(sale.items?.length ?? 0)}</InfoCell>
            </div>

            {sale.note && (
              <p className="text-xs text-ink-soft bg-surface-subtle rounded-xl p-3 leading-relaxed">ملاحظة: {sale.note}</p>
            )}

            {/* البنود */}
            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-subtle border-b border-line">
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-start">المنتج</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-center">الكمية</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-end">سعر الوحدة</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-ink-soft text-end">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(sale.items ?? []).map((it) => (
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
                      <td className="px-4 py-2.5 text-sm text-end" dir="ltr">{money(it.unitPrice, currency)}</td>
                      <td className="px-4 py-2.5 text-sm text-end font-bold" dir="ltr">{money(it.lineTotal, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* الإجماليات */}
            <div className="rounded-xl bg-surface-subtle border border-line p-4 space-y-1.5">
              <TotalRow label="المجموع الفرعي" value={money(sale.subtotal, currency)} />
              {sale.discount > 0 && <TotalRow label="الخصم" value={`-${money(sale.discount, currency)}`} className="text-warning" />}
              {sale.taxAmount > 0 && <TotalRow label={`الضريبة (${sale.taxRate}%)`} value={money(sale.taxAmount, currency)} />}
              <div className="flex items-center justify-between pt-1.5 border-t border-line">
                <span className="text-sm font-bold text-ink">الإجمالي</span>
                <span className="text-lg font-extrabold text-primary" dir="ltr">{money(sale.total, currency)}</span>
              </div>
              <TotalRow label="المدفوع" value={money(sale.paidAmount, currency)} className="text-success" />
              <TotalRow
                label="المتبقي"
                value={money(remaining, currency)}
                className={remaining > 0 ? 'text-danger' : 'text-ink-mute'}
              />
              {sale.returnedAmount > 0 && (
                <TotalRow label="المرتجع" value={money(sale.returnedAmount, currency)} className="text-warning" />
              )}
            </div>

            {/* الدفعات */}
            {(sale.payments ?? []).length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-ink mb-2.5">الدفعات</h4>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {(sale.payments ?? []).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                      <p className="text-sm font-bold text-success" dir="ltr">{money(p.amount, currency)}</p>
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
        saleId={saleId ?? 0}
        maxAmount={Math.max(0, remaining)}
      />

      <ReturnCreateModal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        type="SALE_RETURN"
        saleId={saleId ?? undefined}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="حذف الفاتورة"
        message={`هل أنت متأكد من حذف الفاتورة «${sale?.invoiceNumber ?? ''}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
      />
    </>
  );
}

// ─────────────────────────── تحصيل دفعة ───────────────────────────

function PaymentModal({ open, onClose, saleId, maxAmount }: { open: boolean; onClose: () => void; saleId: number; maxAmount: number }) {
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
      invoke('sales:addPayment', {
        saleId,
        amount: Math.max(0, parseInt(amount, 10) || 0),
        method,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      success('تم تسجيل الدفعة بنجاح');
      onClose();
      queryClient.invalidateQueries({ queryKey: ['sale-detail', saleId] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
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
      title="تحصيل دفعة"
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
