import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Package, Plus, Smartphone, Truck, X } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { daysAgo, formatDate, money, toDateInput } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Badge, Button, EmptyState, FormField, PageHeader } from '@/components/ui/primitives';
import { DateRangeInput, Input, SearchInput, Select } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import PurchaseDetailModal, { purchaseStatusMeta } from '@/components/PurchaseDetailModal';
import type {
  CreatePurchaseInput,
  ProductDTO,
  PurchaseItemInput,
  PurchaseRow,
  SupplierDTO,
} from '@/shared/ipc';

export default function Purchases() {
  const { currency } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusParam = searchParams.get('focus');

  const [detailId, setDetailId] = useState<number | null>(focusParam ? Number(focusParam) : null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(toDateInput(new Date()));
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  // قراءة ?focus=<id> مرة واحدة عند فتح الصفحة ثم إزالة المعامل
  useEffect(() => {
    if (!focusParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', debounced, from, to, page],
    queryFn: () =>
      invoke('purchases:list', {
        search: debounced || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: 15,
      }),
    placeholderData: (prev) => prev,
  });

  const columns: Column<PurchaseRow>[] = [
    {
      key: 'invoice',
      header: 'رقم الفاتورة',
      render: (p) => <span dir="ltr" className="font-bold">{p.invoiceNumber}</span>,
    },
    {
      key: 'date',
      header: 'التاريخ',
      render: (p) => <span className="text-ink-soft">{formatDate(p.createdAt)}</span>,
    },
    {
      key: 'supplier',
      header: 'المورد',
      render: (p) => p.supplier?.name ?? <span className="text-ink-mute">—</span>,
    },
    {
      key: 'total',
      header: 'الإجمالي',
      align: 'end',
      render: (p) => <span dir="ltr" className="font-semibold">{money(p.total, currency)}</span>,
    },
    {
      key: 'paid',
      header: 'المدفوع',
      align: 'end',
      render: (p) => <span dir="ltr" className="text-success">{money(p.paidAmount, currency)}</span>,
      hideOn: 'hidden md:table-cell',
    },
    {
      key: 'remaining',
      header: 'المتبقي',
      align: 'end',
      render: (p) => {
        const remaining = p.total - p.returnedAmount - p.paidAmount;
        return remaining > 0
          ? <span dir="ltr" className="font-bold text-danger">{money(remaining, currency)}</span>
          : <span className="text-success font-bold">—</span>;
      },
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (p) => {
        const meta = purchaseStatusMeta(p.status);
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="المشتريات"
        subtitle="سجل فواتير الشراء من الموردين"
        actions={
          <Button icon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>
            فاتورة شراء جديدة
          </Button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ابحث برقم الفاتورة أو اسم المورد…"
          className="w-72"
        />
        <DateRangeInput
          from={from}
          to={to}
          onFromChange={(v) => { setFrom(v); setPage(1); }}
          onToChange={(v) => { setTo(v); setPage(1); }}
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        empty={<EmptyState icon={<Truck size={26} />} title="لا توجد فواتير شراء" description="أنشئ أول فاتورة شراء لتسجيل الأجهزة والملحقات الواردة" />}
        onRowClick={(p) => setDetailId(p.id)}
      />

      <Pagination page={page} pageSize={data?.pageSize ?? 15} total={data?.total ?? 0} onChange={setPage} />

      <PurchaseDetailModal purchaseId={detailId} onClose={() => setDetailId(null)} />

      <CreatePurchaseModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ─────────────────────────── فاتورة شراء جديدة ───────────────────────────

interface ImeiEntry {
  imei1: string;
  imei2: string;
  serialNumber: string;
  warrantyMonths: string;
}

interface PurchaseLine {
  product: ProductDTO;
  quantity: number;
  unitCost: string;
  sellingPrice: string;
  units: ImeiEntry[];
}

function blankUnit(warrantyMonths?: number | null): ImeiEntry {
  return {
    imei1: '',
    imei2: '',
    serialNumber: '',
    warrantyMonths: warrantyMonths != null ? String(warrantyMonths) : '',
  };
}

function CreatePurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currency, settings } = useSettings();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [createdSupplier, setCreatedSupplier] = useState<SupplierDTO | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [debouncedProduct, setDebouncedProduct] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [discount, setDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [note, setNote] = useState('');
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedProduct(productSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [productSearch]);

  // إعادة التهيئة عند الإغلاق
  useEffect(() => {
    if (open) return;
    setSupplierId(null);
    setCreatedSupplier(null);
    setProductSearch('');
    setDebouncedProduct('');
    setLines([]);
    setDiscount('0');
    setPaidAmount('0');
    setNote('');
  }, [open]);

  const { data: suppliers } = useQuery({
    queryKey: ['purchase-suppliers'],
    queryFn: () => invoke('suppliers:list', { page: 1, pageSize: 100 }),
    enabled: open,
  });

  const { data: products, isFetching: productsFetching } = useQuery({
    queryKey: ['purchase-products', debouncedProduct],
    queryFn: () => invoke('products:list', { search: debouncedProduct, page: 1, pageSize: 20 }),
    enabled: open && debouncedProduct.length > 0,
  });

  const supplierOptions = useMemo(() => {
    const list = suppliers?.data ?? [];
    return createdSupplier && !list.some((s) => s.id === createdSupplier.id)
      ? [createdSupplier, ...list]
      : list;
  }, [suppliers, createdSupplier]);

  const subtotal = lines.reduce((s, l) => s + (parseInt(l.unitCost, 10) || 0) * l.quantity, 0);
  const discountNum = Math.max(0, parseInt(discount, 10) || 0);
  const netBeforeTax = Math.max(0, subtotal - discountNum);
  const taxAmount = settings.taxEnabled ? Math.round(netBeforeTax * settings.taxRate / 100) : 0;
  const total = netBeforeTax + taxAmount;
  const paidNum = Math.max(0, parseInt(paidAmount, 10) || 0);

  function addProduct(p: ProductDTO) {
    setLines((prev) => {
      if (prev.some((l) => l.product.id === p.id)) {
        toastError(`«${p.name}» مضاف مسبقاً إلى الفاتورة`);
        return prev;
      }
      return [
        ...prev,
        {
          product: p,
          quantity: 1,
          unitCost: String(p.purchasePrice ?? 0),
          sellingPrice: String(p.sellingPrice ?? 0),
          units: p.type === 'PHONE' ? [blankUnit(p.warrantyMonths)] : [],
        },
      ];
    });
    setProductSearch('');
  }

  function removeLine(productId: number) {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function patchLine(productId: number, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, ...patch } : l)));
  }

  function setLineQty(line: PurchaseLine, raw: string) {
    const q = Math.max(1, parseInt(raw, 10) || 1);
    if (line.product.type === 'PHONE') {
      const units = [...line.units];
      while (units.length < q) units.push(blankUnit(line.product.warrantyMonths));
      if (units.length > q) units.length = q;
      patchLine(line.product.id, { quantity: q, units });
    } else {
      patchLine(line.product.id, { quantity: q });
    }
  }

  function addUnitRow(line: PurchaseLine) {
    patchLine(line.product.id, {
      quantity: line.quantity + 1,
      units: [...line.units, blankUnit(line.product.warrantyMonths)],
    });
  }

  function removeUnitRow(line: PurchaseLine, index: number) {
    if (line.units.length <= 1) return;
    patchLine(line.product.id, {
      quantity: line.quantity - 1,
      units: line.units.filter((_, i) => i !== index),
    });
  }

  function patchUnit(productId: number, index: number, patch: Partial<ImeiEntry>) {
    setLines((prev) =>
      prev.map((l) =>
        l.product.id === productId
          ? { ...l, units: l.units.map((u, i) => (i === index ? { ...u, ...patch } : u)) }
          : l
      )
    );
  }

  const createMutation = useMutation({
    mutationFn: (input: CreatePurchaseInput) => invoke('purchases:create', input),
    onSuccess: (p) => {
      success(`تم إنشاء فاتورة الشراء ${p.invoiceNumber} بنجاح`);
      onClose();
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر إنشاء فاتورة الشراء'),
  });

  function submit() {
    if (supplierId == null) {
      toastError('اختر المورد أولاً');
      return;
    }
    if (lines.length === 0) {
      toastError('أضف منتجاً واحداً على الأقل');
      return;
    }
    for (const l of lines) {
      if (l.quantity < 1) {
        toastError(`الكمية غير صحيحة للمنتج «${l.product.name}»`);
        return;
      }
      if (l.product.type === 'PHONE') {
        if (l.units.length !== l.quantity) {
          toastError(`عدد أجهزة IMEI لا يطابق الكمية للمنتج «${l.product.name}»`);
          return;
        }
        const imeis = l.units.map((u) => u.imei1.trim());
        if (imeis.some((v) => v === '')) {
          toastError(`أدخل رقم IMEI لكل جهاز من «${l.product.name}»`);
          return;
        }
        if (new Set(imeis).size !== imeis.length) {
          toastError(`توجد أرقام IMEI مكررة في «${l.product.name}»`);
          return;
        }
      }
    }
    if (paidNum > total) {
      toastError('المدفوع لا يمكن أن يتجاوز الإجمالي');
      return;
    }
    const items: PurchaseItemInput[] = lines.map((l) => {
      const sellingPrice = Math.max(0, parseInt(l.sellingPrice, 10) || 0);
      return {
        productId: l.product.id,
        quantity: l.quantity,
        unitCost: Math.max(0, parseInt(l.unitCost, 10) || 0),
        sellingPrice: sellingPrice > 0 ? sellingPrice : null,
        ...(l.product.type === 'PHONE'
          ? {
              phoneUnits: l.units.map((u) => ({
                imei1: u.imei1.trim(),
                imei2: u.imei2.trim() || undefined,
                serialNumber: u.serialNumber.trim() || undefined,
                warrantyMonths: parseInt(u.warrantyMonths, 10) || undefined,
              })),
            }
          : {}),
      };
    });
    createMutation.mutate({
      supplierId,
      items,
      discount: discountNum,
      paidAmount: paidNum,
      note: note.trim() || undefined,
    });
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        title="فاتورة شراء جديدة"
        subtitle="أضف المنتجات وأجهزة IMEI ثم احفظ الفاتورة"
        footer={
          <>
            <div className="me-auto flex items-center gap-2 text-xs text-ink-soft">
              <span className="font-semibold">الإجمالي:</span>
              <span dir="ltr" className="text-sm font-extrabold text-primary">{money(total, currency)}</span>
            </div>
            <Button variant="ghost" onClick={onClose}>إلغاء</Button>
            <Button
              loading={createMutation.isPending}
              disabled={lines.length === 0 || supplierId == null}
              icon={<Check size={16} />}
              onClick={submit}
            >
              حفظ الفاتورة
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* المورد */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <FormField label="المورد" required>
              <Select
                value={supplierId ?? ''}
                onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">اختر المورد…</option>
                {supplierOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.phone ? ` — ${s.phone}` : ''}</option>
                ))}
              </Select>
            </FormField>
            <Button variant="outline" icon={<Plus size={15} />} onClick={() => setQuickSupplierOpen(true)}>
              مورد جديد
            </Button>
          </div>

          {/* بحث المنتجات */}
          <div>
            <FormField label="إضافة منتج">
              <SearchInput
                value={productSearch}
                onChange={setProductSearch}
                placeholder="ابحث بالاسم أو الباركود لإضافة منتج…"
              />
            </FormField>
            {debouncedProduct.length > 0 && (
              <div className="mt-2 rounded-xl border border-line bg-white shadow-card overflow-hidden max-h-72 overflow-y-auto">
                {productsFetching && <p className="p-4 text-xs text-ink-mute text-center">جارٍ البحث…</p>}
                {!productsFetching && (products?.data.length ?? 0) === 0 && (
                  <p className="p-4 text-xs text-ink-mute text-center">لا توجد نتائج مطابقة</p>
                )}
                {(products?.data ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-primary-50/50 transition-colors text-start border-b border-line last:border-0"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${p.type === 'PHONE' ? 'bg-primary-50 text-primary' : 'bg-surface-muted text-ink-soft'}`}>
                      {p.type === 'PHONE' ? <Smartphone size={16} /> : <Package size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                      <p className="text-[11px] text-ink-mute">{p.type === 'PHONE' ? 'هاتف' : 'ملحق'}{p.sku ? ` • ${p.sku}` : ''}</p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-xs font-bold text-ink" dir="ltr">{money(p.purchasePrice, currency)}</p>
                      <Badge tone={p.type === 'PHONE' ? 'blue' : 'gray'}>{p.type === 'PHONE' ? 'هاتف' : 'ملحق'}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* البنود */}
          {lines.length === 0 ? (
            <p className="text-sm text-ink-mute bg-surface-subtle rounded-xl p-5 text-center">
              لم تُضف أي منتج بعد — ابحث عن منتج بالأعلى لإضافته إلى الفاتورة
            </p>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => {
                const lineTotal = (parseInt(l.unitCost, 10) || 0) * l.quantity;
                return (
                  <div key={l.product.id} className="rounded-xl border border-line bg-surface-subtle/40 p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {l.product.type === 'PHONE'
                          ? <Smartphone size={15} className="text-primary" />
                          : <Package size={15} className="text-ink-soft" />}
                        <p className="text-sm font-bold text-ink">{l.product.name}</p>
                        <Badge tone={l.product.type === 'PHONE' ? 'blue' : 'gray'}>
                          {l.product.type === 'PHONE' ? 'هاتف' : 'ملحق'}
                        </Badge>
                      </div>
                      <button
                        onClick={() => removeLine(l.product.id)}
                        className="w-8 h-8 rounded-lg text-ink-mute hover:text-danger hover:bg-danger-50 transition-colors flex items-center justify-center shrink-0"
                        title="إزالة البند"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <FormField label="الكمية">
                        <input
                          dir="ltr"
                          inputMode="numeric"
                          value={l.quantity}
                          onChange={(e) => setLineQty(l, e.target.value)}
                          className="input-base h-9 text-sm text-left font-bold"
                        />
                      </FormField>
                      <FormField label="تكلفة الوحدة">
                        <input
                          dir="ltr"
                          inputMode="numeric"
                          value={l.unitCost}
                          onChange={(e) => patchLine(l.product.id, { unitCost: e.target.value.replace(/\D/g, '') })}
                          className="input-base h-9 text-sm text-left font-bold"
                        />
                      </FormField>
                      <FormField label="سعر البيع">
                        <input
                          dir="ltr"
                          inputMode="numeric"
                          value={l.sellingPrice}
                          onChange={(e) => patchLine(l.product.id, { sellingPrice: e.target.value.replace(/\D/g, '') })}
                          className="input-base h-9 text-sm text-left font-bold"
                        />
                      </FormField>
                    </div>

                    {l.product.type === 'PHONE' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-ink-soft">أجهزة IMEI ({l.units.length}/{l.quantity})</p>
                          <Button variant="subtle" size="sm" icon={<Plus size={13} />} onClick={() => addUnitRow(l)}>
                            إضافة جهاز
                          </Button>
                        </div>
                        {l.units.map((u, i) => (
                          <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center">
                            <input
                              dir="ltr"
                              value={u.imei1}
                              onChange={(e) => patchUnit(l.product.id, i, { imei1: e.target.value })}
                              placeholder="IMEI 1"
                              className="input-base h-9 text-xs text-left font-mono"
                            />
                            <input
                              dir="ltr"
                              value={u.imei2}
                              onChange={(e) => patchUnit(l.product.id, i, { imei2: e.target.value })}
                              placeholder="IMEI 2 (اختياري)"
                              className="input-base h-9 text-xs text-left font-mono"
                            />
                            <input
                              dir="ltr"
                              value={u.serialNumber}
                              onChange={(e) => patchUnit(l.product.id, i, { serialNumber: e.target.value })}
                              placeholder="SN"
                              className="input-base h-9 w-28 text-xs text-left font-mono"
                            />
                            <input
                              dir="ltr"
                              inputMode="numeric"
                              value={u.warrantyMonths}
                              onChange={(e) => patchUnit(l.product.id, i, { warrantyMonths: e.target.value.replace(/\D/g, '') })}
                              placeholder="ضمان"
                              className="input-base h-9 w-20 text-xs text-left"
                            />
                            <button
                              onClick={() => removeUnitRow(l, i)}
                              disabled={l.units.length <= 1}
                              className="w-8 h-9 rounded-lg text-ink-mute hover:text-danger hover:bg-danger-50 transition-colors flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
                              title="إزالة الجهاز"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-end text-xs font-bold text-ink-soft">
                      إجمالي البند: <span dir="ltr" className="text-primary">{money(lineTotal, currency)}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* الخصم والدفع والملاحظة */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="خصم الفاتورة">
              <input
                dir="ltr"
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/\D/g, '') || '0')}
                className="input-base h-10 text-sm text-left font-bold"
              />
            </FormField>
            <FormField label="المدفوع" hint={paidNum > total ? 'المدفوع يتجاوز الإجمالي' : undefined}>
              <input
                dir="ltr"
                inputMode="numeric"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value.replace(/\D/g, '') || '0')}
                className={`input-base h-10 text-sm text-left font-bold text-success ${paidNum > total ? 'border-danger' : ''}`}
              />
            </FormField>
            <FormField label="ملاحظة">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة اختيارية…" />
            </FormField>
          </div>

          <div className="rounded-xl bg-surface-subtle border border-line p-4 space-y-1.5">
            <div className="flex justify-between text-xs text-ink-soft">
              <span>المجموع الفرعي</span>
              <span dir="ltr">{money(subtotal, currency)}</span>
            </div>
            {discountNum > 0 && (
              <div className="flex justify-between text-xs font-semibold text-warning">
                <span>الخصم</span>
                <span dir="ltr">-{money(discountNum, currency)}</span>
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
            <div className="flex justify-between text-xs text-ink-soft">
              <span>المتبقي للمورد</span>
              <span dir="ltr" className={total - paidNum > 0 ? 'font-bold text-danger' : 'text-success'}>
                {money(Math.max(0, total - paidNum), currency)}
              </span>
            </div>
          </div>
        </div>
      </Modal>

      <QuickSupplierModal
        open={quickSupplierOpen}
        onClose={() => setQuickSupplierOpen(false)}
        onCreated={(s) => {
          setCreatedSupplier(s);
          setSupplierId(s.id);
          setQuickSupplierOpen(false);
          queryClient.invalidateQueries({ queryKey: ['purchase-suppliers'] });
        }}
      />
    </>
  );
}

// ─────────────────────────── إضافة مورد سريع ───────────────────────────

function QuickSupplierModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (s: SupplierDTO) => void }) {
  const { error: toastError } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const createMutation = useMutation({
    mutationFn: () => invoke('suppliers:create', { name: name.trim(), phone: phone.trim() || undefined }),
    onSuccess: (s) => {
      onCreated(s);
      setName('');
      setPhone('');
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر إضافة المورد'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="إضافة مورد جديد"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button loading={createMutation.isPending} disabled={!name.trim()} onClick={() => createMutation.mutate()}>
            إضافة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="اسم المورد" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شركة النور للاتصالات" autoFocus />
        </FormField>
        <FormField label="رقم الهاتف">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" className="text-left" />
        </FormField>
      </div>
    </Modal>
  );
}
