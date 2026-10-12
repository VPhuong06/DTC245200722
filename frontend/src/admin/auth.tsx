import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Loading } from '../components/ui';
import { api, setUnauthorizedHandler } from '../lib/api';
import type { SessionUser } from '../lib/types';

interface AuthState {
  user: SessionUser | null;
  checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api<{ user: SessionUser }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    // Phiên hết hạn ở bất kỳ request nào → về trang đăng nhập, giữ lại trang đang xem.
    setUnauthorizedHandler(() => {
      setUser(null);
      navigate('/quan-tri/dang-nhap', { replace: true, state: { from: location.pathname, expired: true } });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, location.pathname]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: SessionUser }>('/auth/login', { method: 'POST', body: { email, password } });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    navigate('/quan-tri/dang-nhap', { replace: true });
  }, [navigate]);

  return <AuthContext.Provider value={{ user, checking, login, logout }}>{children}</AuthContext.Provider>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <Loading label="Đang kiểm tra phiên đăng nhập…" />;
  if (!user) return <Navigate to="/quan-tri/dang-nhap" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
