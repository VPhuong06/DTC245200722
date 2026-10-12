import { useMemo } from 'react';
import { cx, EmptyState, StatusBadge } from '../../components/ui';
import {
  addDays,
  dateOf,
  dayOfMonth,
  formatDayTitle,
  minutesOf,
  timeOf,
  vnToday,
  weekdayOf,
  weekdayShort,
} from '../../lib/time';
import { STATUS_LABELS, type Appointment, type Status } from '../../lib/types';

interface ViewProps {
  items: Appointment[];
  selectedId?: string;
  onSelect: (a: Appointment) => void;
}

const BLOCK_STYLES: Record<Status, string> = {
  pending: 'bg-orange-100 text-orange-950 hover:bg-orange-200/80',
  confirmed: 'bg-brand-100 text-brand-800 hover:bg-brand-200/70',
  completed: 'bg-emerald-100 text-emerald-950 hover:bg-emerald-200/70',
  no_show: 'bg-sky-100 text-sky-950 hover:bg-sky-200/70',
  cancelled: 'bg-rose-100 text-rose-950 hover:bg-rose-200/70',
  expired: 'bg-slate-100 text-slate-600 hover:bg-slate-200/70',
};

const CARD_STYLES: Record<Status, string> = {
  pending: 'bg-amber-50',
  confirmed: 'bg-brand-50',
  completed: 'bg-brand-50/70',
  no_show: 'bg-slate-100',
  cancelled: 'bg-rose-50',
  expired: 'bg-slate-50',
};

// ------------------------------------------------------------------ Danh sách

export function ListView({ items, selectedId, onSelect, date }: ViewProps & { date: string }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-semibold">{formatDayTitle(date)}</h2>
        <span className="text-[13px] text-muted">{items.length} lịch hẹn</span>
      </header>
      {items.length === 0 ? (
        <EmptyState title="Không có lịch hẹn phù hợp">Thử đổi ngày, bộ lọc hoặc từ khóa tìm kiếm.</EmptyState>
      ) : (
        <>
          {/* Bảng cho màn hình rộng */}
          <table className="hidden w-full text-left md:table">
            <thead className="bg-canvas text-[13px] text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Thời gian</th>
                <th className="px-5 py-3 font-medium">Khách hàng</th>
                <th className="px-5 py-3 font-medium">Dịch vụ</th>
                <th className="px-5 py-3 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onSelect(a)}
                  className={cx(
                    'cursor-pointer border-t border-line transition',
                    a.id === selectedId ? 'bg-brand-50/80' : 'hover:bg-canvas/70',
                  )}
                  aria-selected={a.id === selectedId}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{timeOf(a.startAt)}</p>
                    <p className="text-[13px] text-faint">{a.durationMin} phút</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => onSelect(a)}>
                      {a.customer.fullName}
                    </button>
                    <p className="text-[13px] text-faint">{a.customer.phone}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p>{a.service.name}</p>
                    <p className="text-[13px] text-faint">{a.staff.fullName}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Thẻ cho điện thoại */}
          <ul className="divide-y divide-line md:hidden">
            {items.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a)}
                  className={cx('flex w-full items-start gap-3 px-4 py-3.5 text-left', a.id === selectedId && 'bg-brand-50/80')}
                >
                  <div className="w-14 shrink-0">
                    <p className="font-semibold">{timeOf(a.startAt)}</p>
                    <p className="text-[12px] text-faint">{a.durationMin} phút</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.customer.fullName}</p>
                    <p className="truncate text-[13px] text-muted">
                      {a.service.name} · {a.staff.fullName}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Lịch theo ngày

const HOUR_PX = 76;

