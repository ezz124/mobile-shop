import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; kind: ToastKind; message: string }

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info } as const;
const COLORS = {
  success: 'text-success bg-success/10 border-success/20',
  error: 'text-danger bg-danger/10 border-danger/20',
  warning: 'text-warning bg-warning/10 border-warning/20',
  info: 'text-primary bg-primary/10 border-primary/20',
} as const;

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-4), { id, kind, message }]);
    setTimeout(() => remove(id), kind === 'error' ? 6000 : 3500);
  }, [remove]);

  const value = useMemo<ToastContextValue>(() => ({
    toast,
    success: (m: string) => toast(m, 'success'),
    error: (m: string) => toast(m, 'error'),
  }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 left-5 z-[100] flex flex-col gap-2 max-w-md">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.kind];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -24 }}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-card-hover bg-white ${COLORS[t.kind]}`}
              >
                <Icon size={20} className="shrink-0" />
                <p className="text-sm font-medium text-ink flex-1 leading-relaxed">{t.message}</p>
                <button onClick={() => remove(t.id)} className="text-ink-mute hover:text-ink transition-colors">
                  <X size={16} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
