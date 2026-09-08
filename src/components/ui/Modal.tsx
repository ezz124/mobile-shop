import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './primitives';

// ─────────────────────────── Modal ───────────────────────────

export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink/30 backdrop-blur-[3px]"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`w-full ${widths[size]} bg-white rounded-2xl shadow-modal flex flex-col max-h-[92vh]`}
            dir="rtl"
          >
            {(title || subtitle) && (
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
                <div>
                  {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
                  {subtitle && <p className="text-xs text-ink-soft mt-0.5">{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-mute hover:bg-surface-muted hover:text-ink transition-colors shrink-0"
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
            {footer && (
              <div className="px-6 py-4 border-t border-line bg-surface-subtle rounded-b-2xl flex items-center justify-end gap-2.5">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ─────────────────────────── ConfirmDialog ───────────────────────────

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'تأكيد', danger, loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>إلغاء</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3.5">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${danger ? 'bg-danger-50 text-danger' : 'bg-primary-50 text-primary'}`}>
          <AlertTriangle size={22} />
        </div>
        <p className="text-sm text-ink-soft leading-relaxed pt-2">{message}</p>
      </div>
    </Modal>
  );
}
