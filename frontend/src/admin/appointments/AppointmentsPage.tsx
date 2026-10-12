import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useToast } from '../../components/toast';
import { cx, ErrorBox, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { addDays, dateOf, formatDate, startOfWeek, vnToday } from '../../lib/time';
import { STATUS_LABELS, STATUS_ORDER, type AppointmentDetail, type AppointmentList, type Service, type Staff, type Status } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { PageHeader } from '../AdminLayout';
import { useAuth } from '../auth';
import { DetailPanel } from './DetailPanel';
import { CancelForm, CreateForm, RescheduleForm } from './forms';
import { DayView, ListView, WeekView } from './views';

type View = 'list' | 'day' | 'week';
type Panel =
  | { mode: 'detail'; id: string }
  | { mode: 'create' }
  | { mode: 'reschedule'; appointment: AppointmentDetail }
  | { mode: 'cancel'; appointment: AppointmentDetail }
  | null;

const VIEWS: { id: View; label: string }[] = [
  { id: 'list', label: 'Danh sách' },
  { id: 'day', label: 'Ngày' },
  { id: 'week', label: 'Tuần' },
];

/** Hiển thị ngày dạng dd/mm/yyyy (ô date gốc của trình duyệt định dạng theo ngôn ngữ máy), bấm để mở lịch chọn ngày. */
function DateButton({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[15px] tabular-nums hover:bg-canvas">
      {formatDate(value)}
      <CalendarDays className="size-4 text-muted" />
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={() => ref.current?.showPicker?.()}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Chọn ngày"
      />
    </label>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AppointmentsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const date = params.get('ngay') ?? vnToday();
  const view = (params.get('xem') as View) ?? 'list';
  const setParam = (key: string, value: string) =>
    setParams((p) => {
      p.set(key, value);
      return p;
    });

  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [panel, setPanel] = useState<Panel>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const from = view === 'week' ? startOfWeek(date) : date;
  const to = view === 'week' ? addDays(from, 6) : date;

  const catalog = useAsync(
    (signal) =>
      Promise.all([api<Service[]>('/admin/services', { signal }), api<Staff[]>('/admin/staff', { signal })]).then(
        ([services, staff]) => ({ services, staff }),
      ),
    [],
  );

  const list = useAsync(
    (signal) => {
      const qs = new URLSearchParams({ from, to });
      if (query) qs.set('q', query);
      if (serviceId) qs.set('serviceId', serviceId);
      if (staffId) qs.set('staffId', staffId);
      return api<AppointmentList>(`/admin/appointments?${qs}`, { signal });
    },
    [from, to, query, serviceId, staffId, refreshKey],
  );

  const items = useMemo(
    () => (list.data?.items ?? []).filter((a) => status === 'all' || a.status === status),
    [list.data, status],
  );
  // Màn hình rộng ở chế độ danh sách: chọn sẵn một lịch (ưu tiên lịch chờ xác nhận) để bảng chi tiết không trống.
  useEffect(() => {
    if (panel || view !== 'list' || !items.length || window.innerWidth < 1024) return;
    const first = items.find((a) => a.status === 'pending') ?? items[0];
    setPanel({ mode: 'detail', id: first.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, view]);

  const selectedId = panel?.mode === 'detail' ? panel.id : panel && 'appointment' in panel ? panel.appointment.id : undefined;

  function openPanel(next: Panel) {
    setPanel(next);
    if (window.innerWidth < 1024) {
      window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  function afterChange(a: AppointmentDetail, message: string) {
    toast(`${a.ref}: ${message}.`);
    setRefreshKey((k) => k + 1);
    setPanel({ mode: 'detail', id: a.id });
  }

  const services = catalog.data?.services ?? [];
  const staff = catalog.data?.staff ?? [];

  let panelContent: ReactNode = null;
  if (panel?.mode === 'detail') {
    panelContent = (
      <DetailPanel
        id={panel.id}
        refreshKey={refreshKey}
        layout={view === 'list' ? 'side' : 'wide'}
        onChanged={(a) => afterChange(a, STATUS_LABELS[a.status])}
        onReschedule={(a) => openPanel({ mode: 'reschedule', appointment: a })}
        onCancel={(a) => openPanel({ mode: 'cancel', appointment: a })}
      />
    );
  } else if (panel?.mode === 'create' && catalog.data) {
    panelContent = (
      <CreateForm
        services={services}
        staff={staff}
        defaultDate={date}
        onCreated={(a) => {
          afterChange(a, `Đã tạo lịch · ${STATUS_LABELS[a.status]}`);
          setParam('ngay', dateOf(a.startAt));
        }}
        onClose={() => setPanel(null)}
      />
    );
  } else if (panel?.mode === 'reschedule' && catalog.data) {
    panelContent = (
      <RescheduleForm
        appointment={panel.appointment}
        services={services}
        staff={staff}
        onSaved={(a) => afterChange(a, 'Đã đổi lịch')}
        onClose={() => setPanel({ mode: 'detail', id: panel.appointment.id })}
      />
    );
  } else if (panel?.mode === 'cancel') {
    panelContent = (
      <CancelForm
        appointment={panel.appointment}
        onCancelled={(a) => afterChange(a, 'Đã hủy lịch')}
        onClose={() => setPanel({ mode: 'detail', id: panel.appointment.id })}
      />
    );
  }

  const step = view === 'week' ? 7 : 1;
  const counts = list.data?.counts ?? {};
  const sidePanel = view === 'list' || panel?.mode === 'create' || panel?.mode === 'reschedule' || panel?.mode === 'cancel';

  return (
    <>
      <PageHeader
        crumb="Lịch hẹn"
        title="Quản lý lịch hẹn"
        subtitle="Theo dõi lịch và điều phối dịch vụ trong một nơi."
        action={
          user?.role === 'admin' && (
            <button type="button" className="btn-primary" onClick={() => openPanel({ mode: 'create' })}>
              <Plus className="size-4" /> Tạo lịch hẹn
            </button>
          )
        }
      />

      {/* Bộ lọc */}
      <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button type="button" className="rounded-lg p-2 hover:bg-canvas" onClick={() => setParam('ngay', addDays(date, -step))} aria-label="Lùi">
              <ChevronLeft className="size-4" />
            </button>
            <DateButton value={date} onChange={(d) => setParam('ngay', d)} />
            <button type="button" className="rounded-lg p-2 hover:bg-canvas" onClick={() => setParam('ngay', addDays(date, step))} aria-label="Tiến">
              <ChevronRight className="size-4" />
            </button>
            <button type="button" className="btn-muted ml-1 px-3 py-1.5 text-sm whitespace-nowrap" onClick={() => setParam('ngay', vnToday())}>
              Hôm nay
            </button>
          </div>
          <div className="flex rounded-xl bg-panel p-1" role="tablist" aria-label="Kiểu xem">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setParam('xem', v.id)}
                className={cx('rounded-lg px-3.5 py-1.5 text-sm transition', view === v.id ? 'bg-white font-medium shadow-sm' : 'text-muted hover:text-ink')}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
            <input
              type="search"
              className="input pl-10"
              placeholder="Tìm tên, số điện thoại, mã lịch…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Tìm kiếm lịch hẹn"
            />
          </label>
          <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Lọc theo dịch vụ">
            <option value="">Tất cả dịch vụ</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {user?.role === 'admin' ? (
            <select className="input" value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Lọc theo nhân viên">
              <option value="">Tất cả nhân viên</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          ) : (
            <p className="input bg-panel text-muted">Lịch được phân công cho bạn</p>
          )}
        </div>
      </section>

      {/* Lọc trạng thái */}
      <div className="my-5 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Lọc trạng thái">
        {(['all', ...STATUS_ORDER.filter((s) => s !== 'expired' || counts.expired)] as (Status | 'all')[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition',
              status === s ? 'bg-brand-50 font-medium text-brand-700' : 'text-muted hover:bg-white',
            )}
          >
            {s === 'all' ? 'Tất cả' : STATUS_LABELS[s]}
            <span className={cx('rounded-md px-1.5 text-[12px]', status === s ? 'bg-white' : 'bg-panel')}>
              {s === 'all' ? (counts.all ?? 0) : (counts[s] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}

      <div className={cx('grid gap-5', sidePanel && panelContent && 'lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px]')}>
        <div className="min-w-0">
          {list.loading && !list.data ? (
            <section className="card">
              <Loading />
            </section>
          ) : view === 'list' ? (
            <ListView items={items} date={date} selectedId={selectedId} onSelect={(a) => openPanel({ mode: 'detail', id: a.id })} />
          ) : view === 'day' ? (
            <DayView items={items} date={date} selectedId={selectedId} onSelect={(a) => openPanel({ mode: 'detail', id: a.id })} />
          ) : (
            <WeekView items={items} weekStart={from} selectedId={selectedId} onSelect={(a) => openPanel({ mode: 'detail', id: a.id })} />
          )}
        </div>
        {sidePanel && (
          <div ref={panelRef} className="min-w-0 scroll-mt-28">
            {panelContent ?? (view === 'list' && (
              <section className="card hidden p-6 text-center text-sm text-muted lg:block">Chọn một lịch hẹn để xem chi tiết.</section>
            ))}
          </div>
        )}
      </div>
      {!sidePanel && panelContent && (
        <div ref={panelRef} className="mt-5 scroll-mt-28">
          {panelContent}
        </div>
      )}
    </>
  );
}
