import { ArrowLeft, ArrowRight, CalendarCheck, Clock, Copy, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { cx, ErrorBox, Field, InfoRow, Loading, Spinner, StatusBadge, StepBar } from '../components/ui';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../lib/api';
import { addDays, dateOf, formatDate, formatDayTitle, formatDuration, formatPrice, timeOf, vnToday, weekdayOf } from '../lib/time';
import type { Appointment, Availability, Policy, Service, Staff } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { DateStrip, SlotGrid } from './SlotPicker';

const STEPS = ['Dịch vụ', 'Thời gian', 'Thông tin', 'Xác nhận'];

export function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function firstOpenDay(): string {
  const d = vnToday();
  return weekdayOf(d) === 0 ? addDays(d, 1) : d;
}

export function BookingPage() {
  const catalog = useAsync(
    (signal) =>
      Promise.all([
        api<Service[]>('/services', { signal }),
        api<Staff[]>('/staff', { signal }),
        api<Policy>('/policies', { signal }),
      ]).then(([services, staff, policy]) => ({ services, staff, policy })),
    [],
  );

  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(firstOpenDay());
  const [time, setTime] = useState('');
  const [info, setInfo] = useState({ fullName: '', phone: '', email: '', note: '', consent: false });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Appointment | null>(null);
  const [slotsTick, setSlotsTick] = useState(0);

  const service = catalog.data?.services.find((s) => s.id === serviceId);
  const staffForService = useMemo(() => catalog.data?.staff.filter((s) => s.serviceIds.includes(serviceId)) ?? [], [catalog.data, serviceId]);
  const staff = staffForService.find((s) => s.id === staffId);

  const slots = useAsync(
    (signal) => {
      if (!serviceId || step !== 1) return Promise.resolve(undefined as Availability | undefined);
      const qs = new URLSearchParams({ serviceId, date });
      if (staffId) qs.set('staffId', staffId);
      return api<Availability>(`/availability?${qs}`, { signal });
    },
    [serviceId, staffId, date, step, slotsTick],
  );

  // Khóa idempotency gắn với nội dung yêu cầu: bấm gửi lại (mạng lỗi) dùng lại khóa cũ, đổi nội dung thì tạo khóa mới.
  const payload = useMemo(
    () => ({
      customer: { fullName: info.fullName.trim(), phone: info.phone.trim(), email: info.email.trim() || null },
      serviceId,
      staffId: staffId || null,
      date,
      time,
      note: info.note.trim(),
      consent: info.consent,
    }),
    [info, serviceId, staffId, date, time],
  );
  const keyRef = useRef(newIdempotencyKey());
  const payloadJson = JSON.stringify(payload);
  useEffect(() => {
    keyRef.current = newIdempotencyKey();
  }, [payloadJson]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, result]);

  if (catalog.loading && !catalog.data) return <Loading />;
  if (catalog.error || !catalog.data) return <ErrorBox message={catalog.error ?? 'Không tải được dữ liệu'} onRetry={catalog.reload} />;

  async function submit() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await api<Appointment>('/appointments', { method: 'POST', body: payload, idempotencyKey: keyRef.current });
      setResult(created);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.code === 'TOO_SOON' || err.code === 'OUTSIDE_WORKING_HOURS')) {
        // Giờ vừa bị người khác đặt: giữ thông tin khách, quay lại chọn giờ khác.
        setTime('');
        setStep(1);
        setSlotsTick((t) => t + 1);
      }
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setResult(null);
    setStep(0);
    setTime('');
    setError(null);
    setInfo((i) => ({ ...i, note: '' }));
  }

  if (result) return <BookingResult appointment={result} policy={catalog.data.policy} onNew={reset} />;

  const { policy } = catalog.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Đặt lịch hẹn</h1>
        <p className="mt-1 text-muted">Chọn dịch vụ và giờ phù hợp, không cần tạo tài khoản.</p>
      </div>
      <StepBar steps={STEPS} current={step} />
      {error && <ErrorBox message={error} />}

      {step === 0 && (
        <section className="space-y-5">
          <div className="space-y-2.5" role="radiogroup" aria-label="Chọn dịch vụ">
            {catalog.data.services.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === serviceId}
                onClick={() => {
                  setServiceId(s.id);
                  if (staffId && !catalog.data!.staff.find((x) => x.id === staffId)?.serviceIds.includes(s.id)) setStaffId('');
                  setTime('');
                }}
                className={cx(
                  'card flex w-full items-start gap-4 p-4 text-left transition',
                  s.id === serviceId ? 'border-brand-600 ring-2 ring-brand-100' : 'hover:border-brand-200',
                )}
              >
                <span className={cx('mt-1 size-4 shrink-0 rounded-full border-2', s.id === serviceId ? 'border-brand-600 bg-brand-600 ring-2 ring-white ring-inset' : 'border-line')} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.name}</span>
                  <span className="mt-0.5 block text-sm text-muted">{s.description}</span>
                </span>
                <span className="shrink-0 text-right text-sm">
                  <span className="block font-medium">{formatPrice(s.priceVnd)}</span>
                  <span className="flex items-center justify-end gap-1 text-muted">
                    <Clock className="size-3.5" /> {formatDuration(s.durationMin)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {serviceId && (
            <Field label="Nhân viên" htmlFor="b-staff">
              <select id="b-staff" className="input" value={staffId} onChange={(e) => { setStaffId(e.target.value); setTime(''); }}>
                <option value="">Nhân viên bất kỳ (gợi ý người còn trống)</option>
                {staffForService.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} · {s.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex justify-end">
            <button type="button" className="btn-primary" disabled={!serviceId} onClick={() => { setError(null); setStep(1); }}>
              Chọn thời gian <ArrowRight className="size-4" />
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <div className="card space-y-4 p-4 sm:p-5">
            <p className="font-medium">{formatDayTitle(date)}</p>
            <DateStrip value={date} days={policy.maxAdvanceDays} onChange={(d) => { setDate(d); setTime(''); setError(null); }} />
            <SlotGrid data={slots.data} loading={slots.loading} error={slots.error} value={time} onPick={setTime} onRetry={slots.reload} />
            <p className="text-[13px] text-faint">
              Nhận đặt trước tối thiểu {formatDuration(policy.minAdvanceMin)}, tối đa {policy.maxAdvanceDays} ngày. Giờ theo múi giờ Việt Nam.
            </p>
          </div>
          <div className="flex justify-between">
            <button type="button" className="btn-secondary" onClick={() => setStep(0)}>
              <ArrowLeft className="size-4" /> Quay lại
            </button>
            <button type="button" className="btn-primary" disabled={!time} onClick={() => { setError(null); setStep(2); }}>
              Nhập thông tin <ArrowRight className="size-4" />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <CustomerForm
          value={info}
          onChange={setInfo}
          onBack={() => setStep(1)}
          onNext={() => {
            setError(null);
            setStep(3);
          }}
        />
      )}

      {step === 3 && service && (
        <section className="space-y-5">
          <div className="card grid gap-4 p-5 sm:grid-cols-2">
            <InfoRow label="Dịch vụ">
              {service.name} · {formatPrice(service.priceVnd)}
            </InfoRow>
            <InfoRow label="Thời gian">
              {formatDate(date)} · {time} ({formatDuration(service.durationMin)})
            </InfoRow>
            <InfoRow label="Nhân viên">{staff?.fullName ?? 'Nhân viên bất kỳ'}</InfoRow>
            <InfoRow label="Khách hàng">
              {info.fullName} · {info.phone}
              {info.email && <span className="block text-sm text-muted">{info.email}</span>}
            </InfoRow>
            {info.note && (
              <div className="sm:col-span-2">
                <InfoRow label="Ghi chú">{info.note}</InfoRow>
              </div>
            )}
          </div>
          <p className="text-sm text-muted">
            {policy.autoConfirm
              ? 'Lịch sẽ được xác nhận ngay sau khi gửi.'
              : `Cơ sở sẽ xác nhận lịch; yêu cầu được giữ chỗ trong ${formatDuration(policy.holdMin)}.`}{' '}
            Bạn có thể tự đổi hoặc hủy trước giờ hẹn {formatDuration(policy.changeDeadlineMin)}.
          </p>
          <div className="flex justify-between">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)} disabled={sending}>
              <ArrowLeft className="size-4" /> Sửa thông tin
            </button>
            <button type="button" className="btn-primary" onClick={submit} disabled={sending}>
              {sending ? <Spinner className="text-white" /> : <Send className="size-4" />}
              {sending ? 'Đang gửi…' : 'Gửi yêu cầu đặt lịch'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export function CustomerForm({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: { fullName: string; phone: string; email: string; note: string; consent: boolean };
  onChange: (v: { fullName: string; phone: string; email: string; note: string; consent: boolean }) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const phone = value.phone.replace(/[\s.-]/g, '').replace(/^\+84/, '0');
  const errors = {
    fullName: value.fullName.trim().length < 2 ? 'Vui lòng nhập họ tên' : undefined,
    phone: !/^0\d{9}$/.test(phone) ? 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0' : undefined,
    email: value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ? 'Email không hợp lệ' : undefined,
    consent: !value.consent ? 'Vui lòng đồng ý để tiếp tục' : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (valid) onNext();
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="card space-y-4 p-4 sm:p-5">
        <Field label="Họ và tên" htmlFor="b-name" error={touched ? errors.fullName : undefined}>
          <input id="b-name" className="input" autoComplete="name" maxLength={100} value={value.fullName} onChange={(e) => onChange({ ...value, fullName: e.target.value })} />
        </Field>
        <Field label="Số điện thoại" htmlFor="b-phone" error={touched ? errors.phone : undefined} hint="Dùng để tra cứu, đổi hoặc hủy lịch.">
          <input id="b-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
        </Field>
        <Field label="Email (không bắt buộc)" htmlFor="b-email" error={touched ? errors.email : undefined} hint="Nhận email xác nhận và nhắc lịch.">
          <input id="b-email" className="input" type="email" autoComplete="email" maxLength={200} value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
        </Field>
        <Field label="Ghi chú cho cơ sở" htmlFor="b-note">
          <textarea id="b-note" className="input min-h-20" maxLength={500} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} />
        </Field>
        <div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={value.consent} onChange={(e) => onChange({ ...value, consent: e.target.checked })} />
            <span>
              Tôi đồng ý để cơ sở lưu thông tin liên hệ nhằm xác nhận và nhắc lịch theo{' '}
              <Link to="/chinh-sach-rieng-tu" target="_blank" className="font-medium text-brand-700 underline underline-offset-2">
                chính sách quyền riêng tư
              </Link>
              .
            </span>
          </label>
          {touched && errors.consent && <p className="mt-1.5 text-[13px] text-rose-600">{errors.consent}</p>}
        </div>
      </div>
      <div className="flex justify-between">
        <button type="button" className="btn-secondary" onClick={onBack}>
          <ArrowLeft className="size-4" /> Quay lại
        </button>
        <button type="submit" className="btn-primary">
          Xem lại <ArrowRight className="size-4" />
        </button>
      </div>
    </form>
  );
}

function BookingResult({ appointment: a, policy, onNew }: { appointment: Appointment; policy: Policy; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  const deadline = new Date(new Date(a.startAt).getTime() - policy.changeDeadlineMin * 60_000).toISOString();

  return (
    <section className="space-y-5">
      <div className="card space-y-5 p-6 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <CalendarCheck className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">{a.status === 'confirmed' ? 'Đặt lịch thành công' : 'Đã gửi yêu cầu đặt lịch'}</h1>
          <p className="mt-1 text-muted">
            {a.status === 'confirmed'
              ? 'Lịch của bạn đã được xác nhận.'
              : `Cơ sở sẽ xác nhận lịch sớm${a.holdExpiresAt ? `, giữ chỗ đến ${timeOf(a.holdExpiresAt)} ${formatDate(dateOf(a.holdExpiresAt))}` : ''}.`}
          </p>
        </div>
        <StatusBadge status={a.status} className="mx-auto" />
        <div className="rounded-xl bg-panel px-4 py-4">
          <p className="text-[13px] text-muted">Mã tra cứu (dùng kèm số điện thoại)</p>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-widest">{formatCode(a.lookupCode)}</p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700"
            onClick={() => {
              navigator.clipboard?.writeText(formatCode(a.lookupCode)).then(() => setCopied(true));
            }}
          >
            <Copy className="size-3.5" /> {copied ? 'Đã sao chép' : 'Sao chép mã'}
          </button>
        </div>
        <div className="grid gap-4 text-left sm:grid-cols-2">
          <InfoRow label="Mã lịch">{a.ref}</InfoRow>
          <InfoRow label="Dịch vụ">{a.service.name}</InfoRow>
          <InfoRow label="Thời gian">
            {formatDate(dateOf(a.startAt))} · {timeOf(a.startAt)}–{timeOf(a.endAt)}
          </InfoRow>
          <InfoRow label="Nhân viên">{a.staff.fullName}</InfoRow>
        </div>
        <p className="text-sm text-muted">
          Tự đổi hoặc hủy lịch trước {timeOf(deadline)} ngày {formatDate(dateOf(deadline))} tại trang Tra cứu lịch. Vui lòng lưu lại mã tra cứu.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/tra-cuu" state={{ code: a.lookupCode, phone: a.customer.phone }} className="btn-secondary">
          Tra cứu lịch
        </Link>
        <button type="button" className="btn-primary" onClick={onNew}>
          Đặt lịch khác
        </button>
      </div>
    </section>
  );
}
