import { CalendarCheck } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
        <CalendarCheck className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-2xl font-bold tracking-tight text-ink">Hẹn</span>
        {!compact && <span className="block text-[13px] text-muted">An Nhiên Studio</span>}
      </span>
    </span>
  );
}
