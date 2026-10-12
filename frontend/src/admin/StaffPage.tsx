import { Pencil, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useToast } from '../components/toast';
import { Avatar, cx, ErrorBox, Field, Loading, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { Service, Staff, WorkingHour } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { PageHeader } from './AdminLayout';

// Thứ tự hiển thị: Thứ Hai → Chủ nhật
const DAYS = [
  { wd: 1, label: 'Thứ Hai' },
  { wd: 2, label: 'Thứ Ba' },
  { wd: 3, label: 'Thứ Tư' },
  { wd: 4, label: 'Thứ Năm' },
  { wd: 5, label: 'Thứ Sáu' },
  { wd: 6, label: 'Thứ Bảy' },
  { wd: 0, label: 'Chủ nhật' },
];

interface Draft {
  id?: string;
  fullName: string;
  title: string;
  active: boolean;
  serviceIds: string[];
  workingHours: WorkingHour[];
}

function summarizeHours(hours: WorkingHour[] = []): string {
  if (!hours.length) return 'Chưa có lịch làm việc';
  const byTime = new Map<string, string[]>();
  for (const d of DAYS) {
    const h = hours.find((x) => x.weekday === d.wd);
    if (h) byTime.set(`${h.start}–${h.end}`, [...(byTime.get(`${h.start}–${h.end}`) ?? []), d.label]);
  }
  return [...byTime.entries()].map(([t, days]) => `${days.length > 2 ? `${days[0]} – ${days[days.length - 1]}` : days.join(', ')}: ${t}`).join(' · ');
}

export function StaffPage() {
  const toast = useToast();
  const data = useAsync(
    (signal) =>
      Promise.all([api<Staff[]>('/admin/staff', { signal }), api<Service[]>('/admin/services', { signal })]).then(([staff, services]) => ({ staff, services })),
    [],
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const services = data.data?.services ?? [];
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? '';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    const { id, ...body } = draft;
    try {
      await api<Staff>(id ? `/admin/staff/${id}` : '/admin/staff', { method: id ? 'PUT' : 'POST', body });
      toast(id ? 'Đã cập nhật nhân viên.' : 'Đã thêm nhân viên.');
      setDraft(null);
      data.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleDay(wd: number, on: boolean) {
    setDraft((d) =>
      d && {
        ...d,
        workingHours: on
          ? [...d.workingHours, { weekday: wd, start: '09:00', end: '17:00' }]
          : d.workingHours.filter((h) => h.weekday !== wd),
      },
    );
  }

  function setHour(wd: number, key: 'start' | 'end', value: string) {
    setDraft((d) => d && { ...d, workingHours: d.workingHours.map((h) => (h.weekday === wd ? { ...h, [key]: value } : h)) });
  }

  return (
    <>
      <PageHeader
        crumb="Nhân viên"
        title="Nhân viên"
        subtitle="Dịch vụ mỗi người thực hiện và giờ làm trong tuần."
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setError(null);
              setDraft({
                fullName: '',
                title: '',
                active: true,
                serviceIds: [],
                workingHours: [1, 2, 3, 4, 5, 6].map((wd) => ({ weekday: wd, start: '09:00', end: '17:00' })),
              });
            }}
          >
            <Plus className="size-4" /> Thêm nhân viên
          </button>
        }
      />
      <div className={cx('grid gap-5', draft && 'lg:grid-cols-[minmax(0,1fr)_420px]')}>
        <section className="card overflow-hidden">
          {data.error && <div className="p-4"><ErrorBox message={data.error} onRetry={data.reload} /></div>}
          {data.loading && !data.data ? (
            <Loading />
          ) : (
            <ul className="divide-y divide-line">
              {data.data?.staff.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <Avatar name={s.fullName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {s.fullName}
                      {!s.active && <span className="ml-2 rounded-md bg-panel px-2 py-0.5 text-[12px] text-muted">Tạm nghỉ</span>}
                    </p>
                    <p className="text-[13px] text-muted">{s.title}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.serviceIds.map((id) => (
                        <span key={id} className="rounded-md bg-brand-50 px-2 py-0.5 text-[12px] text-brand-700">
                          {serviceName(id)}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-[13px] text-muted">{summarizeHours(s.workingHours)}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-2 text-sm"
                    onClick={() => {
                      setError(null);
                      setDraft({
                        id: s.id,
                        fullName: s.fullName,
                        title: s.title,
                        active: s.active ?? true,
                        serviceIds: [...s.serviceIds],
                        workingHours: [...(s.workingHours ?? [])],
                      });
                    }}
                  >
                    <Pencil className="size-4" /> Sửa
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {draft && (
          <section className="card p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{draft.id ? 'Sửa nhân viên' : 'Thêm nhân viên'}</h2>
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg p-1.5 text-muted hover:bg-canvas" aria-label="Đóng">
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <Field label="Họ tên" htmlFor="st-name">
                <input id="st-name" className="input" required minLength={2} maxLength={100} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
              </Field>
              <Field label="Chức danh" htmlFor="st-title">
                <input id="st-title" className="input" maxLength={100} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <fieldset>
                <legend className="label">Dịch vụ thực hiện</legend>
                <div className="space-y-2">
                  {services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand-600"
                        checked={draft.serviceIds.includes(s.id)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            serviceIds: e.target.checked ? [...draft.serviceIds, s.id] : draft.serviceIds.filter((x) => x !== s.id),
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">Giờ làm việc</legend>
                <div className="space-y-2">
                  {DAYS.map((d) => {
                    const h = draft.workingHours.find((x) => x.weekday === d.wd);
                    return (
                      <div key={d.wd} className="flex items-center gap-2 text-sm">
                        <label className="flex w-28 shrink-0 items-center gap-2">
                          <input type="checkbox" className="size-4 accent-brand-600" checked={!!h} onChange={(e) => toggleDay(d.wd, e.target.checked)} />
                          {d.label}
                        </label>
                        {h ? (
                          <>
                            <input type="time" className="input py-1.5" value={h.start} onChange={(e) => setHour(d.wd, 'start', e.target.value)} aria-label={`${d.label} bắt đầu`} />
                            <span className="text-faint">–</span>
                            <input type="time" className="input py-1.5" value={h.end} onChange={(e) => setHour(d.wd, 'end', e.target.value)} aria-label={`${d.label} kết thúc`} />
                          </>
                        ) : (
                          <span className="text-faint">Nghỉ</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" className="size-4 accent-brand-600" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Đang làm việc (nhận lịch mới)
              </label>
              {error && <ErrorBox message={error} />}
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy && <Spinner className="text-white" />} Lưu nhân viên
              </button>
            </form>
          </section>
        )}
      </div>
    </>
  );
}
