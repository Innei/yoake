import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '~/lib/cn';
import type { Toast, ToastKind } from '~/state/toastStore';
import { useToastStore } from '~/state/toastStore';

const ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const TONE: Record<ToastKind, string> = {
  info: 'border-accent/30 bg-background-secondary text-text',
  success: 'border-green/30 bg-background-secondary text-text',
  warning: 'border-orange/30 bg-background-secondary text-text',
  error: 'border-red/30 bg-background-secondary text-text',
};

const ICON_TONE: Record<ToastKind, string> = {
  info: 'text-accent',
  success: 'text-green',
  warning: 'text-orange',
  error: 'text-red',
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      aria-atomic="false"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = ICONS[toast.kind];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-start gap-2 rounded-lg border p-3 shadow-lg backdrop-blur',
        'transition-all duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        TONE[toast.kind],
      )}
    >
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-4 shrink-0', ICON_TONE[toast.kind])}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{toast.title}</p>
        {toast.description ? (
          <p className="mt-1 break-words text-xs text-text-secondary">
            {toast.description}
          </p>
        ) : null}
        {toast.action ? (
          <button
            className="mt-2 inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-fill"
            type="button"
            onClick={() => {
              toast.action?.onClick();
              dismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        aria-label="Dismiss"
        className="-mr-1 -mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-fill hover:text-text"
        type="button"
        onClick={() => dismiss(toast.id)}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
