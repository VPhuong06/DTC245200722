import { CalendarClock, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { useToast } from '../components/toast';
import { ErrorBox, Field, InfoRow, Spinner, StatusBadge } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { addDays, dateOf, formatDate, formatDayTitle, formatPrice, timeOf, vnToday, weekdayOf } from '../lib/time';
import type { Availability, CustomerAppointment } from '../lib/types';
import { formatCode } from './BookingPage';
import { DateStrip, SlotGrid } from './SlotPicker';

type Mode = 'view' | 'reschedule' | 'cancel';

export function LookupPage() {
  const location = useLocation();
  const prefill = location.state as { code?: string; phone?: string } | null;
  const toast = useToast();
  const [code, setCode] = useState(prefill?.code ? formatCode(prefill.code) : '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const [appt, setAppt] = useState<CustomerAppointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('view');

  async function lookup(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAppt(await api<CustomerAppointment>('/appointments/lookup', { method: 'POST', body: { code, phone } }));
      setMode('view');
    } catch (err) {
      setAppt(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (prefill?.code && prefill.phone) void lookup();
    // Chỉ tự tra cứu một lần khi vừa đặt lịch xong chuyển sang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Tra cứu lịch hẹn</h1>
        <p className="mt-1 text-muted">Nhập mã tra cứu nhận được khi đặt lịch và số điện thoại đã dùng.</p>
      </div>

      <form onSubmit={lookup} className="card grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5">
        <Field label="Mã tra cứu" htmlFor="l-code">
          <input
            id="l-code"
            className="input font-mono tracking-wider uppercase"
            required
            minLength={6}
            maxLength={12}
            autoComplete="off"
            placeholder="ABCD-2345"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Field label="Số điện thoại" htmlFor="l-phone">
          <input id="l-phone" className="input" type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : <Search className="size-4" />} Tra cứu
        </button>
      </form>

      {error && <ErrorBox message={error} />}

      {appt && (
        <section className="card space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Lịch hẹn {appt.ref}</p>
              <p className="mt-1 text-xl font-semibold">{appt.customer.fullName}</p>
            </div>
            <StatusBadge status={appt.status} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Dịch vụ">
              {appt.service.name} · {formatPrice(appt.priceVnd)}
            </InfoRow>
            <InfoRow label="Thời gian">
              {formatDate(dateOf(appt.startAt))} · {timeOf(appt.startAt)}–{timeOf(appt.endAt)}
            </InfoRow>
            <InfoRow label="Nhân viên">{appt.staff.fullName}</InfoRow>
            {appt.cancelReason && <InfoRow label="Lý do hủy">{appt.cancelReason}</InfoRow>}
          </div>

          {mode === 'view' && (
            <>
              {appt.canChange ? (
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn-secondary" onClick={() => setMode('reschedule')}>
                    <CalendarClock className="size-4" /> Đổi lịch
                  </button>
                  <button type="button" className="btn-danger" onClick={() => setMode('cancel')}>
                    <X className="size-4" /> Hủy lịch
                  </button>
                </div>
              ) : (
                (appt.status === 'pending' || appt.status === 'confirmed') && (
                  <p className="rounded-xl bg-panel px-4 py-3 text-sm text-muted">
                    Đã quá thời hạn tự đổi/hủy ({timeOf(appt.changeDeadline)} {formatDate(dateOf(appt.changeDeadline))}). Vui lòng liên hệ cơ sở để được hỗ trợ.
                  </p>
                )
              )}
              <div>
                <p className="eyebrow">Lịch sử</p>
                <ol className="mt-2 space-y-1.5 border-l border-line pl-4 text-sm">
                  {appt.events.map((e) => (
                    <li key={e.id}>
                      {e.message} <span className="text-[12px] text-faint">· {timeOf(e.createdAt)} {formatDate(dateOf(e.createdAt))}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          {mode === 'reschedule' && (
            <CustomerReschedule
              appt={appt}
              code={code}
              phone={phone}
              onDone={(updated) => {
                setAppt(updated);
                setMode('view');
                toast(`${updated.ref}: Đã đổi lịch.`);
              }}
              onBack={() => setMode('view')}
            />
          )}

          {mode === 'cancel' && (
            <CustomerCancel
              code={code}
              phone={phone}
              onDone={(updated) => {
                setAppt(updated);
                setMode('view');
                toast(`${updated.ref}: Đã hủy lịch.`);
              }}
              onBack={() => setMode('view')}
            />
          )}
        </section>
      )}
    </div>
  );
}

function CustomerReschedule({
  appt,
  code,
  phone,
  onDone,
  onBack,
}: {
  appt: CustomerAppointment;
  code: string;
  phone: string;
  onDone: (a: CustomerAppointment) => void;
  onBack: () => void;
}) {
  const startDay = vnToday();
  const [date, setDate] = useState(weekdayOf(dateOf(appt.startAt)) === 0 ? addDays(startDay, 1) : dateOf(appt.startAt));
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<{ data?: Availability; loading: boolean; error: string | null }>({ loading: true, error: null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setSlots({ loading: true, error: null });
    api<Availability>('/appointments/lookup/availability', { method: 'POST', body: { code, phone, date } })
      .then((data) => alive && setSlots({ data, loading: false, error: null }))
      .catch((err) => alive && setSlots({ loading: false, error: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [code, phone, date, tick]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api<CustomerAppointment>('/appointments/lookup/reschedule', { method: 'POST', body: { code, phone, date, time } }));
    } catch (err) {
      setError(errorMessage(err));
      setTime('');
      setTick((t) => t + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-line pt-5">
      <p className="font-medium">Chọn thời gian mới · {formatDayTitle(date)}</p>
      <DateStrip value={date} days={30} onChange={(d) => { setDate(d); setTime(''); }} />
      <SlotGrid data={slots.data} loading={slots.loading} error={slots.error} value={time} onPick={setTime} onRetry={() => setTick((t) => t + 1)} />
      {error && <ErrorBox message={error} />}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={!time || busy} onClick={save}>
          {busy && <Spinner className="text-white" />} Lưu lịch mới
        </button>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Quay lại
        </button>
      </div>
    </div>
  );
}

function CustomerCancel({
  code,
  phone,
  onDone,
  onBack,
}: {
  code: string;
  phone: string;
  onDone: (a: CustomerAppointment) => void;
  onBack: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api<CustomerAppointment>('/appointments/lookup/cancel', { method: 'POST', body: { code, phone, reason } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-t border-line pt-5">
      <Field label="Lý do hủy" htmlFor="lc-reason">
        <textarea id="lc-reason" className="input min-h-20" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <ErrorBox message={error} />}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-danger" disabled={busy || reason.trim().length < 3}>
          {busy && <Spinner className="text-rose-700" />} Xác nhận hủy
        </button>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Quay lại
        </button>
      </div>
    </form>
  );
}
