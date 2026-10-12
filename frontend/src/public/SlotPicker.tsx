import { CalendarX2 } from 'lucide-react';
import { cx, ErrorBox, Spinner } from '../components/ui';
import { addDays, dayOfMonth, vnToday, weekdayShort } from '../lib/time';
import type { Availability } from '../lib/types';

/** Dải ngày cuộn ngang: hôm nay → tối đa `days` ngày tới. */
export function DateStrip({ value, onChange, days }: { value: string; onChange: (d: string) => void; days: number }) {
  const today = vnToday();
  const list = Array.from({ length: Math.max(1, days) + 1 }, (_, i) => addDays(today, i));
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Chọn ngày">
      {list.map((d) => {
        const selected = d === value;
        return (
          <button
            key={d}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(d)}
            className={cx(
              'flex w-16 shrink-0 flex-col items-center rounded-xl border py-2.5 transition',
              selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:border-brand-500',
              weekdayShort(d) === 'CN' && !selected && 'text-muted',
            )}
          >
            <span className="text-[12px]">{d === today ? 'Hôm nay' : weekdayShort(d)}</span>
            <span className="text-lg font-semibold">{dayOfMonth(d)}</span>
            <span className={cx('text-[11px]', selected ? 'text-white/80' : 'text-faint')}>Th{Number(d.slice(5, 7))}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SlotGrid({
  data,
  loading,
  error,
  value,
  onPick,
  onRetry,
}: {
  data?: Availability;
  loading: boolean;
  error: string | null;
  value: string;
  onPick: (time: string) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
        <Spinner /> Đang tìm giờ trống…
      </div>
    );
  }
  if (error) return <ErrorBox message={error} onRetry={onRetry} />;
  if (!data?.slots.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-panel px-4 py-8 text-center text-sm text-muted">
        <CalendarX2 className="size-6 text-faint" />
        {data?.message ?? 'Ngày này đã hết giờ trống.'} Vui lòng chọn ngày khác.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="listbox" aria-label="Chọn giờ">
      {data.slots.map((s) => (
        <button
          key={s.time}
          type="button"
          role="option"
          aria-selected={s.time === value}
          onClick={() => onPick(s.time)}
          className={cx(
            'rounded-xl border py-2.5 text-[15px] font-medium tabular-nums transition',
            s.time === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:border-brand-500',
          )}
        >
          {s.time}
        </button>
      ))}
    </div>
  );
}
