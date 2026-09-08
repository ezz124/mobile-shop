import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Store, User, Lock, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { Button } from '@/components/ui/primitives';
import { Input } from '@/components/ui/inputs';

export default function Login() {
  const { login } = useAuth();
  const { settings } = useSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('أدخل اسم المستخدم وكلمة المرور');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-surface-subtle to-success-50 p-6" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px]"
      >
        <div className="bg-white rounded-3xl shadow-modal border border-line p-8">
          {/* الشعار */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-primary-700 text-white flex items-center justify-center shadow-lg shadow-primary/30 mb-4">
              <Store size={30} />
            </div>
            <h1 className="text-xl font-bold text-ink">{settings.storeName}</h1>
            <p className="text-xs text-ink-soft mt-1">نظام إدارة متاجر الهواتف النقّالة</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink-soft">اسم المستخدم</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                icon={<User size={16} />}
                autoFocus
                autoComplete="username"
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink-soft">كلمة المرور</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                icon={<Lock size={16} />}
                autoComplete="current-password"
                dir="ltr"
                className="text-left"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs font-semibold text-danger bg-danger-50 border border-danger-100 rounded-xl px-3.5 py-2.5"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg" icon={<LogIn size={18} />}>
              تسجيل الدخول
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-ink-mute">
            <ShieldCheck size={13} />
            <span>جلسات آمنة محلية — البيانات محفوظة على جهازك فقط</span>
          </div>
        </div>

        <p className="text-center text-[11px] text-ink-mute mt-5">
          الحساب الافتراضي لأول تشغيل: <span dir="ltr" className="font-semibold text-ink-soft">admin / admin123</span>
        </p>
      </motion.div>
    </div>
  );
}
