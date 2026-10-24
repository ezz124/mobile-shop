import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Printer,
  Plus,
  Trash2,
  SlidersHorizontal,
  Package,
  Eye,
  FileDown,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { PageHeader, Button, FormField, Switch } from '@/components/ui/primitives';
import { Input, Select, SearchInput } from '@/components/ui/inputs';
import BarcodeSvg from '@/components/BarcodeSvg';
import {
  STANDARD_LABEL_SIZES,
  type LabelSizeOption,
  type PrintItem,
  type BarcodePrintOptions,
  buildBarcodePrintHtml,
  getProductBarcode,
} from '@/lib/barcode';
import type { ProductDTO, PurchaseRow, PurchaseDTO } from '@/shared/ipc';

export default function BarcodePrint() {
  const { settings, currency } = useSettings();
  const { success, error: toastError } = useToast();

  const [items, setItems] = useState<PrintItem[]>([]);
  const [selectedSizeId, setSelectedSizeId] = useState<string>('38x25');
  const [customWidth, setCustomWidth] = useState<number>(38);
  const [customHeight, setCustomHeight] = useState<number>(25);

  const [showStoreName, setShowStoreName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcodeValue, setShowBarcodeValue] = useState(true);
  const [storeName, setStoreName] = useState(settings.storeName || 'محسن ستور');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>('');
  const [printing, setPrinting] = useState(false);

  // البحث عن منتجات لإضافتها
  const { data: searchResults } = useQuery({
    queryKey: ['barcode-product-search', searchQuery],
    queryFn: () => invoke('products:list', { search: searchQuery.trim(), pageSize: 8 }),
    enabled: searchQuery.trim().length >= 1,
  });

  // فواتير المشتريات الأخيرة للاستيراد السريع
  const { data: recentPurchases } = useQuery({
    queryKey: ['recent-purchases-for-barcode'],
    queryFn: () => invoke('purchases:list', { pageSize: 15 }),
  });

  const currentLabelSize: LabelSizeOption = useMemo(() => {
    const found = STANDARD_LABEL_SIZES.find((s) => s.id === selectedSizeId);
    if (found) return found;
    return {
      id: 'custom',
      name: 'مقاس مخصص',
      width: customWidth || 38,
      height: customHeight || 25,
    };
  }, [selectedSizeId, customWidth, customHeight]);

  const totalStickers = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0),
    [items]
  );

  const previewItem = items[0] || {
    id: 0,
    name: 'شاحن سريع 20W فائق الجودة',
    barcode: '6921847621001',
    price: 350,
    quantity: 1,
    sku: 'ANK-20W',
  };

  const handleAddItem = (product: ProductDTO) => {
    const existingIndex = items.findIndex((it) => it.id === product.id);
    if (existingIndex >= 0) {
      setItems((prev) =>
        prev.map((it, idx) => (idx === existingIndex ? { ...it, quantity: it.quantity + 1 } : it))
      );
    } else {
      setItems((prev) => [
        ...prev,
        {
          id: product.id,
          name: product.name,
          barcode: getProductBarcode(product),
          price: product.sellingPrice,
          quantity: 1,
          sku: product.sku,
          categoryName: product.category?.name,
        },
      ]);
    }
    setSearchQuery('');
  };

  const handleImportPurchase = async () => {
    if (!selectedPurchaseId) return;
    try {
      const purchase: PurchaseDTO = await invoke('purchases:get', {
        id: Number(selectedPurchaseId),
      });
      if (!purchase || !purchase.items || purchase.items.length === 0) {
        toastError('هذه الفاتورة لا تحتوي على أصناف');
        return;
      }

      const importedItems: PrintItem[] = purchase.items.map((pi) => {
        return {
          id: pi.productId,
          name: pi.productName,
          barcode: `P${String(pi.productId).padStart(6, '0')}`,
          price: pi.unitCost || 0,
          quantity: pi.quantity,
        };
      });

      setItems(importedItems);
      success(`تم استيراد ${importedItems.length} صنف من فاتورة الشراء (${purchase.invoiceNumber})`);
      setSelectedPurchaseId('');
    } catch (e) {
      toastError('تعذر استيراد أصناف الفاتورة');
    }
  };

  const handleUpdateQuantity = (id: number | string, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) => {
          if (it.id === id) {
            return { ...it, quantity: Math.max(1, it.quantity + delta) };
          }
          return it;
        })
        .filter((it) => it.quantity > 0)
    );
  };

  const handleSetExactQuantity = (id: number | string, qty: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: Math.max(1, qty) } : it))
    );
  };

  const handleRemoveItem = (id: number | string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleClearAll = () => {
    setItems([]);
  };

  const handlePrint = async () => {
    if (items.length === 0) {
      toastError('يرجى إضافة منتج واحد على الأقل للطباعة');
      return;
    }

    setPrinting(true);
    try {
      const options: BarcodePrintOptions = {
        labelSize: currentLabelSize,
        showStoreName,
        showProductName,
        showPrice,
        showBarcodeValue,
        storeName,
        currency,
      };

      const html = buildBarcodePrintHtml(items, options, settings);
      await invoke('print:html', { html, title: 'طباعة الباركود' });
      success(`تم إرسال ${totalStickers} ملصق إلى أمر الطباعة`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'تعذر تنفيذ أمر الطباعة');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="طباعة ملصقات الباركود"
        subtitle="صمم واطبع ملصقات الباركود والأسعار لمنتجات المتجر على طابعات الباركود الحرارية"
        actions={
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <Button variant="subtle" onClick={handleClearAll} className="text-xs h-9 text-danger hover:bg-danger-50">
                <Trash2 size={14} className="ml-1" /> إفراغ القائمة
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handlePrint}
              disabled={items.length === 0 || printing}
              className="gap-2 h-10 px-6 font-bold shadow-md shadow-primary/20"
            >
              {printing ? <RefreshCw size={18} className="animate-spin" /> : <Printer size={18} />}
              طباعة الملصقات ({totalStickers})
            </Button>
          </div>
        }
      />

      {/* قسم الإعدادات السريعة والاستيراد */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* إعدادات الملصق والمعاينة (يمين) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="card p-5 space-y-4 border border-line bg-white shadow-sm">
            <div className="flex items-center gap-2 pb-3 border-b border-line">
              <SlidersHorizontal size={18} className="text-primary" />
              <h3 className="font-bold text-sm text-ink">إعدادات الورق والملصق</h3>
            </div>

            <FormField label="مقاس رول الاستيكر (الطابعة)">
              <Select
                value={selectedSizeId}
                onChange={(e) => setSelectedSizeId(e.target.value)}
                className="h-10 text-xs font-semibold"
              >
                {STANDARD_LABEL_SIZES.map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.name}
                  </option>
                ))}
                <option value="custom">مقاس مخصص...</option>
              </Select>
            </FormField>

            {selectedSizeId === 'custom' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-surface-subtle rounded-xl border border-line">
                <FormField label="العرض (مم)">
                  <Input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Number(e.target.value))}
                    className="h-9 text-xs"
                    min={20}
                    max={120}
                  />
                </FormField>
                <FormField label="الارتفاع (مم)">
                  <Input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Number(e.target.value))}
                    className="h-9 text-xs"
                    min={15}
                    max={100}
                  />
                </FormField>
              </div>
            )}

            <FormField label="اسم المتجر على الاستيكر">
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="h-9 text-xs font-medium"
              />
            </FormField>

            <div className="space-y-2 pt-2 border-t border-line">
              <p className="text-xs font-bold text-ink-soft">البيانات المطبوعة على الاستيكر:</p>
              <div className="space-y-2 text-xs">
                <label className="flex items-center justify-between p-2.5 bg-surface-subtle rounded-xl cursor-pointer">
                  <span className="font-medium text-ink">اسم المتجر</span>
                  <Switch checked={showStoreName} onChange={setShowStoreName} />
                </label>
                <label className="flex items-center justify-between p-2.5 bg-surface-subtle rounded-xl cursor-pointer">
                  <span className="font-medium text-ink">اسم المنتج</span>
                  <Switch checked={showProductName} onChange={setShowProductName} />
                </label>
                <label className="flex items-center justify-between p-2.5 bg-surface-subtle rounded-xl cursor-pointer">
                  <span className="font-medium text-ink">سعر البيع ({currency})</span>
                  <Switch checked={showPrice} onChange={setShowPrice} />
                </label>
                <label className="flex items-center justify-between p-2.5 bg-surface-subtle rounded-xl cursor-pointer">
                  <span className="font-medium text-ink">أرقام الباركود المقروءة</span>
                  <Switch checked={showBarcodeValue} onChange={setShowBarcodeValue} />
                </label>
              </div>
            </div>
          </div>

          {/* المعاينة الحية */}
          <div className="card p-5 space-y-3 bg-white border border-line shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-primary" />
                <span className="text-xs font-bold text-ink">معاينة مباشرة لشكل الاستيكر</span>
              </div>
              <span className="text-[11px] font-mono font-bold text-primary bg-primary-50 px-2 py-0.5 rounded-full">
                {currentLabelSize.width} × {currentLabelSize.height} مم
              </span>
            </div>

            <div className="bg-surface-subtle/80 p-6 rounded-2xl flex items-center justify-center border border-dashed border-line">
              <div
                className="bg-white border-2 border-dashed border-ink/25 shadow-lg rounded-xl p-3 flex flex-col justify-between items-center text-center transition-all select-none"
                style={{
                  width: `${Math.min(270, currentLabelSize.width * 5.2)}px`,
                  minHeight: `${Math.min(190, currentLabelSize.height * 5.2)}px`,
                }}
              >
                {showStoreName && (
                  <p className="text-[11px] font-bold text-ink leading-tight truncate w-full">
                    {storeName}
                  </p>
                )}

                {showProductName && (
                  <p className="text-xs font-bold text-ink-strong line-clamp-2 leading-snug w-full px-1 my-0.5">
                    {previewItem.name}
                  </p>
                )}

                <div className="w-full my-1 flex justify-center items-center">
                  <BarcodeSvg
                    value={previewItem.barcode || '6921847621001'}
                    height={currentLabelSize.height <= 25 ? 26 : 34}
                    width={1.2}
                    displayValue={showBarcodeValue}
                    fontSize={9}
                  />
                </div>

                {showPrice && (
                  <div className="w-full flex items-center justify-between pt-1 border-t border-dashed border-line px-1 text-xs">
                    <span className="font-extrabold text-ink-strong">
                      {money(previewItem.price, currency)}
                    </span>
                    {previewItem.sku && (
                      <span className="text-[10px] text-ink-mute font-mono">
                        {previewItem.sku}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <p className="text-[11px] text-center text-ink-mute">
              * التصميم مصمم خصيصاً ليتناسب مع رؤوس طابعات الباركود الحرارية (38x25mm وما يعادلها).
            </p>
          </div>
        </div>

        {/* قائمة الأصناف والبحث والاستيراد (يسار) */}
        <div className="lg:col-span-8 space-y-4">
          {/* قسم استيراد سريع من فاتورة مشتريات */}
          <div className="card p-4 bg-gradient-to-r from-primary-50/50 to-white border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
                <FileDown size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-ink">استيراد المنتجات من فاتورة مشتريات</p>
                <p className="text-[11px] text-ink-mute">
                  لطباعة استيكرات البضاعة المستلمة حديثاً بالكميات الواردة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select
                value={selectedPurchaseId}
                onChange={(e) => setSelectedPurchaseId(e.target.value)}
                className="h-9 text-xs w-full sm:w-56"
              >
                <option value="">اختر فاتورة مشتريات...</option>
                {(recentPurchases?.data ?? []).map((p: PurchaseRow) => (
                  <option key={p.id} value={p.id}>
                    {p.invoiceNumber} — {p.supplier?.name ?? 'مورد'} ({p.itemCount ?? 0} صنف)
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="primary"
                onClick={handleImportPurchase}
                disabled={!selectedPurchaseId}
                className="h-9 px-3 text-xs shrink-0"
              >
                استيراد
              </Button>
            </div>
          </div>

          {/* حقل البحث السريع عن المنتجات */}
          <div className="relative">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="ابحث بالاسم أو الباركود لإضافة صنف إلى قائمة الطباعة..."
              className="w-full h-11 shadow-sm"
            />

            {searchResults?.data && searchResults.data.length > 0 && (
              <div className="absolute top-12 left-0 right-0 z-20 bg-white rounded-2xl shadow-2xl border border-line divide-y divide-line max-h-72 overflow-y-auto">
                {searchResults.data.map((p: ProductDTO) => (
                  <div
                    key={p.id}
                    onClick={() => handleAddItem(p)}
                    className="p-3.5 hover:bg-primary-50 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div>
                      <p className="text-xs font-bold text-ink">{p.name}</p>
                      <p className="text-[11px] text-ink-mute mt-0.5">
                        باركود: <span className="font-mono text-ink-soft">{getProductBarcode(p)}</span> •{' '}
                        {p.category?.name || 'عام'} • المتاح: {p.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-extrabold text-primary">
                        {money(p.sellingPrice, currency)}
                      </span>
                      <Button size="sm" variant="subtle" className="text-xs h-8 px-3">
                        <Plus size={14} className="ml-1" /> إضافة
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* جدول الأصناف المحددة للطباعة */}
          <div className="card overflow-hidden border border-line shadow-sm">
            <div className="bg-surface-subtle px-4 py-3.5 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={17} className="text-ink-soft" />
                <span className="text-xs font-bold text-ink">
                  قائمة الملصقات المراد طباعتها ({items.length} منتج)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-mute">إجمالي الاستيكرات:</span>
                <span className="text-xs font-extrabold text-primary bg-primary-50 px-2.5 py-1 rounded-full border border-primary/20">
                  {totalStickers} ملصق
                </span>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="p-12 text-center text-ink-mute space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-surface-muted text-ink-mute/60 flex items-center justify-center mx-auto">
                  <Printer size={32} />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">القائمة فارغة حالياً</p>
                  <p className="text-xs text-ink-mute mt-1">
                    ابحث عن المنتجات بالأعلى لإضافتها، أو استورد أصناف فاتورة مشتريات بضغطة زر
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-h-[460px] overflow-y-auto divide-y divide-line">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="p-4 flex items-center justify-between gap-4 hover:bg-surface-subtle/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink truncate">{it.name}</p>
                      <div className="flex items-center gap-3 text-xs text-ink-mute mt-1">
                        <span className="font-mono bg-surface-muted px-2 py-0.5 rounded text-[11px] font-semibold text-ink-soft">
                          باركود: {it.barcode}
                        </span>
                        <span className="font-bold text-ink">
                          السعر: {money(it.price, currency)}
                        </span>
                        {it.sku && <span className="text-ink-mute font-mono">SKU: {it.sku}</span>}
                      </div>
                    </div>

                    {/* أزرار زيادة ونقصان عدد الملصقات */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center border border-line rounded-xl overflow-hidden bg-white shadow-sm">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(it.id, -1)}
                          className="w-8 h-8 flex items-center justify-center text-ink-soft hover:bg-surface-muted transition-colors text-base font-bold select-none"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={it.quantity}
                          onChange={(e) =>
                            handleSetExactQuantity(it.id, parseInt(e.target.value, 10) || 1)
                          }
                          className="w-14 h-8 text-center text-xs font-bold border-x border-line focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(it.id, 1)}
                          className="w-8 h-8 flex items-center justify-center text-ink-soft hover:bg-surface-muted transition-colors text-base font-bold select-none"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        className="w-8 h-8 rounded-xl text-ink-mute hover:text-danger hover:bg-danger-50 flex items-center justify-center transition-colors"
                        title="حذف من القائمة"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
