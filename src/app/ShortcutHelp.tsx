import { Keyboard, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '~/lib/cn';

import { SHORTCUTS } from './shortcuts';

export function ShortcutHelp({
  open,
  onClose,
}: {
  onClose: () => void;
  open: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      aria-labelledby="shortcut-help-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <div
        className={cn(
          'flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background-secondary shadow-xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Keyboard aria-hidden className="size-4 text-text-tertiary" />
            <h2
              className="text-sm font-medium text-text"
              id="shortcut-help-title"
            >
              Keyboard shortcuts
            </h2>
          </div>
          <button
            aria-label="Close"
            className="inline-flex size-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-fill hover:text-text"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden className="size-4" />
          </button>
        </header>
        <div className="grid max-h-[70vh] gap-5 overflow-auto p-4 sm:grid-cols-2">
          {SHORTCUTS.map((section) => (
            <section key={section.section}>
              <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                {section.section}
              </h3>
              <ul className="flex flex-col gap-1">
                {section.items.map((sc) => (
                  <li
                    className="flex items-center justify-between gap-3 text-sm"
                    key={sc.keys}
                  >
                    <span className="text-text-secondary">
                      {sc.description}
                    </span>
                    <Kbd>{sc.keys}</Kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 items-center rounded-md border border-border bg-background px-1.5 font-mono text-[11px] tabular-nums text-text-secondary shadow-xs">
      {children}
    </kbd>
  );
}
