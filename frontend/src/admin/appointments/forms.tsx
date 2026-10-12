import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { cx, ErrorBox, Field, Spinner } from '../../components/ui';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../../lib/api';
import { dateOf, formatDuration, timeOf, vnToday, weekdayOf } from '../../lib/time';
import type { AppointmentDetail, Availability, Service, Staff } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

function PanelShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink/90">{title}</h2>
          {subtitle && <p className="mt-3 text-[15px]">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas" aria-label="Đóng">
          <X className="size-5" />
        </button>
      </div>
      {children}
    </section>
  );
}

/** "Giờ làm việc: 09:00–17:00" theo nhân viên (hoặc mọi nhân viên làm được dịch vụ) trong ngày đã chọn. */
function workingHoursHint(staff: Staff[], serviceId: string, staffId: string, date: string): string {
  const wd = weekdayOf(date);
  const people = staffId ? staff.filter((s) => s.id === staffId) : staff.filter((s) => s.serviceIds.includes(serviceId));
  const windows = people.flatMap((s) => (s.workingHours ?? []).filter((h) => h.weekday === wd));
  if (!windows.length) return 'Không có ca làm vào ngày này.';
  const start = windows.reduce((m, h) => (h.start < m ? h.start : m), windows[0].start);
  const end = windows.reduce((m, h) => (h.end > m ? h.end : m), windows[0].end);
  return `Giờ làm việc: ${start}–${end}. Thời lượng theo dịch vụ.`;
}

function SlotPicker({
  serviceId,
  staffId,
  date,
  excludeAppointmentId,
  value,
  onPick,
}: {
  serviceId: string;
  staffId: string;
  date: string;
  excludeAppointmentId?: string;
  value: string;
  onPick: (time: string) => void;
}) {
  const slots = useAsync(
    (signal) => {
      const qs = new URLSearchParams({ serviceId, date });
      if (staffId) qs.set('staffId', staffId);
      if (excludeAppointmentId) qs.set('excludeAppointmentId', excludeAppointmentId);
      return api<Availability>(`/admin/availability?${qs}`, { signal });
    },
    [serviceId, staffId, date, excludeAppointmentId],
  );
  if (!serviceId || !date) return null;
  return (
    <div>
      <p className="mb-2 text-[13px] text-muted">Giờ còn trống</p>
      {slots.loading ? (
        <Spinner className="size-4" />
      ) : slots.error ? (
        <p className="text-[13px] text-rose-600">{slots.error}</p>
      ) : !slots.data?.slots.length ? (
        <p className="text-[13px] text-faint">{slots.data?.message ?? 'Không còn giờ trống.'}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {slots.data.slots.map((s) => (
            <button
              type="button"
              key={s.time}
              onClick={() => onPick(s.time)}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-[13px] tabular-nums transition',
                s.time === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:border-brand-500',
              )}
            >
              {s.time}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceSelect({ services, value, onChange, id }: { services: Service[]; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} required>
      {services
        .filter((s) => s.active || s.id === value)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {formatDuration(s.durationMin)}
          </option>
        ))}
    </select>
  );
}

function StaffSelect({
  staff,
  serviceId,
  value,
  onChange,
  allowAny,
  id,
}: {
  staff: Staff[];
  serviceId: string;
  value: string;
  onChange: (v: string) => void;
  allowAny: boolean;
  id: string;
}) {
  const options = staff.filter((s) => (s.active ?? true) && s.serviceIds.includes(serviceId));
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} required={!allowAny}>
      {allowAny && <option value="">Nhân viên bất kỳ</option>}
      {!allowAny && !options.some((s) => s.id === value) && <option value="">Chọn nhân viên</option>}
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.fullName}
        </option>
      ))}
    </select>
  );
}

// ------------------------------------------------------------------ Tạo lịch

