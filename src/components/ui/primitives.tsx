import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

// ─────────────────────────── Button ───────────────────────────

type ButtonVariant = 'primary' | 'success' | 'danger' | 'outline' | 'ghost' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-700 shadow-sm shadow-primary/25',
  success: 'bg-success text-white hover:bg-success-700 shadow-sm shadow-success/25',
  danger: 'bg-danger text-white hover:bg-danger-700 shadow-sm shadow-danger/20',
  outline: 'border border-line bg-white text-ink hover:bg-surface-muted hover:border-line-strong',
  ghost: 'text-ink-soft hover:bg-surface-muted hover:text-ink',
  subtle: 'bg-primary-50 text-primary hover:bg-primary-100',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-xs gap-1.5 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className = '', children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`btn-transition inline-flex items-center justify-center font-semibold whitespace-nowrap select-none
        disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 size={size === 'sm' ? 14 : 17} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ─────────────────────────── Badge ───────────────────────────

type BadgeTone = 'blue' | 'green' | 'red' | 'amber' | 'gray' | 'purple';

const TONES: Record<BadgeTone, string> = {
  blue: 'bg-primary-50 text-primary-700 border-primary-100',
  green: 'bg-success-50 text-success-700 border-success-100',
  red: 'bg-danger-50 text-danger-600 border-danger-100',
  amber: 'bg-warning-50 text-warning-600 border-warning-100',
  gray: 'bg-surface-muted text-ink-soft border-line',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
};

export function Badge({ tone = 'gray', children, className = '' }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-5 ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

// ─────────────────────────── Card & StatCard ───────────────────────────

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function StatCard({
  title, value, sub, icon, tone = 'blue', delay = 0, onClick,
}: {
  title: string; value: ReactNode; sub?: ReactNode; icon: ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray'; delay?: number; onClick?: () => void;
}) {
  const iconTones = {
    blue: 'bg-primary-50 text-primary',
    green: 'bg-success-50 text-success',
    amber: 'bg-warning-50 text-warning',
    red: 'bg-danger-50 text-danger',
    gray: 'bg-surface-muted text-ink-soft',
  } as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`card p-5 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-card-hover transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconTones[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-soft mb-1 truncate">{title}</p>
        <p className="text-xl font-bold text-ink truncate">{value}</p>
        {sub != null && <p className="text-[11px] text-ink-mute mt-0.5 truncate">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ─────────────────────────── Spinner & Loading ───────────────────────────

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-primary ${className}`} />;
}

export function LoadingBox({ label = 'جارٍ التحميل…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-mute">{label}</p>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-surface-muted animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

// ─────────────────────────── FormField ───────────────────────────

export function FormField({
  label, error, hint, required, children, className = '',
}: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-semibold text-ink-soft">
        {label}
        {required && <span className="text-danger ms-1">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-danger font-medium">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-ink-mute">{hint}</p>
      ) : null}
    </div>
  );
}

// ─────────────────────────── Switch ───────────────────────────

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-[26px] rounded-full transition-colors duration-200 shrink-0 disabled:opacity-50 ${checked ? 'bg-success' : 'bg-line-strong'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm ${checked ? 'left-[3px]' : 'left-[calc(100%-23px)]'}`}
      />
    </button>
  );
}

// ─────────────────────────── PageHeader ───────────────────────────

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink-soft mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ─────────────────────────── Tabs ───────────────────────────

export function Tabs<T extends string>({
  tabs, value, onChange,
}: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-surface-muted rounded-xl w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`relative px-4 h-9 rounded-lg text-sm font-semibold transition-colors ${
            value === tab.value ? 'text-ink' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {value === tab.value && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 bg-white rounded-lg shadow-card"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10">
            {tab.label}
            {tab.count != null && <span className="text-ink-mute font-medium ms-1.5">{tab.count}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────── EmptyState ───────────────────────────

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-surface-muted flex items-center justify-center text-ink-mute mb-4">
        {icon}
      </div>
      <h3 className="text-base font-bold text-ink mb-1">{title}</h3>
      {description && <p className="text-sm text-ink-soft max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
