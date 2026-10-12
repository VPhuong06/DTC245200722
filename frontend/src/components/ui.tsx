import { AlertCircle, CalendarCheck2, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { STATUS_LABELS, type Status } from '../lib/types';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

const STATUS_STYLES: Record<Status, { badge: string; dot: string }> = {
  pending: { badge: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  confirmed: { badge: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500' },
  completed: { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  no_show: { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  cancelled: { badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  expired: { badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium whitespace-nowrap', s.badge, className)}>
      <span className={cx('size-1.5 rounded-full', s.dot)} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Chữ viết tắt từ hai từ cuối của họ tên: "Nguyễn Khánh Vy" → "KV". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700',
        size === 'md' ? 'size-12 text-base' : 'size-9 text-sm',
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[13px] text-faint">{hint}</p>}
      {error && <p className="mt-1.5 text-[13px] text-rose-600">{error}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-600', className)} aria-label="Đang tải" />;
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted" role="status">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        {message}
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-2 font-semibold underline underline-offset-2">
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <CalendarCheck2 className="size-8 text-faint" />
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[13px] text-faint">{label}</p>
      <div className="mt-0.5 text-[15px] text-ink">{children}</div>
    </div>
  );
}

/** Thanh các bước: Nhập thông tin → Kiểm tra khung giờ → Chờ xác nhận */
export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <span
            className={cx(
              'flex-1 truncate rounded-xl px-2 py-2.5 text-center text-[13px] font-medium sm:text-sm',
              i === current ? 'bg-brand-600 text-white' : i < current ? 'bg-brand-100 text-brand-700' : 'bg-brand-50 text-brand-700/70',
            )}
            aria-current={i === current ? 'step' : undefined}
          >
            {s}
          </span>
          {i < steps.length - 1 && <span className="hidden text-faint sm:inline" aria-hidden>→</span>}
        </li>
      ))}
    </ol>
  );
}
