import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, UserPlus, Check, Printer,
  Package, Smartphone, X, Loader2, ScanLine, User, BadgePercent,
} from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, PAYMENT_METHODS } from '@/lib/format';
import { buildInvoiceHtml } from '@/lib/invoice';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Button, Badge, FormField, Card } from '@/components/ui/primitives';
import { Select, Input } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/Modal';
import type { ProductDTO, PhoneUnitDTO, SaleDTO, CreateSaleInput, CustomerDTO } from '@/shared/ipc';

interface CartLine {
  product: ProductDTO;
  qty: number; // للملحقات
  unitPrice: number;
  discount: number;
  phoneUnitIds: number[]; // للهواتف
  units: PhoneUnitDTO[];
}

function lineQty(l: CartLine): number {
  return l.product.type === 'PHONE' ? l.phoneUnitIds.length : l.qty;
}

export default function POS() {
  const { settings, currency } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidAmount, setPaidAmount] = useState<string>('');

  const [unitPickerFor, setUnitPickerFor] = useState<CartLine | null>(null);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [doneSale, setDoneSale] = useState<SaleDTO | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 180);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['pos-lookup', debounced],
    queryFn: () => invoke('products:lookup', { query: debounced }),
    enabled: debounced.length > 0,
  });

  const { data: customers } = useQuery({
    queryKey: ['pos-customers', customerSearch],
    queryFn: () => invoke('customers:list', { search: customerSearch, pageSize: 30, page: 1 }),
    placeholderData: (prev) => prev,
  });

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + Math.max(0, l.unitPrice * lineQty(l) - l.discount), 0),
    [cart]
  );
  const netBeforeTax = Math.max(0, subtotal - invoiceDiscount);
  const taxAmount = settings.taxEnabled ? Math.round(netBeforeTax * settings.taxRate / 100) : 0;
  const total = netBeforeTax + taxAmount;
  const paid = paidAmount === '' ? total : Math.max(0, parseInt(paidAmount, 10) || 0);
  const remaining = total - paid;

  function addProduct(p: ProductDTO & { unit?: PhoneUnitDTO; units?: PhoneUnitDTO[]; matchType?: string }) {
    if (p.type === 'PHONE') {
      setCart((prev) => {
        const existing = prev.find((l) => l.product.id === p.id);
        const line: CartLine = existing
          ? { ...existing, units: p.units ?? existing.units }
          : { product: p, qty: 0, unitPrice: p.sellingPrice, discount: 0, phoneUnitIds: [], units: p.units ?? [] };
        setUnitPickerFor(line);
        return existing ? prev.map((l) => (l.product.id === p.id ? line : l)) : [...prev, line];
      });
    } else {
      if (p.quantity <= 0) {
        toastError(`«${p.name}» غير متوفر في المخزون`);
        return;
      }
      setCart((prev) => {
        const existing = prev.find((l) => l.product.id === p.id);
        if (existing) {
          if (lineQty(existing) + 1 > p.quantity) {
            toastError(`الكمية المتوفرة من «${p.name}» هي ${p.quantity} فقط`);
            return prev;
          }
          return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
        }
        return [...prev, { product: p, qty: 1, unitPrice: p.sellingPrice, discount: 0, phoneUnitIds: [], units: [] }];
      });
    }
    setSearch('');
    searchRef.current?.focus();
  }

  const completeMutation = useMutation({
    mutationFn: (input: CreateSaleInput) => invoke('sales:create', input),
    onSuccess: (sale) => {
      setDoneSale(sale);
      resetCart();
      queryClient.invalidateQueries();
      success(`تم إتمام البيع بنجاح — فاتورة ${sale.invoiceNumber}`);
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر إتمام البيع'),
  });

  function completeSale() {
    if (cart.length === 0) return;
    if (remaining > 0 && !customerId) {
      toastError('البيع بالدين يتطلب اختيار عميل مسجّل');
      return;
    }
    const items = cart.map((l) => ({
      productId: l.product.id,
      quantity: lineQty(l),
      unitPrice: l.unitPrice,
      discount: l.discount || undefined,
      phoneUnitIds: l.product.type === 'PHONE' ? l.phoneUnitIds : undefined,
    }));
    completeMutation.mutate({
      items,
      customerId,
      discount: invoiceDiscount,
      paidAmount: paid,
      paymentMethod: paymentMethod as CreateSaleInput['paymentMethod'],
    });
  }

  function resetCart() {
    setCart([]);
    setCustomerId(null);
    setInvoiceDiscount(0);
    setPaidAmount('');
  }

  async function printSale(sale: SaleDTO) {
    const full = sale.items?.length ? sale : await invoke('sales:get', { id: sale.id });
    await invoke('print:html', { html: await buildInvoiceHtml(full, settings), title: sale.invoiceNumber });
  }

  const somePhoneUnpicked = cart.some((l) => l.product.type === 'PHONE' && l.phoneUnitIds.length === 0);

  return (
    <div className="h-full flex gap-4 min-h-0" dir="rtl">
      {/* البحث والمنتجات */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <Card className="p-4">
          <div className="relative">
            <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
            <input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results && results.length > 0) {
                  const exact = results.find((r) => r.matchType === 'barcode' || r.matchType === 'imei');
                  addProduct(exact ?? results[0]);
                }
                if (e.key === 'Escape') setSearch('');
              }}
              placeholder="ابحث بالاسم أو الباركود أو رقم IMEI… (قارئ الباركود يعمل مباشرة)"
              className="input-base h-[52px] pr-12 pl-12 text-sm font-medium"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-ink-mute">
              {isFetching ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={18} />}
            </div>
          </div>

          {debounced && (
            <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl border border-line divide-y divide-line bg-white">
              {(results ?? []).length === 0 && !isFetching ? (
                <p className="p-6 text-center text-sm text-ink-mute">لا توجد نتائج مطابقة لـ «{debounced}»</p>
              ) : (
                (results ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-primary-50/50 transition-colors text-start"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.type === 'PHONE' ? 'bg-primary-50 text-primary' : 'bg-surface-muted text-ink-soft'}`}>
                      {p.type === 'PHONE' ? <Smartphone size={18} /> : <Package size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                      <p className="text-[11px] text-ink-mute">
                        {p.type === 'PHONE' ? `${p.units?.length ?? 0} جهاز متوفر` : `متوفر: ${p.quantity}`}
                        {p.barcode ? ` • ${p.barcode}` : ''}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-bold text-ink" dir="ltr">{money(p.sellingPrice, currency)}</p>
                      {p.matchType === 'barcode' && <Badge tone="green" className="mt-0.5">باركود</Badge>}
                      {p.matchType === 'imei' && <Badge tone="purple" className="mt-0.5">IMEI</Badge>}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </Card>

        {!debounced && (
          <Card className="p-5 flex-1 flex flex-col justify-center">
            <div className="text-center py-8">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 rounded-3xl bg-primary-50 text-primary flex items-center justify-center mx-auto mb-4"
              >
                <ShoppingCart size={34} />
              </motion.div>
              <h3 className="font-bold text-ink text-lg">نقطة البيع السريعة</h3>
              <p className="text-sm text-ink-soft mt-2 leading-relaxed max-w-md mx-auto">
                ابدأ بالبحث عن المنتج بالاسم أو امسح الباركود مباشرة.
                <br />
                للأجهزة التي تتتبع IMEI اختر الجهاز المطلوب من قائمة الأرقام التسلسلية.
              </p>
              <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
                <Badge tone="blue">Enter: إضافة أول نتيجة</Badge>
                <Badge tone="gray">Esc: إلغاء البحث</Badge>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* السلة */}
      <Card className="w-[420px] shrink-0 flex flex-col min-h-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h3 className="font-bold text-ink flex items-center gap-2">
            <ShoppingCart size={18} className="text-primary" />
            سلة البيع
            {cart.length > 0 && <Badge tone="blue">{cart.reduce((s, l) => s + lineQty(l), 0)} قطعة</Badge>}
          </h3>
          {cart.length > 0 && (
            <button onClick={resetCart} className="text-xs font-semibold text-danger hover:bg-danger-50 rounded-lg px-2.5 h-8 transition-colors flex items-center gap-1">
              <Trash2 size={13} /> إفراغ
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0">
          {cart.length === 0 ? (
            <div className="h-full flex items-center justify-center text-ink-mute text-sm">السلة فارغة — أضف منتجات للبيع</div>
          ) : (
            <AnimatePresence initial={false}>
              {cart.map((line) => {
                const qty = lineQty(line);
                const lineTotal = Math.max(0, line.unitPrice * qty - line.discount);
                return (
                  <motion.div
                    key={line.product.id}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="rounded-xl border border-line p-3 bg-surface-subtle/50"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-ink leading-snug">{line.product.name}</p>
                      <button
                        onClick={() => setCart((c) => c.filter((l) => l.product.id !== line.product.id))}
                        className="text-ink-mute hover:text-danger transition-colors shrink-0"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    {line.product.type === 'PHONE' ? (
                      <button
                        onClick={() => setUnitPickerFor(line)}
                        className={`w-full h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          qty === 0 ? 'bg-primary text-white hover:bg-primary-700' : 'bg-primary-50 text-primary hover:bg-primary-100'
                        }`}
                      >
                        {qty === 0 ? <><Plus size={14} /> اختيار الأجهزة (IMEI)</> : <><Smartphone size={14} /> {qty} جهاز — تعديل الاختيار</>}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateQty(line.product.id, -1)}
                            className="w-8 h-8 rounded-lg border border-line bg-white flex items-center justify-center text-ink-soft hover:border-primary hover:text-primary transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-ink">{qty}</span>
                          <button
                            onClick={() => updateQty(line.product.id, +1)}
                            disabled={qty >= line.product.quantity}
                            className="w-8 h-8 rounded-lg border border-line bg-white flex items-center justify-center text-ink-soft hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <Badge tone={line.product.quantity - qty >= line.product.minStock ? 'gray' : 'amber'}>
                          متوفر: {line.product.quantity}
                        </Badge>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2.5">
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold text-ink-mute block mb-1">سعر الوحدة</label>
                        <input
                          dir="ltr"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.product.id, { unitPrice: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          className="input-base h-9 text-sm text-left font-semibold"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold text-ink-mute block mb-1">خصم البند</label>
                        <input
                          dir="ltr"
                          value={line.discount || ''}
                          placeholder="0"
                          onChange={(e) => updateLine(line.product.id, { discount: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          className="input-base h-9 text-sm text-left font-semibold"
                        />
                      </div>
                    </div>

                    <p className="text-end text-sm font-bold text-success mt-2" dir="ltr">{money(lineTotal, currency)}</p>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* الدفع */}
        <div className="border-t border-line p-4 space-y-3 bg-surface-subtle/60">
          <div className="flex items-center gap-2">
            <User size={15} className="text-ink-mute shrink-0" />
            <Select
              value={customerId ?? ''}
              onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}
              className="h-10 flex-1 text-xs"
            >
              <option value="">زبون نقدي</option>
              {(customers?.data ?? []).map((c: CustomerDTO) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>
              ))}
            </Select>
            <button
              onClick={() => setQuickCustomerOpen(true)}
              className="h-10 px-3 rounded-xl border border-line bg-white text-primary hover:bg-primary-50 transition-colors text-xs font-semibold flex items-center gap-1.5 shrink-0"
            >
              <UserPlus size={14} /> جديد
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <FormField label="خصم الفاتورة">
              <input
                dir="ltr"
                value={invoiceDiscount || ''}
                placeholder="0"
                onChange={(e) => setInvoiceDiscount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="input-base h-10 text-sm text-left font-semibold"
              />
            </FormField>
            <FormField label="طريقة الدفع">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-10 text-xs">
                {PAYMENT_METHODS.filter((m) => m.value !== 'BANK').map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="rounded-xl bg-white border border-line p-3 space-y-1.5">
            <div className="flex justify-between text-xs text-ink-soft">
              <span>المجموع الفرعي</span>
              <span dir="ltr">{money(subtotal, currency)}</span>
            </div>
            {invoiceDiscount > 0 && (
              <div className="flex justify-between text-xs text-warning font-semibold">
                <span className="flex items-center gap-1"><BadgePercent size={12} /> الخصم</span>
                <span dir="ltr">-{money(invoiceDiscount, currency)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-xs text-ink-soft">
                <span>الضريبة ({settings.taxRate}%)</span><span dir="ltr">{money(taxAmount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1.5 border-t border-line">
              <span className="text-sm font-bold text-ink">الإجمالي</span>
              <span className="text-lg font-extrabold text-primary" dir="ltr">{money(total, currency)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <FormField label="المدفوع">
              <input
                dir="ltr"
                value={paidAmount}
                placeholder={String(total)}
                onChange={(e) => setPaidAmount(e.target.value.replace(/\D/g, ''))}
                className="input-base h-10 text-sm text-left font-bold text-success"
              />
            </FormField>
            <FormField label="المتبقي">
              <div className={`h-10 rounded-xl flex items-center px-3.5 text-sm font-bold ${remaining > 0 ? 'bg-danger-50 text-danger' : 'bg-success-50 text-success'}`} dir="ltr">
                {money(remaining, currency)}
              </div>
            </FormField>
          </div>

          <Button
            size="lg"
            className="w-full"
            variant="success"
            loading={completeMutation.isPending}
            disabled={cart.length === 0 || somePhoneUnpicked}
            onClick={completeSale}
            icon={<Check size={19} />}
          >
            إتمام البيع — {money(total, currency)}
          </Button>
          {somePhoneUnpicked && (
            <p className="text-[11px] text-danger font-semibold text-center">اختر أجهزة IMEI لكل منتج هواتف قبل الإتمام</p>
          )}
        </div>
      </Card>

      <UnitPickerModal
        line={unitPickerFor}
        onClose={() => setUnitPickerFor(null)}
        onConfirm={(unitIds) => {
          if (!unitPickerFor) return;
          setCart((prev) => prev.map((l) =>
            l.product.id === unitPickerFor.product.id
              ? { ...l, phoneUnitIds: unitIds, unitPrice: l.unitPrice || l.product.sellingPrice }
              : l
          ));
          setUnitPickerFor(null);
        }}
      />

      <QuickCustomerModal
        open={quickCustomerOpen}
        onClose={() => setQuickCustomerOpen(false)}
        onCreated={(c) => {
          setCustomerId(c.id);
          queryClient.invalidateQueries({ queryKey: ['pos-customers'] });
          setQuickCustomerOpen(false);
        }}
      />

      <Modal
        open={doneSale !== null}
        onClose={() => setDoneSale(null)}
        size="sm"
        title="تم البيع بنجاح"
        footer={
          <>
            <Button variant="outline" onClick={() => setDoneSale(null)}>إغلاق</Button>
            <Button variant="success" icon={<Printer size={16} />} onClick={() => doneSale && void printSale(doneSale)}>
              طباعة الفاتورة
            </Button>
          </>
        }
      >
        {doneSale && (
          <div className="text-center py-4">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="w-16 h-16 rounded-full bg-success-50 text-success flex items-center justify-center mx-auto mb-4"
            >
              <Check size={30} />
            </motion.div>
            <p className="text-sm text-ink-soft">رقم الفاتورة</p>
            <p className="text-2xl font-extrabold text-ink" dir="ltr">{doneSale.invoiceNumber}</p>
            <p className="text-lg font-bold text-primary mt-2" dir="ltr">{money(doneSale.total, currency)}</p>
          </div>
        )}
      </Modal>
    </div>
  );

  function updateQty(productId: number, delta: number) {
    setCart((prev) => prev.map((l) => {
      if (l.product.id !== productId || l.product.type === 'PHONE') return l;
      const newQty = Math.min(l.product.quantity, Math.max(1, l.qty + delta));
      return { ...l, qty: newQty };
    }));
  }

  function updateLine(productId: number, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, ...patch } : l)));
  }
}

// ─────────────────────────── اختيار أجهزة IMEI ───────────────────────────

function UnitPickerModal({
  line, onClose, onConfirm,
}: { line: CartLine | null; onClose: () => void; onConfirm: (unitIds: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    setSelected(line?.phoneUnitIds ?? []);
  }, [line]);

  if (!line) return null;

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Modal
      open={line !== null}
      onClose={onClose}
      title={`اختيار الأجهزة — ${line.product.name}`}
      subtitle={`اختر الأجهزة المطلوبة للبيع (${selected.length} مختار)`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => onConfirm(selected)} disabled={selected.length === 0}>
            تأكيد الاختيار ({selected.length})
          </Button>
        </>
      }
    >
      {line.units.length === 0 ? (
        <p className="text-sm text-ink-soft text-center py-8">لا توجد أجهزة متوفرة في المخزون لهذا المنتج</p>
      ) : (
        <div className="space-y-1.5">
          {line.units.map((u) => {
            const isSel = selected.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-start ${
                  isSel ? 'border-primary bg-primary-50' : 'border-line hover:border-line-strong bg-white'
                }`}
              >
                <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${isSel ? 'bg-primary text-white' : 'border-2 border-line-strong'}`}>
                  {isSel && <Check size={13} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink font-mono" dir="ltr">{u.imei1}</p>
                  {u.serialNumber && <p className="text-[11px] text-ink-mute font-mono" dir="ltr">SN: {u.serialNumber}</p>}
                </div>
                <Badge tone={u.status === 'IN_STOCK' ? 'green' : 'gray'}>{u.status === 'IN_STOCK' ? 'متوفر' : u.status}</Badge>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────── عميل سريع ───────────────────────────

function QuickCustomerModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (c: CustomerDTO) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { error: toastError } = useToast();

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const c = await invoke('customers:create', { name: name.trim(), phone: phone.trim() || undefined });
      onCreated(c);
      setName('');
      setPhone('');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'تعذر إضافة العميل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إضافة عميل جديد"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button loading={loading} onClick={() => void submit()} disabled={!name.trim()}>إضافة</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="اسم العميل" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد محمد" autoFocus />
        </FormField>
        <FormField label="رقم الهاتف">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" className="text-left" />
        </FormField>
      </div>
    </Modal>
  );
}
