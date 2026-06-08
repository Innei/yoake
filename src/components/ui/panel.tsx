import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '~/lib/cn';

export function Panel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col bg-background-secondary',
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  icon,
  label,
  count,
  actions,
  className,
}: {
  actions?: ReactNode;
  className?: string;
  count?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
}) {
  return (
    <header
      className={cn(
        'flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon ? (
          <span aria-hidden className="text-text-tertiary">
            {icon}
          </span>
        ) : null}
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
        {count != null ? (
          <span className="rounded-sm bg-fill px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-secondary">
            {count}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 -mr-2 items-center gap-1">{actions}</div>
      ) : null}
    </header>
  );
}

export function PanelSection({
  icon,
  label,
  meta,
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  label?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-2 px-3 py-3', className)}>
      {label != null ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {icon ? (
              <span aria-hidden className="text-text-tertiary">
                {icon}
              </span>
            ) : null}
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              {label}
            </h3>
          </div>
          {meta != null ? (
            <span className="font-mono text-xs tabular-nums text-text-secondary">
              {meta}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