interface Placed {
  a: Appointment;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

/** Xếp các lịch chồng giờ (khác nhân viên) thành nhiều cột trong cùng một cụm. */
export function layoutDay(items: Appointment[]): Placed[] {
  const sorted = items
    .map((a) => ({ a, start: minutesOf(timeOf(a.startAt)), end: minutesOf(timeOf(a.startAt)) + a.durationMin }))
    .sort((x, y) => x.start - y.start || y.end - x.end);
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = laneEnds.length;
    for (const p of cluster) p.lanes = lanes;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const s of sorted) {
    if (cluster.length && s.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.end);
    } else {
      laneEnds[lane] = s.end;
    }
    cluster.push({ ...s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  if (cluster.length) flush();
  return placed;
}

export function DayView({ items, selectedId, onSelect, date }: ViewProps & { date: string }) {
  const placed = useMemo(() => layoutDay(items), [items]);
  const startHour = Math.min(9, ...placed.map((p) => Math.floor(p.start / 60)));
  const endHour = Math.max(17, ...placed.map((p) => Math.ceil(p.end / 60)));
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const height = (endHour - startHour) * HOUR_PX;

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-semibold">{formatDayTitle(date)}</h2>
        <span className="text-[13px] text-muted">{items.length} lịch hẹn</span>
      </header>
      <div className="flex gap-4 px-3 py-5 sm:px-5">
        <div className="hidden w-20 shrink-0 border-r border-line pr-4 sm:block">
          <p className="text-[15px] text-muted">{weekdayShort(date) === 'CN' ? 'Chủ nhật' : `Thứ ${weekdayOf(date) + 1}`}</p>
          <p className="my-1 text-5xl font-light">{dayOfMonth(date)}</p>
          <p className="text-[13px] text-muted">UTC+7</p>
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: height + 12 }}>
          {hours.map((h) => (
            <div key={h} className="absolute inset-x-0 flex items-center gap-3" style={{ top: (h - startHour) * HOUR_PX }}>
              <span className="w-6 -translate-y-1/2 text-right text-[13px] text-faint">{h}</span>
              <span className="h-px flex-1 -translate-y-1/2 bg-line" />
            </div>
          ))}
          <div className="absolute inset-y-0 right-0 left-9">
            {placed.map(({ a, start, end, lane, lanes }) => {
              const top = ((start - startHour * 60) / 60) * HOUR_PX + 2;
              const h = Math.max(26, ((end - start) / 60) * HOUR_PX - 4);
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => onSelect(a)}
                  className={cx(
                    'absolute overflow-hidden rounded-lg px-3 py-1.5 text-left transition',
                    BLOCK_STYLES[a.status],
                    a.id === selectedId && 'ring-2 ring-brand-600',
                  )}
                  style={{
                    top,
                    height: h,
                    left: `calc(${(lane / lanes) * 100}% + ${lane ? 4 : 0}px)`,
                    width: `calc(${100 / lanes}% - ${lanes > 1 ? 4 : 0}px)`,
                  }}
                  title={`${timeOf(a.startAt)}–${timeOf(a.endAt)} · ${a.customer.fullName} · ${STATUS_LABELS[a.status]}`}
                >
                  <p className="truncate text-[15px] font-semibold">{a.customer.fullName}</p>
                  {h >= 48 && (
                    <p className="truncate text-[13px] opacity-80">
                      {timeOf(a.startAt)} · {a.service.name} · {a.staff.fullName} · {STATUS_LABELS[a.status]}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Lịch theo tuần

export function WeekView({ items, selectedId, onSelect, weekStart }: ViewProps & { weekStart: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = vnToday();
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of items) {
      const d = dateOf(a.startAt);
      map.set(d, [...(map.get(d) ?? []), a]);
    }
    return map;
  }, [items]);

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-semibold">
          {days[0].slice(8, 10)}/{days[0].slice(5, 7)} – {days[6].slice(8, 10)}/{days[6].slice(5, 7)}/{days[6].slice(0, 4)}
        </h2>
        <span className="text-[13px] text-muted">{items.length} lịch hẹn</span>
      </header>
      <div className="overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7 divide-x divide-line">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            return (
              <div key={d} className="min-h-80">
                <div className={cx('border-b border-line py-3 text-center', d === today && 'bg-brand-50 text-brand-700')}>
                  <p className="text-[13px] text-muted">{weekdayShort(d)}</p>
                  <p className="text-xl font-semibold">{dayOfMonth(d)}</p>
                </div>
                <div className="space-y-2 p-1.5">
                  {list.length === 0 && <p className="py-3 text-center text-[13px] text-faint">Chưa có lịch</p>}
                  {list.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => onSelect(a)}
                      className={cx(
                        'block w-full rounded-lg px-2 py-2 text-left text-[13px] transition hover:brightness-95',
                        CARD_STYLES[a.status],
                        a.id === selectedId && 'ring-2 ring-brand-600',
                      )}
                    >
                      <p className="font-semibold">{timeOf(a.startAt)}</p>
                      <p className="truncate">{a.customer.fullName}</p>
                      <p className="truncate text-[12px] text-muted">
                        {STATUS_LABELS[a.status]} · {a.staff.fullName}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
