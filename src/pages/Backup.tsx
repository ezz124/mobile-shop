import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, Info, RotateCcw, ShieldCheck } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/store/toast';
import { Button, PageHeader, Card, EmptyState } from '@/components/ui/primitives';
import { Input } from '@/components/ui/inputs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/Modal';
import type { BackupFile } from '@/shared/ipc';

type BackupRow = BackupFile & { id: number };

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 ك.ب';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
  return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}

export default function Backup() {
  const { toast, success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => invoke('backup:list', {}),
  });

  const backups: BackupFile[] = data ?? [];
  const rows: BackupRow[] = backups.map((b, i) => ({ ...b, id: i }));

  const createMutation = useMutation({
    mutationFn: () => invoke('backup:create', { name: name.trim() || undefined }),
    onSuccess: () => {
      success('تم إنشاء النسخة الاحتياطية بنجاح');
      setName('');
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر إنشاء النسخة الاحتياطية'),
  });

  const validateMutation = useMutation({
    mutationFn: (fullPath: string) => invoke('backup:validate', { fullPath }),
    onSuccess: (res) => {
      toast(res.info ? `النسخة سليمة — ${res.info}` : 'النسخة الاحتياطية سليمة وجاهزة للاستعادة', 'info');
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر فحص النسخة — الملف غير سليم'),
  });

  // ── الاستعادة (تأكيد على خطوتين) ──
  const [restoring, setRestoring] = useState<BackupFile | null>(null);
  const [restoreStep, setRestoreStep] = useState<1 | 2>(1);

  const restoreMutation = useMutation({
    mutationFn: (fullPath: string) => invoke('backup:restore', { fullPath }),
    onSuccess: () => {
      success('تمت الاستعادة بنجاح — سجّل الدخول مجددًا لمتابعة العمل');
      setRestoring(null);
      setRestoreStep(1);
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر استعادة النسخة'),
  });

  const columns: Column<BackupRow>[] = [
    {
      key: 'name',
      header: 'اسم النسخة',
      render: (b) => <span dir="ltr" className="text-xs font-mono text-ink-soft">{b.name}</span>,
    },
    { key: 'createdAt', header: 'التاريخ', render: (b) => <span className="text-ink-soft">{formatDateTime(b.createdAt)}</span> },
    { key: 'size', header: 'الحجم', align: 'end', render: (b) => <span dir="ltr" className="text-ink-soft">{formatSize(b.size)}</span> },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      render: (b) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => validateMutation.mutate(b.fullPath)}
            className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors"
            title="فحص سلامة النسخة"
            disabled={validateMutation.isPending}
          >
            <ShieldCheck size={15} className="mx-auto" />
          </button>
          <button
            onClick={() => { setRestoring(b); setRestoreStep(1); }}
            className="w-8 h-8 rounded-lg text-ink-soft hover:bg-danger-50 hover:text-danger transition-colors"
            title="استعادة هذه النسخة"
          >
            <RotateCcw size={15} className="mx-auto" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="النسخ الاحتياطي والاستعادة"
        subtitle="حماية بيانات المتجر بالنسخ الدورية والاستعادة عند الحاجة"
      />

      {/* شريط الإنشاء */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم النسخة (اختياري)"
          className="w-64"
        />
        <Button icon={<DatabaseBackup size={16} />} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
          إنشاء نسخة الآن
        </Button>
      </div>

      {/* معلومات */}
      <Card className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary flex items-center justify-center shrink-0">
          <Info size={17} />
        </div>
        <div className="text-xs text-ink-soft leading-relaxed space-y-1">
          <p>• تحفظ النسخ الاحتياطية بشكل خاص وآمن في <span className="font-semibold text-ink">Supabase Storage</span>، ويمكن تفعيل النسخ التلقائي من الإعدادات.</p>
          <p>• <span className="font-semibold text-danger">تنبيه:</span> الاستعادة تستبدل جميع البيانات الحالية بمحتوى النسخة المحددة. تأكد من وجود نسخة حديثة قبل المتابعة.</p>
        </div>
      </Card>

      {rows.length === 0 && !isLoading ? (
        <Card>
          <EmptyState
            icon={<DatabaseBackup size={26} />}
            title="لا توجد نسخ احتياطية"
            description="أنشئ أول نسخة احتياطية الآن لحماية بيانات متجرك، أو فعّل النسخ التلقائي من الإعدادات"
            action={
              <Button icon={<DatabaseBackup size={16} />} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
                إنشاء نسخة الآن
              </Button>
            }
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={rows} loading={isLoading} />
      )}

      {/* الخطوة 1: تأكيد الاستعادة */}
      <ConfirmDialog
        open={restoring != null && restoreStep === 1}
        onClose={() => { setRestoring(null); setRestoreStep(1); }}
        onConfirm={() => setRestoreStep(2)}
        title="استعادة نسخة احتياطية"
        message={`سيتم استبدال جميع البيانات الحالية بالنسخة «${restoring?.name ?? ''}» المؤرخة ${formatDateTime(restoring?.createdAt)}. هل تريد المتابعة؟`}
        confirmLabel="متابعة"
        danger
      />

      {/* الخطوة 2: تأكيد نهائي */}
      <ConfirmDialog
        open={restoring != null && restoreStep === 2}
        onClose={() => { setRestoring(null); setRestoreStep(1); }}
        onConfirm={() => restoring && restoreMutation.mutate(restoring.fullPath)}
        title="تأكيد نهائي للاستعادة"
        message="سيتم استبدال جميع البيانات الحالية. هذا الإجراء لا يمكن التراجع عنه — هل أنت متأكد تماماً؟"
        confirmLabel="استعادة الآن"
        danger
        loading={restoreMutation.isPending}
      />
    </div>
  );
}
