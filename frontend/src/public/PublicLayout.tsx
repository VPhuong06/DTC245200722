import { NavLink, Outlet, Link } from 'react-router';
import { Logo } from '../components/Logo';
import { cx } from '../components/ui';

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" aria-label="Trang đặt lịch">
            <Logo />
          </Link>
          <nav className="flex gap-1 text-sm">
            {[
              { to: '/', label: 'Đặt lịch', end: true },
              { to: '/tra-cuu', label: 'Tra cứu lịch' },
            ].map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => cx('rounded-lg px-3 py-2', isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-muted hover:text-ink')}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-[13px] text-muted">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-between gap-3 px-4">
          <span className="font-semibold text-brand-700">Hẹn · An Nhiên Studio</span>
          <span className="flex gap-4">
            <Link to="/chinh-sach-rieng-tu" className="hover:text-ink">Chính sách quyền riêng tư</Link>
            <Link to="/quan-tri" className="hover:text-ink">Quản trị</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <article className="card space-y-4 p-6 text-[15px] leading-relaxed">
      <h1 className="text-2xl font-semibold">Chính sách quyền riêng tư</h1>
      <p>
        Khi đặt lịch, chúng tôi lưu <strong>họ tên, số điện thoại</strong> và <strong>email</strong> (nếu bạn cung cấp) cùng thông tin lịch hẹn,
        chỉ để xác nhận, nhắc lịch và liên hệ về dịch vụ bạn đã đặt.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Dữ liệu không được bán hay chia sẻ cho bên thứ ba vì mục đích quảng cáo.</li>
        <li>Chỉ quản trị viên và nhân viên phụ trách lịch của bạn mới xem được thông tin.</li>
        <li>Nhật ký hệ thống không ghi số điện thoại hay email đầy đủ.</li>
        <li>Thông tin lịch hẹn được lưu tối đa 24 tháng kể từ lần đặt gần nhất, sau đó được xóa hoặc ẩn danh.</li>
        <li>Bạn có thể yêu cầu xem, sửa hoặc xóa dữ liệu của mình bằng cách liên hệ trực tiếp với cơ sở.</li>
      </ul>
      <p className="text-sm text-muted">
        Chính sách áp dụng theo quy định hiện hành của Việt Nam về bảo vệ dữ liệu cá nhân. Thời điểm bạn đồng ý được ghi nhận cùng hồ sơ khách hàng.
      </p>
    </article>
  );
}
