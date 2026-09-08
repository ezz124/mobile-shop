import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';

// ─────────────────────────── Input ───────────────────────────

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, icon, className = '', ...props }, ref
) {
  return (
    <div className="relative w-full">
      {icon && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none">{icon}</span>}
      <input
        ref={ref}
        className={`input-base ${icon ? 'pr-10' : ''} ${invalid ? 'border-danger focus:border-danger focus:ring-danger/10' : ''} ${className}`}
        {...props}
      />
    </div>
  );
});

// ─────────────────────────── NumberInput ───────────────────────────

/** حقل رقمي بأرقام لاتينية وتنسيق آلاف عند فقدان التركيز */
export const NumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function NumberInput({ value, onChange, onBlur, invalid, className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        dir="ltr"
        inputMode="numeric"
        className={`input-base text-left font-semibold tracking-wide ${invalid ? 'border-danger' : ''} ${className}`}
        value={value ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        {...props}
      />
    );
  }
);

// ─────────────────────────── Select ───────────────────────────

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className = '', children, ...props }, ref
) {
  return (
    <select
      ref={ref}
      className={`input-base cursor-pointer ${invalid ? 'border-danger' : ''} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
});

// ─────────────────────────── Textarea ───────────────────────────

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className = '', ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={`input-base h-auto py-2.5 min-h-[84px] resize-y leading-relaxed ${invalid ? 'border-danger' : ''} ${className}`}
        {...props}
      />
    );
  }
);

// ─────────────────────────── SearchInput ───────────────────────────

export function SearchInput({
  value, onChange, placeholder = 'بحث…', autoFocus, className = '',
}: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-base h-10 pr-10 pl-9"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink transition-colors"
          type="button"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────── DateRangeInput ───────────────────────────

export function DateRangeInput({
  from, to, onFromChange, onToChange, className = '',
}: { from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="input-base h-10 w-[150px] text-xs" dir="ltr" />
      <span className="text-ink-mute text-xs">—</span>
      <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="input-base h-10 w-[150px] text-xs" dir="ltr" />
    </div>
  );
}
