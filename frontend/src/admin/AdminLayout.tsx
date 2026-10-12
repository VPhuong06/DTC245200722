import { CalendarDays, Clock3, LogOut, Settings2, Sparkles, SquareUserRound, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Logo } from '../components/Logo';
import { cx } from '../components/ui';
import { useAuth } from './auth';

const NAV = [
  { to: '/quan-tri', label: 'Lịch hẹn', icon: CalendarDays, end: true, adminOnly: false },
  { to: '/quan-tri/khach-hang', label: 'Khách hàng', icon: Users, adminOnly: true },
  { to: '/quan-tri/dich-vu', label: 'Dịch vụ', icon: Sparkles, adminOnly: true },
  { to: '/quan-tri/nhan-vien', label: 'Nhân viên', icon: SquareUserRound, adminOnly: true },
  { to: '/quan-tri/chinh-sach', label: 'Chính sách', icon: Settings2, adminOnly: true },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const items = NAV.filter((n) => !n.adminOnly || user?.role === 'admin');

  return (
    <div className="min-h-dvh lg:flex">
      {/* Thanh bên (máy tính, máy tính bảng ngang) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="px-6 pt-8 pb-10">
          <Logo />
        </div>
        <p className="eyebrow px-6 pb-3">Không gian quản lý</p>
        <nav className="flex flex-col gap-1 px-3" aria-label="Điều hướng quản trị">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition',
                  isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink/80 hover:bg-canvas',
                )
              }
            >
              <n.icon className="size-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-panel text-sm font-semibold">
              {(user?.name ?? 'Quản trị').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="text-[13px] text-muted">{user?.role === 'admin' ? 'Quản lý cơ sở' : 'Nhân viên'}</p>
            </div>
            <button type="button" onClick={logout} className="rounded-lg p-2 text-muted hover:bg-canvas" title="Đăng xuất">
              <LogOut className="size-4" />
              <span className="sr-only">Đăng xuất</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Thanh trên (điện thoại, máy tính bảng dọc) */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo compact />
          <button type="button" onClick={logout} className="btn-secondary px-3 py-2 text-sm">
            <LogOut className="size-4" /> Đăng xuất
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Điều hướng quản trị">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm',
                  isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink/75',
                )
              }
            >
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
        <footer className="mt-8 flex items-center gap-2 text-[13px] text-faint">
          <Clock3 className="size-4" /> Giờ Việt Nam · UTC+7
        </footer>
      </main>
    </div>
  );
}

export function PageHeader({
  crumb,
  title,
  subtitle,
  action,
}: {
  crumb: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <p className="text-[13px] text-muted">
        Không gian quản lý <span className="text-faint">/</span> <span className="text-ink">{crumb}</span>
      </p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
