import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useToast } from '../components/toast';
import { ErrorBox, Field, Loading, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/time';
import type { Policy, Staff } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { PageHeader } from './AdminLayout';

interface Holiday {
  day: string;
  name: string;
}

interface TimeOff {
  id: string;
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  reason: string;
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  id,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  id: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <input id={id} type="number" className="input" min={min} max={max} required value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function PolicyForm() {
  const toast = useToast();
  const policy = useAsync((signal) => api<Policy>('/admin/policies', { signal }), []);
  const [form, setForm] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (policy.data) setForm(policy.data);
  }, [policy.data]);

  if (policy.loading && !form) return <Loading />;
  if (!form) return <ErrorBox message={policy.error ?? 'Không tải được chính sách'} onRetry={policy.reload} />;
  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setForm({ ...form, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Policy>('/admin/policies', { method: 'PUT', body: form });
      setForm(saved);
      toast('Đã lưu chính sách đặt lịch.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Chính sách đặt lịch</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="p-step" label="Bước khung giờ (phút)" hint="Khoảng cách giữa các giờ bắt đầu." min={5} max={120} value={form.slotStepMin} onChange={(v) => set('slotStepMin', v)} />
        <NumberField id="p-min" label="Đặt trước tối thiểu (phút)" hint="Không cho khách đặt sát giờ." min={0} max={10080} value={form.minAdvanceMin} onChange={(v) => set('minAdvanceMin', v)} />
        <NumberField id="p-max" label="Đặt trước tối đa (ngày)" min={1} max={365} value={form.maxAdvanceDays} onChange={(v) => set('maxAdvanceDays', v)} />
        <NumberField id="p-hold" label="Thời gian giữ chỗ (phút)" hint="Lịch chờ xác nhận quá hạn sẽ tự hết hạn." min={5} max={10080} value={form.holdMin} onChange={(v) => set('holdMin', v)} />
        <NumberField id="p-deadline" label="Hạn tự đổi/hủy (phút trước giờ hẹn)" min={0} max={10080} value={form.changeDeadlineMin} onChange={(v) => set('changeDeadlineMin', v)} />
        <Field label="Nhắc lịch trước (phút)" htmlFor="p-remind" hint="Cách nhau bằng dấu phẩy, ví dụ 1440, 120.">
          <input
            id="p-remind"
            className="input"
            value={(form.reminderOffsetsMin ?? []).join(', ')}
            onChange={(e) =>
              set(
                'reminderOffsetsMin',
                e.target.value
                  .split(',')
                  .map((x) => Number(x.trim()))
                  .filter((x) => Number.isFinite(x) && x > 0),
              )
            }
          />
        </Field>
      </div>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" className="size-4 accent-brand-600" checked={form.autoConfirm} onChange={(e) => set('autoConfirm', e.target.checked)} />
        Tự động xác nhận lịch khách đặt trực tuyến
      </label>
      {error && <ErrorBox message={error} />}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy && <Spinner className="text-white" />} Lưu chính sách
      </button>
    </form>
  );
}

function Holidays() {
  const list = useAsync((signal) => api<Holiday[]>('/admin/holidays', { signal }), []);
  const [day, setDay] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      list.setData(await api<Holiday[]>('/admin/holidays', { method: 'POST', body: { day, name } }));
      setDay('');
      setName('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(d: string) {
    await api(`/admin/holidays/${d}`, { method: 'DELETE' }).catch((err) => setError(errorMessage(err)));
    list.reload();
  }

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Ngày nghỉ của cơ sở</h2>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <Field label="Ngày" htmlFor="h-day">
          <input id="h-day" type="date" className="input" required value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Tên" htmlFor="h-name" className="min-w-40 flex-1">
          <input id="h-name" className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tết Nguyên đán" />
        </Field>
        <button type="submit" className="btn-secondary">
          <Plus className="size-4" /> Thêm
        </button>
      </form>
      {error && <ErrorBox message={error} />}
      <ul className="divide-y divide-line text-sm">
        {list.data?.map((h) => (
          <li key={h.day} className="flex items-center justify-between py-2.5">
            <span>
              <span className="font-medium tabular-nums">{formatDate(h.day)}</span> · {h.name}
            </span>
            <button type="button" onClick={() => remove(h.day)} className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600" aria-label={`Xóa ngày nghỉ ${formatDate(h.day)}`}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {list.data?.length === 0 && <li className="py-2.5 text-faint">Chưa có ngày nghỉ.</li>}
      </ul>
    </section>
  );
}

function TimeOffSection() {
  const data = useAsync(
    (signal) => Promise.all([api<TimeOff[]>('/admin/time-off', { signal }), api<Staff[]>('/admin/staff', { signal })]).then(([items, staff]) => ({ items, staff })),
    [],
  );
  const [form, setForm] = useState({ staffId: '', start: '', end: '', reason: '' });
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // Giá trị datetime-local hiểu theo giờ Việt Nam.
      await api('/admin/time-off', {
        method: 'POST',
        body: { staffId: form.staffId, startAt: `${form.start}:00+07:00`, endAt: `${form.end}:00+07:00`, reason: form.reason },
      });
      setForm({ staffId: '', start: '', end: '', reason: '' });
      data.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(id: string) {
    await api(`/admin/time-off/${id}`, { method: 'DELETE' }).catch((err) => setError(errorMessage(err)));
    data.reload();
  }

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Nghỉ phép, giờ bị chặn của nhân viên</h2>
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nhân viên" htmlFor="t-staff">
          <select id="t-staff" className="input" required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
            <option value="">Chọn nhân viên</option>
            {data.data?.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lý do" htmlFor="t-reason">
          <input id="t-reason" className="input" maxLength={200} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Nghỉ phép" />
        </Field>
        <Field label="Từ" htmlFor="t-start">
          <input id="t-start" type="datetime-local" className="input" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        </Field>
        <Field label="Đến" htmlFor="t-end">
          <input id="t-end" type="datetime-local" className="input" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-secondary">
            <Plus className="size-4" /> Thêm thời gian nghỉ
          </button>
        </div>
      </form>
      {error && <ErrorBox message={error} />}
      <ul className="divide-y divide-line text-sm">
        {data.data?.items.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span className="font-medium">{t.staffName}</span> · {formatDateTime(t.startAt)} → {formatDateTime(t.endAt)}
              {t.reason && <span className="text-muted"> · {t.reason}</span>}
            </span>
            <button type="button" onClick={() => remove(t.id)} className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600" aria-label="Xóa thời gian nghỉ">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {data.data?.items.length === 0 && <li className="py-2.5 text-faint">Chưa có thời gian nghỉ sắp tới.</li>}
      </ul>
    </section>
  );
}

export function PoliciesPage() {
  return (
    <>
      <PageHeader crumb="Chính sách" title="Chính sách và ngày nghỉ" subtitle="Quy tắc tính giờ trống, giữ chỗ, nhắc lịch." />
      <div className="grid gap-5 xl:grid-cols-2">
        <PolicyForm />
        <div className="space-y-5">
          <Holidays />
          <TimeOffSection />
        </div>
      </div>
    </>
  );
}
