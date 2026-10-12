import { CheckCircle2, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className={cx(
              'pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg',
              toast.tone === 'success' ? 'border-brand-100 bg-brand-50 text-brand-800' : 'border-rose-100 bg-rose-50 text-rose-800',
            )}
            role="status"
          >
            {toast.tone === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
            <span className="flex-1">{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo" className="opacity-60 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
