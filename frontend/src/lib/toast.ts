type ToastType = 'error' | 'success';

interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  /** Optional action button (e.g. Undo). Rendered inline in ToastContainer. */
  action?: ToastAction;
}

interface ToastOptions {
  action?: ToastAction;
  /** ms before auto-dismiss. Defaults to 4000, or 6000 when an action is present. */
  timeout?: number;
}

type Listener = (toasts: ToastMessage[]) => void;

let nextId = 0;
let toasts: ToastMessage[] = [];
let listener: Listener | null = null;

function emit() {
  listener?.([...toasts]);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(
  message: string,
  type: ToastType = 'error',
  options: ToastOptions = {},
) {
  const id = nextId++;
  toasts = [...toasts, { id, message, type, action: options.action }];
  emit();
  // Action toasts (Undo) live a little longer so there's time to click.
  const timeout = options.timeout ?? (options.action ? 6000 : 4000);
  setTimeout(() => dismissToast(id), timeout);
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
