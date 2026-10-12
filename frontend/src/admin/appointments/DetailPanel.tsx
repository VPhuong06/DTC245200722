import { CalendarClock, Check, CheckCheck, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar, cx, ErrorBox, InfoRow, Loading, Spinner, StatusBadge } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { dateOf, formatDate, formatPrice, timeOf } from '../../lib/time';
import type { AppointmentDetail } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../auth';

type Action = 'confirm' | 'complete' | 'no-show';

export function DetailPanel({
  id,
  refreshKey,
  layout,
  onChanged,
  onReschedule,
  onCancel,
}: {
  id: string;
  refreshKey: number;
  layout: 'side' | 'wide';
  onChanged: (a: AppointmentDetail) => void;
  onReschedule: (a: AppointmentDetail) => void;
  onCancel: (a: AppointmentDetail) => void;
}) {
  const { user } = useAuth();
  const detail = useAsync((signal) => api<AppointmentDetail>(`/admin/appointments/${id}`, { signal }), [id, refreshKey]);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(action);
    setError(null);
    try {
      const updated = await api<AppointmentDetail>(`/admin/appointments/${id}/${action}`, { method: 'POST' });
      detail.setData(updated);
      onChanged(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (detail.loading && !detail.data) return <section className="card"><Loading /></section>;
  if (detail.error || !detail.data) {
    return (
      <section className="card p-5">
        <ErrorBox message={detail.error ?? 'Không tải được lịch hẹn'} onRetry={detail.reload} />
      </section>
    );
  }

  const a = detail.data;
  const isAdmin = user?.role === 'admin';
  const canEdit = isAdmin && (a.status === 'pending' || a.status === 'confirmed');

  const header = (
    <>
      <div className="flex items-center justify-between">
        <p className="eyebrow">Chi tiết lịch hẹn</p>
        <span className="text-[13px] text-muted">{a.ref}</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Avatar name={a.customer.fullName} />
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold">{a.customer.fullName}</p>
          <p className="text-sm text-muted">
            {a.customer.phone}
            {a.customer.email && <span className="hidden sm:inline"> · {a.customer.email}</span>}
          </p>
        </div>
      </div>
      <StatusBadge status={a.status} className="mt-4" />
    </>
  );

  const info = (
    <div className="space-y-3.5">
      <InfoRow label="Dịch vụ">{a.service.name}</InfoRow>
      <InfoRow label="Ngày và thời gian">
        {formatDate(dateOf(a.startAt))}
        <br />
        {timeOf(a.startAt)} – {timeOf(a.endAt)} · {a.durationMin} phút
      </InfoRow>
      <InfoRow label="Nhân viên phụ trách">{a.staff.fullName}</InfoRow>
      <InfoRow label="Giá dịch vụ">{formatPrice(a.priceVnd)}</InfoRow>
      {a.cancelReason && <InfoRow label="Lý do hủy">{a.cancelReason}</InfoRow>}
    </div>
  );

  const note = (
    <div className="rounded-xl bg-panel px-4 py-3">
      <p className="text-[13px] text-faint">Ghi chú khách hàng</p>
      <p className="mt-1 text-[15px]">{a.note || 'Chưa có ghi chú.'}</p>
    </div>
  );

  const actions = (
    <div className="space-y-2.5">
      {error && <ErrorBox message={error} />}
      {a.status === 'pending' && isAdmin && (
        <button type="button" className="btn-primary w-full" disabled={!!busy} onClick={() => run('confirm')}>
          {busy === 'confirm' ? <Spinner className="text-white" /> : <Check className="size-4" />} Xác nhận lịch
        </button>
      )}
      {a.status === 'confirmed' && (
        <button type="button" className="btn-primary w-full" disabled={!!busy} onClick={() => run('complete')}>
          {busy === 'complete' ? <Spinner className="text-white" /> : <CheckCheck className="size-4" />} Đánh dấu hoàn thành
        </button>
      )}
      {canEdit && (
        <>
          <button type="button" className="btn-secondary w-full" disabled={!!busy} onClick={() => onReschedule(a)}>
            <CalendarClock className="size-4" /> Đổi lịch
          </button>
          <button type="button" className="btn-danger w-full" disabled={!!busy} onClick={() => onCancel(a)}>
            <X className="size-4" /> Hủy lịch
          </button>
        </>
      )}
      {a.status === 'confirmed' && (
        <button type="button" className="btn-muted w-full py-2 text-sm" disabled={!!busy} onClick={() => run('no-show')}>
          {busy === 'no-show' && <Spinner />} Khách không đến
        </button>
      )}
    </div>
  );

  const history = (
    <div>
      <p className="eyebrow">Lịch sử thao tác</p>
      <ol className="mt-3 space-y-2.5 border-l border-line pl-4">
        {a.events.map((e) => (
          <li key={e.id} className="text-sm">
            <p>{e.message}</p>
            <p className="text-[12px] text-faint">
              {formatDate(dateOf(e.createdAt))} {timeOf(e.createdAt)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );

  const hasActions = a.status === 'pending' || a.status === 'confirmed';

  if (layout === 'wide') {
    return (
      <section className="card grid gap-6 p-5 md:grid-cols-2">
        <div className="flex flex-col gap-5">
          {header}
          {note}
          <div className="mt-auto">{history}</div>
        </div>
        <div className="space-y-5 md:border-l md:border-line md:pl-6">
          {info}
          {hasActions && <div className="border-t border-line pt-5">{actions}</div>}
        </div>
      </section>
    );
  }

  return (
    <section className={cx('card space-y-5 p-5')}>
      <div className="border-b border-line pb-5">{header}</div>
      <div className="border-b border-line pb-5">{info}</div>
      {note}
      {hasActions && actions}
      {history}
    </section>
  );
}
