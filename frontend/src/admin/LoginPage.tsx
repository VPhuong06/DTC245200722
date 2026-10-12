import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Logo } from '../components/Logo';
import { ErrorBox, Field, Spinner } from '../components/ui';
import { errorMessage } from '../lib/api';
import { useAuth } from './auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; expired?: boolean } | null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={state?.from ?? '/quan-tri'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(state?.from ?? '/quan-tri', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold">Đăng nhập quản trị</h1>
            <p className="mt-1 text-sm text-muted">Dành cho quản trị viên và nhân viên của cơ sở.</p>
          </div>
          {state?.expired && !error && <ErrorBox message="Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại." />}
          {error && <ErrorBox message={error} />}
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              className="input"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Mật khẩu" htmlFor="password">
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner className="text-white" /> : <LogIn className="size-4" />}
            Đăng nhập
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          <Link to="/" className="font-medium text-brand-700 hover:underline">
            ← Về trang đặt lịch
          </Link>
        </p>
      </div>
    </main>
  );
}
