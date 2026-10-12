import { Pencil, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useToast } from '../components/toast';
import { cx, ErrorBox, Field, Loading, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { formatDuration, formatPrice } from '../lib/time';
import type { Service } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { PageHeader } from './AdminLayout';

type Draft = Omit<Service, 'id'> & { id?: string };

const EMPTY: Draft = { name: '', description: '', durationMin: 30, bufferMin: 0, priceVnd: 0, active: true };

export function ServicesPage() {
  const toast = useToast();
  const list = useAsync((signal) => api<Service[]>('/admin/services', { signal }), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    const { id, ...body } = draft;
    try {
      await api<Service>(id ? `/admin/services/${id}` : '/admin/services', { method: id ? 'PUT' : 'POST', body });
      toast(id ? 'Đã cập nhật dịch vụ.' : 'Đã thêm dịch vụ.');
      setDraft(null);
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      <PageHeader
        crumb="Dịch vụ"
        title="Dịch vụ"
        subtitle="Thời lượng và thời gian chuẩn bị quyết định khung giờ trống."
        action={
          <button type="button" className="btn-primary" onClick={() => { setError(null); setDraft({ ...EMPTY }); }}>
            <Plus className="size-4" /> Thêm dịch vụ
          </button>
        }
      />
      <div className={cx('grid gap-5', draft && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
        <section className="card overflow-hidden">
          {list.error && <div className="p-4"><ErrorBox message={list.error} onRetry={list.reload} /></div>}
          {list.loading && !list.data ? (
            <Loading />
          ) : (
            <ul className="divide-y divide-line">
              {list.data?.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {s.name}
                      {!s.active && <span className="ml-2 rounded-md bg-panel px-2 py-0.5 text-[12px] text-muted">Tạm ngưng</span>}
                    </p>
                    <p className="text-[13px] text-muted">{s.description}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p>{formatDuration(s.durationMin)}{s.bufferMin ? ` + ${s.bufferMin} phút chuẩn bị` : ''}</p>
                    <p className="text-muted">{formatPrice(s.priceVnd)}</p>
                  </div>
                  <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={() => { setError(null); setDraft({ ...s }); }}>
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
              <h2 className="text-xl font-semibold">{draft.id ? 'Sửa dịch vụ' : 'Thêm dịch vụ'}</h2>
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg p-1.5 text-muted hover:bg-canvas" aria-label="Đóng">
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <Field label="Tên dịch vụ" htmlFor="s-name">
                <input id="s-name" className="input" required minLength={2} maxLength={100} value={draft.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Mô tả" htmlFor="s-desc">
                <textarea id="s-desc" className="input min-h-20" maxLength={500} value={draft.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Thời lượng (phút)" htmlFor="s-dur">
                  <input id="s-dur" type="number" className="input" min={5} max={480} step={5} required value={draft.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} />
                </Field>
                <Field label="Chuẩn bị (phút)" htmlFor="s-buf">
                  <input id="s-buf" type="number" className="input" min={0} max={120} step={5} required value={draft.bufferMin} onChange={(e) => set('bufferMin', Number(e.target.value))} />
                </Field>
              </div>
              <Field label="Giá (đồng)" htmlFor="s-price" hint="Nhập 0 nếu miễn phí.">
                <input id="s-price" type="number" className="input" min={0} step={1000} required value={draft.priceVnd} onChange={(e) => set('priceVnd', Number(e.target.value))} />
              </Field>
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" className="size-4 accent-brand-600" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
                Đang nhận đặt lịch
              </label>
              {error && <ErrorBox message={error} />}
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy && <Spinner className="text-white" />} Lưu dịch vụ
              </button>
            </form>
          </section>
        )}
      </div>
    </>
  );
}
