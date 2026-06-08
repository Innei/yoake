import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  action?: { label: string; onClick: () => void };
  description?: string;
  durationMs: number;
  id: number;
  kind: ToastKind;
  title: string;
}

interface ToastState {
  dismiss: (id: number) => void;
  push: (toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => number;
  toasts: Toast[];
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (input) => {
    seq += 1;
    const id = seq;
    const toast: Toast = {
      durationMs: 4500,
      ...input,
      id,
    };
    set({ toasts: [...get().toasts, toast] });
    if (toast.durationMs > 0) {
      setTimeout(() => get().dismiss(id), toast.durationMs);
    }
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (title: string, opts?: Partial<Omit<Toast, 'id' | 'kind' | 'title'>>) =>
    useToastStore.getState().push({ kind: 'info', title, ...opts }),
  success: (title: string, opts?: Partial<Omit<Toast, 'id' | 'kind' | 'title'>>) =>
    useToastStore.getState().push({ kind: 'success', title, ...opts }),
  warning: (title: string, opts?: Partial<Omit<Toast, 'id' | 'kind' | 'title'>>) =>
    useToastStore.getState().push({ kind: 'warning', title, ...opts }),
  error: (title: string, opts?: Partial<Omit<Toast, 'id' | 'kind' | 'title'>>) =>
    useToastStore
      .getState()
      .push({ kind: 'error', title, durationMs: 7000, ...opts }),
};
