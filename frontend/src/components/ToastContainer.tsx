import { useEffect, useState } from 'react';
import { subscribe, getToasts, dismissToast, type ToastMessage } from '@/lib/toast';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>(getToasts);

  useEffect(() => {
    return subscribe(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white animate-in slide-in-from-right ${
            t.type === 'error' ? 'bg-red-600' : 'bg-green-600'
          }`}
          role="alert"
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
              className="shrink-0 rounded px-2 py-1 text-xs font-semibold underline underline-offset-2 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
