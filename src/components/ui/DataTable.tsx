import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'start' | 'center' | 'end';
  width?: string;
  hideOn?: string;
}

// ─────────────────────────── DataTable ───────────────────────────

export function DataTable<T extends { id: number }>({
  columns, rows, loading, empty, onRowClick, keyExtractor,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  keyExtractor?: (row: T) => string | number;
}) {
  const aligns = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;
  const paddings = { start: 'pr-5', center: 'px-5', end: 'pl-5 text-left' } as const;

  if (loading) {
    return (
      <div className="card overflow-hidden">
        <div className="h-12 border-b border-line bg-surface-subtle" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-line last:border-0" style={{ opacity: 1 - i * 0.12 }}>
            <div className="h-full bg-surface-muted/60 animate-pulse m-2 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        {empty ?? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-3xl bg-surface-muted flex items-center justify-center text-ink-mute mb-4">
              <Inbox size={28} />
            </div>
            <h3 className="font-bold text-ink">لا توجد بيانات</h3>
            <p className="text-sm text-ink-soft mt-1">لم يُضف أي سجل بعد</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-subtle border-b border-line">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`px-5 py-3.5 text-xs font-bold text-ink-soft whitespace-nowrap ${aligns[col.align ?? 'start']} ${col.hideOn ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <motion.tr
                key={keyExtractor ? keyExtractor(row) : row.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line last:border-0 hover:bg-primary-50/40 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-5 py-3.5 text-sm text-ink whitespace-nowrap ${aligns[col.align ?? 'start']} ${paddings[col.align ?? 'start']} ${col.hideOn ?? ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────── Pagination ───────────────────────────

export function Pagination({
  page, pageSize, total, onChange,
}: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="text-xs text-ink-mute px-1">إجمالي السجلات: {total}</p>
    ) : null;
  }

  const pages: (number | '…')[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <p className="text-xs text-ink-mute">
        إجمالي السجلات: <span className="font-semibold text-ink-soft">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight size={16} />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="w-7 text-center text-xs text-ink-mute">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                p === page ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'text-ink-soft hover:bg-surface-muted'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    </div>
  );
}