export function CreateForm({
  services,
  staff,
  defaultDate,
  onCreated,
  onClose,
}: {
  services: Service[];
  staff: Staff[];
  defaultDate: string;
  onCreated: (a: AppointmentDetail) => void;
  onClose: () => void;
}) {
  const firstService = services.find((s) => s.active)?.id ?? '';
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    serviceId: firstService,
    staffId: '',
    date: defaultDate < vnToday() ? vnToday() : defaultDate,
    time: '',
    note: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Cùng nội dung → cùng khóa (thử lại an toàn); nội dung đổi → khóa mới.
  const keyRef = useRef(newIdempotencyKey());
  const formJson = JSON.stringify(form);
  useEffect(() => {
    keyRef.current = newIdempotencyKey();
  }, [formJson]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    // Đổi dịch vụ: bỏ nhân viên không làm được dịch vụ đó.
    const s = staff.find((x) => x.id === form.staffId);
    if (s && !s.serviceIds.includes(form.serviceId)) set('staffId', '');
  }, [form.serviceId, form.staffId, staff]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<AppointmentDetail>('/admin/appointments', {
        method: 'POST',
        idempotencyKey: keyRef.current,
        body: {
          customer: { fullName: form.fullName, phone: form.phone, email: form.email || null },
          serviceId: form.serviceId,
          staffId: form.staffId || null,
          date: form.date,
          time: form.time,
          note: form.note,
        },
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell title="Tạo lịch hẹn" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Họ tên khách hàng" htmlFor="c-name">
          <input id="c-name" className="input" required minLength={2} maxLength={100} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label="Số điện thoại" htmlFor="c-phone">
          <input id="c-phone" className="input" required inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="09xxxxxxxx" />
        </Field>
        <Field label="Email (không bắt buộc)" htmlFor="c-email" hint="Dùng để gửi xác nhận và nhắc lịch.">
          <input id="c-email" type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Dịch vụ" htmlFor="c-service">
          <ServiceSelect id="c-service" services={services} value={form.serviceId} onChange={(v) => set('serviceId', v)} />
        </Field>
        <Field label="Nhân viên" htmlFor="c-staff">
          <StaffSelect id="c-staff" staff={staff} serviceId={form.serviceId} value={form.staffId} onChange={(v) => set('staffId', v)} allowAny />
        </Field>
        <Field label="Ngày hẹn" htmlFor="c-date">
          <input id="c-date" type="date" className="input" required min={vnToday()} value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Giờ bắt đầu" htmlFor="c-time" hint={workingHoursHint(staff, form.serviceId, form.staffId, form.date)}>
          <input id="c-time" type="time" className="input" required step={300} value={form.time} onChange={(e) => set('time', e.target.value)} />
        </Field>
        <SlotPicker serviceId={form.serviceId} staffId={form.staffId} date={form.date} value={form.time} onPick={(t) => set('time', t)} />
        {error && <ErrorBox message={error} />}
        <Field label="Ghi chú" htmlFor="c-note">
          <textarea id="c-note" className="input min-h-20" maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        <div className="space-y-2.5 pt-1">
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner className="text-white" />} Tạo lịch · Chờ xác nhận
          </button>
          <button type="button" className="btn-secondary w-full" onClick={onClose}>
            Quay lại
          </button>
        </div>
      </form>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ Đổi lịch

export function RescheduleForm({
  appointment,
  services,
  staff,
  onSaved,
  onClose,
}: {
  appointment: AppointmentDetail;
  services: Service[];
  staff: Staff[];
  onSaved: (a: AppointmentDetail) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    serviceId: appointment.service.id,
    staffId: appointment.staff.id,
    date: dateOf(appointment.startAt),
    time: timeOf(appointment.startAt),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setError(null);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const unchanged = useMemo(
    () =>
      form.serviceId === appointment.service.id &&
      form.staffId === appointment.staff.id &&
      form.date === dateOf(appointment.startAt) &&
      form.time === timeOf(appointment.startAt),
    [form, appointment],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api<AppointmentDetail>(`/admin/appointments/${appointment.id}/reschedule`, {
        method: 'POST',
        body: form,
      });
      onSaved(saved);
    } catch (err) {
      // Xung đột giờ: giữ nguyên form để chọn giờ hoặc nhân viên khác.
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell title="Đổi lịch hẹn" subtitle={`${appointment.customer.fullName} · ${appointment.ref}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Dịch vụ" htmlFor="r-service">
          <ServiceSelect id="r-service" services={services} value={form.serviceId} onChange={(v) => set('serviceId', v)} />
        </Field>
        <Field label="Nhân viên" htmlFor="r-staff">
          <StaffSelect id="r-staff" staff={staff} serviceId={form.serviceId} value={form.staffId} onChange={(v) => set('staffId', v)} allowAny={false} />
        </Field>
        <Field label="Ngày hẹn" htmlFor="r-date">
          <input id="r-date" type="date" className="input" required min={vnToday()} value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Giờ bắt đầu" htmlFor="r-time" hint={workingHoursHint(staff, form.serviceId, form.staffId, form.date)}>
          <input id="r-time" type="time" className="input" required step={300} value={form.time} onChange={(e) => set('time', e.target.value)} />
        </Field>
        {form.staffId && (
          <SlotPicker
            serviceId={form.serviceId}
            staffId={form.staffId}
            date={form.date}
            excludeAppointmentId={appointment.id}
            value={form.time}
            onPick={(t) => set('time', t)}
          />
        )}
        {error && <ErrorBox message={error} />}
        <div className="space-y-2.5 pt-1">
          <button type="submit" className="btn-primary w-full" disabled={busy || unchanged || !form.staffId}>
            {busy && <Spinner className="text-white" />} Lưu lịch mới
          </button>
          <button type="button" className="btn-secondary w-full" onClick={onClose}>
            Quay lại
          </button>
        </div>
      </form>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ Hủy lịch

export function CancelForm({
  appointment,
  onCancelled,
  onClose,
}: {
  appointment: AppointmentDetail;
  onCancelled: (a: AppointmentDetail) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api<AppointmentDetail>(`/admin/appointments/${appointment.id}/cancel`, {
        method: 'POST',
        body: { reason },
      });
      onCancelled(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const start = appointment.startAt;
  return (
    <PanelShell
      title="Hủy lịch hẹn"
      subtitle={`${appointment.customer.fullName} · ${dateOf(start).split('-').reverse().join('/')} · ${timeOf(start)}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Lý do hủy" htmlFor="cancel-reason">
          <textarea
            id="cancel-reason"
            className="input min-h-24"
            required
            minLength={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: Khách có việc đột xuất, sẽ đặt lại lịch vào ngày khác."
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="space-y-2.5">
          <button type="submit" className="btn-danger w-full" disabled={busy || reason.trim().length < 3}>
            {busy && <Spinner className="text-rose-700" />} Xác nhận hủy
          </button>
          <button type="button" className="btn-secondary w-full" onClick={onClose}>
            Quay lại
          </button>
        </div>
      </form>
    </PanelShell>
  );
}

