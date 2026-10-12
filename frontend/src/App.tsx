import { Link, Outlet, Route, Routes } from 'react-router';
import { AdminLayout } from './admin/AdminLayout';
import { AppointmentsPage } from './admin/appointments/AppointmentsPage';
import { AuthProvider, RequireAuth } from './admin/auth';
import { CustomersPage } from './admin/CustomersPage';
import { LoginPage } from './admin/LoginPage';
import { PoliciesPage } from './admin/PoliciesPage';
import { ServicesPage } from './admin/ServicesPage';
import { StaffPage } from './admin/StaffPage';
import { BookingPage } from './public/BookingPage';
import { LookupPage } from './public/LookupPage';
import { PrivacyPage, PublicLayout } from './public/PublicLayout';

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-light text-faint">404</p>
      <p className="mt-2 text-muted">Không tìm thấy trang.</p>
      <Link to="/" className="btn-primary mt-6">
        Về trang đặt lịch
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<BookingPage />} />
        <Route path="tra-cuu" element={<LookupPage />} />
        <Route path="chinh-sach-rieng-tu" element={<PrivacyPage />} />
      </Route>
      <Route
        path="quan-tri"
        element={
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        }
      >
        <Route path="dang-nhap" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AppointmentsPage />} />
          <Route path="khach-hang" element={<CustomersPage />} />
          <Route path="dich-vu" element={<ServicesPage />} />
          <Route path="nhan-vien" element={<StaffPage />} />
          <Route path="chinh-sach" element={<PoliciesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
