import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, EmptyState, ErrorBox, Loading } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/time';
import type { Customer } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { PageHeader } from './AdminLayout';

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const list = useAsync(
    (signal) => api<Customer[]>(`/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`, { signal }),
    [query],
  );

  return (
    <>
      <PageHeader crumb="Khách hàng" title="Khách hàng" subtitle="Hồ sơ khách và lịch sử sử dụng dịch vụ." />
      <section className="card overflow-hidden">
        <div className="border-b border-line p-4">
          <label className="relative block max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
            <input
              type="search"
              className="input pl-10"
              placeholder="Tìm tên, số điện thoại, email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Tìm khách hàng"
            />
          </label>
        </div>
        {list.error && (
          <div className="p-4">
            <ErrorBox message={list.error} onRetry={list.reload} />
          </div>
        )}
        {list.loading && !list.data ? (
          <Loading />
        ) : !list.data?.length ? (
          <EmptyState title="Chưa có khách hàng phù hợp" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-canvas text-[13px] text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Khách hàng</th>
                  <th className="px-5 py-3 font-medium">Liên hệ</th>
                  <th className="px-5 py-3 text-right font-medium">Tổng lịch</th>
                  <th className="px-5 py-3 text-right font-medium">Hoàn thành</th>
                  <th className="px-5 py-3 text-right font-medium">Không đến</th>
                  <th className="px-5 py-3 text-right font-medium">Đã hủy</th>
                  <th className="px-5 py-3 font-medium">Lịch gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.fullName} size="sm" />
                        <span className="font-medium">{c.fullName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p>{c.phone}</p>
                      {c.email && <p className="text-[13px] text-faint">{c.email}</p>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{c.totalAppointments}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{c.completed}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{c.noShow}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{c.cancelled}</td>
                    <td className="px-5 py-3 text-muted">{c.lastAppointmentAt ? formatDateTime(c.lastAppointmentAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
