import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Store, Printer, Package, DatabaseBackup, ShieldCheck, Save } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useSettingsQuery, FALLBACK_SETTINGS } from '@/store/settings';
import { useToast } from '@/store/toast';
import { Button, PageHeader, Card, FormField, Switch, Spinner } from '@/components/ui/primitives';
import { Input, NumberInput, Select, Textarea } from '@/components/ui/inputs';
import type { AppSettings } from '@/shared/ipc';

/** نموذج محلي — الحقول الرقمية كسلاسل نصية لتعامل سلس مع الحقول */
interface SettingsForm {
  storeName: string;
  storePhone: string;
  storeAddress: string;
  currency: string;
  invoiceFooter: string;
  lowStockThreshold: string;
  autoBackup: boolean;
  autoBackupIntervalHours: string;
  printerWidth: '80mm' | 'A4';
  taxEnabled: boolean;
  taxRate: string;
}

function toForm(s: AppSettings): SettingsForm {
  return {
    storeName: s.storeName,
    storePhone: s.storePhone,
    storeAddress: s.storeAddress,
    currency: s.currency,
    invoiceFooter: s.invoiceFooter,
    lowStockThreshold: String(s.lowStockThreshold),
    autoBackup: s.autoBackup,
    autoBackupIntervalHours: String(s.autoBackupIntervalHours),
    printerWidth: s.printerWidth,
    taxEnabled: s.taxEnabled,
    taxRate: String(s.taxRate),
  };
}

function parseNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function SectionCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary flex items-center justify-center shrink-0">{icon}</div>
        <h3 className="font-bold text-ink">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

