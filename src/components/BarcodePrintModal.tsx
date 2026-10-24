import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Plus, Trash2, Eye, SlidersHorizontal, Package, RefreshCw } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { Button, FormField, Switch } from '@/components/ui/primitives';
import { Input, Select, SearchInput } from '@/components/ui/inputs';
import BarcodeSvg from './BarcodeSvg';
import {
  STANDARD_LABEL_SIZES,
  type LabelSizeOption,
  type PrintItem,
  type BarcodePrintOptions,
  buildBarcodePrintHtml,
  getProductBarcode,
} from '@/lib/barcode';
import type { ProductDTO } from '@/shared/ipc';

interface BarcodePrintModalProps {
  open: boolean;
  onClose: () => void;
  initialItems?: PrintItem[];
  title?: string;
}

export default function BarcodePrintModal({
  open,
  onClose,
  initialItems = [],
  title = 'طباعة ملصقات الباركود',
}: BarcodePrintModalProps) {
  const { settings, currency } = useSettings();
  const { success, error: toastError } = useToast();

  const [items, setItems] = useState<PrintItem[]>(initialItems);
  const [selectedSizeId, setSelectedSizeId] = useState<string>('38x25');
  const [customWidth, setCustomWidth] = useState<number>(38);
  const [customHeight, setCustomHeight] = useState<number>(25);

  const [showStoreName, setShowStoreName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcodeValue, setShowBarcodeValue] = useState(true);
  const [storeName, setStoreName] = useState(settings.storeName || 'محسن ستور');

  const [searchQuery, setSearchQuery] = useState('');
  const [printing, setPrinting] = useState(false);

  // تحديث العناصر عند تغير initialItems
  useEffect(() => {
    if (initialItems.length > 0) {
      setItems(initialItems);
    }
  }, [initialItems]);

  useEffect(() => {
    if (settings.storeName) {
      setStoreName(settings.storeName);
    }
  }, [settings.storeName]);

  // استعلام البحث عن منتجات إضافية لإضافتها إلى قائمة الطباعة
  const { data: searchResults } = useQuery({
    queryKey: ['products-search-barcode', searchQuery],
    queryFn: () => invoke('products:list', { search: searchQuery.trim(), pageSize: 8 }),
    enabled: searchQuery.trim().length >= 1,
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
    name: 'شاحن سريع 20W مع كابل',
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

  const handleUpdateQuantity = (id: number | string, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) => {
          if (it.id === id) {
            const nextQty = Math.max(1, it.quantity + delta);
            return { ...it, quantity: nextQty };
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
      success(`جاري إرسال ${totalStickers} ملصق إلى الطابعة...`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'تعذر تنفيذ أمر الطباعة');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* العمود الأيمن: إعدادات المقاس والمعاينة */}
          <div className="lg:col-span-5 space-y-4">
            <div className="card p-4 space-y-4 bg-surface-subtle/50 border border-line">
              <div className="flex items-center gap-2 pb-2 border-b border-line">
                <SlidersHorizontal size={18} className="text-primary" />
                <h4 className="text-sm font-bold text-ink">إعدادات الملصق ومقاس الورق</h4>
              </div>

              <FormField label="مقاس رول الاستيكر">
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
                  <option value="custom">مقاس مخصص (أدخل الأبعاد)...</option>
                </Select>
              </FormField>

              {selectedSizeId === 'custom' && (
                <div className="grid grid-cols-2 gap-3 p-2 bg-white rounded-xl border border-line">
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

              <FormField label="اسم المتجر على الملصق">
                <Input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="اسم المحل"
                />
              </FormField>

              {/* عناصر الاستيكر */}
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-ink-soft">البيانات المعروضة على الملصق:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-line cursor-pointer select-none">
                    <Switch checked={showStoreName} onChange={setShowStoreName} />
                    <span>اسم المتجر</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-line cursor-pointer select-none">
                    <Switch checked={showProductName} onChange={setShowProductName} />
                    <span>اسم المنتج</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-line cursor-pointer select-none">
                    <Switch checked={showPrice} onChange={setShowPrice} />
                    <span>سعر البيع</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-line cursor-pointer select-none">
                    <Switch checked={showBarcodeValue} onChange={setShowBarcodeValue} />
                    <span>أرقام الباركود</span>
                  </label>
                </div>
              </div>
            </div>

            {/* معاينة حية للملصق */}
            <div className="card p-4 space-y-3 bg-white border border-line">
              <div className="flex items-center justify-between pb-1 border-b border-line">
                <div className="flex items-center gap-2">
                  <Eye size={16} className="text-primary" />
                  <span className="text-xs font-bold text-ink">معاينة شكل الملصق الفعلي</span>
                </div>
                <span className="text-[11px] font-mono text-ink-mute">
                  {currentLabelSize.width} × {currentLabelSize.height} mm
                </span>
              </div>

              {/* محاكاة الاستيكر الفعلي بأبعاد تناسبية */}
              <div className="bg-surface-subtle p-4 rounded-xl flex items-center justify-center">
                <div
                  className="bg-white border-2 border-dashed border-ink/20 shadow-md rounded-lg p-2.5 flex flex-col justify-between items-center text-center transition-all select-none"
                  style={{
                    width: `${Math.min(260, currentLabelSize.width * 5)}px`,
                    minHeight: `${Math.min(180, currentLabelSize.height * 5)}px`,
                  }}
                >
                  {showStoreName && (
                    <p className="text-[11px] font-bold text-ink leading-tight truncate w-full">
                      {storeName}
                    </p>
                  )}

                  {showProductName && (
                    <p className="text-xs font-bold text-ink-strong line-clamp-2 leading-snug w-full px-1">
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
                * المعاينة تقريبية، والطباعة ستكون متطابقة بدقة مع رول الورق بالطابعة.
              </p>
            </div>
          </div>

          {/* العمود الأيسر: قائمة المنتجات المراد طباعتها */}
          <div className="lg:col-span-7 space-y-4">
            {/* حقل البحث وإضافة منتجات إضافية */}
            <div className="relative">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="ابحث بالاسم أو الباركود لإضافة منتجات إلى قائمة الطباعة..."
                className="w-full h-11"
              />

              {searchResults?.data && searchResults.data.length > 0 && (
                <div className="absolute top-12 left-0 right-0 z-20 bg-white rounded-xl shadow-xl border border-line divide-y divide-line max-h-60 overflow-y-auto">
                  {searchResults.data.map((p: ProductDTO) => (
                    <div
                      key={p.id}
                      onClick={() => handleAddItem(p)}
                      className="p-3 hover:bg-primary-50 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div>
                        <p className="text-xs font-bold text-ink">{p.name}</p>
                        <p className="text-[11px] text-ink-mute">
                          باركود: {getProductBarcode(p)} • {p.category?.name || 'عام'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-extrabold text-primary">
                          {money(p.sellingPrice, currency)}
                        </span>
                        <Button size="sm" variant="subtle" className="text-xs h-7 px-2">
                          <Plus size={14} className="ml-1" /> إضافة
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* جدول عناصر الطباعة */}
            <div className="card overflow-hidden border border-line">
              <div className="bg-surface-subtle px-4 py-3 border-b border-line flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-ink-soft" />
                  <span className="text-xs font-bold text-ink">
                    المنتجات المحددة للطباعة ({items.length} صنف)
                  </span>
                </div>
                <div className="text-xs font-bold text-primary bg-primary-50 px-2.5 py-1 rounded-full">
                  إجمالي الملصقات: {totalStickers}
                </div>
              </div>

              {items.length === 0 ? (
                <div className="p-8 text-center text-ink-mute space-y-2">
                  <Printer size={32} className="mx-auto text-ink-mute/50" />
                  <p className="text-sm font-semibold">لم تقم بإضافة أي منتجات بعد</p>
                  <p className="text-xs">استخدم شريط البحث أعلاه لإضافة منتجات إلى أمر الطباعة</p>
                </div>
              ) : (
                <div className="max-h-[380px] overflow-y-auto divide-y divide-line">
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-surface-subtle/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-ink truncate">{it.name}</p>
                        <div className="flex items-center gap-3 text-[11px] text-ink-mute mt-0.5">
                          <span className="font-mono bg-surface-muted px-1.5 py-0.5 rounded text-[10px]">
                            {it.barcode}
                          </span>
                          <span className="font-bold text-ink-soft">
                            {money(it.price, currency)}
                          </span>
                        </div>
                      </div>

                      {/* التحكم في عدد النسخ */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-ink-mute">العدد:</span>
                        <div className="flex items-center border border-line rounded-lg overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(it.id, -1)}
                            className="w-7 h-7 flex items-center justify-center text-ink-soft hover:bg-surface-muted transition-colors text-sm font-bold"
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
                            className="w-12 h-7 text-center text-xs font-bold border-x border-line focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(it.id, 1)}
                            className="w-7 h-7 flex items-center justify-center text-ink-soft hover:bg-surface-muted transition-colors text-sm font-bold"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.id)}
                          className="w-7 h-7 rounded-lg text-ink-mute hover:text-danger hover:bg-danger-50 flex items-center justify-center transition-colors mr-1"
                          title="حذف من القائمة"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* أزرار الإجراء السفلية */}
        <div className="pt-4 border-t border-line flex items-center justify-between">
          <div className="text-xs text-ink-soft">
            سيتم طباعة <span className="font-bold text-ink">{totalStickers}</span> ملصق بمقاس{' '}
            <span className="font-bold text-ink">
              {currentLabelSize.width} × {currentLabelSize.height} مم
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="subtle" onClick={onClose}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              onClick={handlePrint}
              disabled={items.length === 0 || printing}
              className="gap-2 px-5"
            >
              {printing ? <RefreshCw size={16} className="animate-spin" /> : <Printer size={16} />}
              طباعة الملصقات الآن ({totalStickers})
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
