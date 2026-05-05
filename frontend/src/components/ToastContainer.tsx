import { useEffect, useState } from 'react';
import { subscribe, getToasts } from '@/lib/toast';

interface ToastMessage {
  id: number;
  message: string;
  type: 'error' | 'success';
}

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
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white animate-in slide-in-from-right ${
            t.type === 'error' ? 'bg-red-600' : 'bg-green-600'
          }`}
          role="alert"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