export default function Settings() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useSettingsQuery();

  const [form, setForm] = useState<SettingsForm>(() => toForm(FALLBACK_SETTINGS));

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      invoke('settings:set', {
        storeName: form.storeName.trim(),
        storePhone: form.storePhone.trim(),
        storeAddress: form.storeAddress.trim(),
        currency: form.currency.trim() || 'ج.م',
        invoiceFooter: form.invoiceFooter,
        lowStockThreshold: parseNum(form.lowStockThreshold),
        autoBackup: form.autoBackup,
        autoBackupIntervalHours: parseNum(form.autoBackupIntervalHours),
        printerWidth: form.printerWidth,
        taxEnabled: form.taxEnabled,
        taxRate: parseNum(form.taxRate),
      }),
    onSuccess: () => {
      success('تم حفظ الإعدادات');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات'),
  });

  // ── تغيير كلمة المرور ──
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdErrors, setPwdErrors] = useState<{ oldPassword?: string; newPassword?: string; confirmPassword?: string }>({});

  const changePwdMutation = useMutation({
    mutationFn: () => invoke('auth:changePassword', { oldPassword: pwd.oldPassword, newPassword: pwd.newPassword }),
    onSuccess: () => {
      success('تم تغيير كلمة المرور بنجاح');
      setPwd({ oldPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر تغيير كلمة المرور'),
  });

  function submitPassword(): void {
    const errs: typeof pwdErrors = {};
    if (!pwd.oldPassword) errs.oldPassword = 'أدخل كلمة المرور الحالية';
    if (pwd.newPassword.length < 6) errs.newPassword = 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل';
    if (pwd.confirmPassword !== pwd.newPassword) errs.confirmPassword = 'كلمتا المرور غير متطابقتين';
    setPwdErrors(errs);
    if (Object.keys(errs).length > 0) return;
    changePwdMutation.mutate();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <Spinner size={30} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-2">
      <PageHeader title="الإعدادات" subtitle="إعدادات المتجر والفواتير والمخزون والنسخ الاحتياطي" />

      {/* معلومات المتجر */}
      <SectionCard icon={<Store size={17} />} title="معلومات المتجر">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="اسم المتجر" className="sm:col-span-2">
            <Input value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} placeholder="اسم المتجر كما يظهر على الفاتورة" />
          </FormField>
          <FormField label="هاتف المتجر">
            <Input value={form.storePhone} onChange={(e) => setForm({ ...form, storePhone: e.target.value })} placeholder="01xxxxxxxxx" dir="ltr" className="text-left" />
          </FormField>
          <FormField label="العنوان">
            <Input value={form.storeAddress} onChange={(e) => setForm({ ...form, storeAddress: e.target.value })} placeholder="المدينة — المنطقة — الشارع" />
          </FormField>
        </div>
      </SectionCard>

      {/* الفواتير والطباعة */}
      <SectionCard icon={<Printer size={17} />} title="الفواتير والطباعة">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="العملة">
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="د.ع" />
          </FormField>
          <FormField label="عرض طباعة الفاتورة">
            <Select value={form.printerWidth} onChange={(e) => setForm({ ...form, printerWidth: e.target.value as '80mm' | 'A4' })}>
              <option value="80mm">فاتورة حرارية 80مم</option>
              <option value="A4">ورق A4</option>
            </Select>
          </FormField>
          <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">تفعيل الضريبة</p>
              <p className="text-[11px] text-ink-mute">إضافة نسبة ضريبة على فواتير البيع</p>
            </div>
            <Switch checked={form.taxEnabled} onChange={(v) => setForm({ ...form, taxEnabled: v })} />
          </div>
          <FormField label="نسبة الضريبة %" hint="تُطبق فقط عند تفعيل الضريبة">
            <NumberInput
              value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
              disabled={!form.taxEnabled}
              placeholder="0"
            />
          </FormField>
          <FormField label="تذييل الفاتورة" className="sm:col-span-2" hint="يظهر أسفل الفاتورة المطبوعة">
            <Textarea value={form.invoiceFooter} onChange={(e) => setForm({ ...form, invoiceFooter: e.target.value })} placeholder="شكراً لتعاملكم معنا…" />
          </FormField>
        </div>
      </SectionCard>

      {/* المخزون */}
      <SectionCard icon={<Package size={17} />} title="المخزون">
        <FormField label="حد التنبيه للكمية المنخفضة" hint="تنبيه عند وصول الكمية لهذا الحد">
          <NumberInput
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
            placeholder="3"
          />
        </FormField>
      </SectionCard>

      {/* النسخ الاحتياطي التلقائي */}
      <SectionCard icon={<DatabaseBackup size={17} />} title="النسخ الاحتياطي التلقائي">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">تفعيل النسخ التلقائي</p>
              <p className="text-[11px] text-ink-mute">يعمل عند بدء تشغيل التطبيق</p>
            </div>
            <Switch checked={form.autoBackup} onChange={(v) => setForm({ ...form, autoBackup: v })} />
          </div>
          <FormField label="الفاصل بين النسخ (ساعات)">
            <NumberInput
              value={form.autoBackupIntervalHours}
              onChange={(e) => setForm({ ...form, autoBackupIntervalHours: e.target.value })}
              disabled={!form.autoBackup}
              placeholder="12"
            />
          </FormField>
        </div>
      </SectionCard>

      {/* الأمان */}
      <SectionCard icon={<ShieldCheck size={17} />} title="الأمان — تغيير كلمة المرور">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="كلمة المرور الحالية" required error={pwdErrors.oldPassword}>
            <Input
              type="password"
              value={pwd.oldPassword}
              onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })}
              placeholder="••••••"
              dir="ltr"
              className="text-left"
            />
          </FormField>
          <FormField label="كلمة المرور الجديدة" required error={pwdErrors.newPassword} hint="6 أحرف على الأقل">
            <Input
              type="password"
              value={pwd.newPassword}
              onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })}
              placeholder="••••••"
              dir="ltr"
              className="text-left"
            />
          </FormField>
          <FormField label="تأكيد كلمة المرور" required error={pwdErrors.confirmPassword}>
            <Input
              type="password"
              value={pwd.confirmPassword}
              onChange={(e) => setPwd({ ...pwd, confirmPassword: e.target.value })}
              placeholder="••••••"
              dir="ltr"
              className="text-left"
            />
          </FormField>
        </div>
        <div className="flex justify-end mt-4">
          <Button
            variant="subtle"
            icon={<ShieldCheck size={16} />}
            loading={changePwdMutation.isPending}
            onClick={submitPassword}
          >
            تغيير كلمة المرور
          </Button>
        </div>
      </SectionCard>

      {/* شريط الحفظ */}
      <div className="sticky bottom-4 z-20">
        <Card className="p-4 flex items-center justify-between gap-4 shadow-card-hover">
          <p className="text-xs text-ink-soft">تُطبق الإعدادات على الفواتير والتقارير والتنبيهات والنسخ الاحتياطي</p>
          <Button icon={<Save size={16} />} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            حفظ الإعدادات
          </Button>
        </Card>
      </div>
    </div>
  );
}
