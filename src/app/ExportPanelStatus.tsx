import { Loader2 } from 'lucide-react';

import type { ExportStatus } from './exportPanelTypes';

export function Shortcut({ keys }: { keys: string }) {
  return (
    <kbd className="ml-1 rounded-sm bg-white/15 px-1 text-[10px] font-mono leading-none text-white/80">
      {keys}
    </kbd>
  );
}

export function StatusBar({ status }: { status: ExportStatus }) {
  const running = status.kind === 'running';
  return (
    <p
      aria-live="polite"
      className="flex h-4 items-center gap-1.5 text-[11px] text-text-tertiary"
      role="status"
    >
      {running ? (
        <Loader2 aria-hidden className="size-3 animate-spin text-accent" />
      ) : (
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-text-quaternary"
        />
      )}
      <span>
        {running
          ? `Rendering ${status.format === 'ultraHdr' ? 'Ultra HDR' : 'SDR'} frame…`
          : 'Ready'}
      </span>
    </p>
  );
}
