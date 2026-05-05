type ToastType = 'error' | 'success';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (toasts: ToastMessage[]) => void;

let nextId = 0;
let toasts: ToastMessage[] = [];
let listener: Listener | null = null;

function emit() {
  listener?.([...toasts]);
}

export function toast(message: string, type: ToastType = 'error') {
  const id = nextId++;
  toasts = [...toasts, { id, message, type }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4000);
}

export function subscribe(fn: Listener) {
  listener = fn;
  return () => {
    listener = null;
  };
}

export function getToasts() {
  return toasts;
}
