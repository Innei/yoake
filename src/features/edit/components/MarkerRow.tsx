import { Star } from 'lucide-react';

import { ContextMenuTrigger } from '~/components/ui/context-menu';
import type { Marker } from '~/lib/fs/clipSidecar';
import { cn } from '~/lib/cn';

interface Props {
  marker: Marker;
  onDelete: () => void;
  onRename: () => void;
  onSelect: () => void;
  selected: boolean;
}

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const minutes = Math.floor(totalMs / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const fff = String(ms).padStart(3, '0');
  return `${mm}:${ss}.${fff}`;
}

export function MarkerRow({
  marker,
  selected,
  onDelete,
  onRename,
  onSelect,
}: Props) {
  const label = marker.label || '(no label)';
  return (
    <li>
      <ContextMenuTrigger
        className="block"
        items={[
          { label: 'Rename', onSelect: onRename },
          { label: 'Jump to time', onSelect },
          { destructive: true, label: 'Delete', onSelect: onDelete },
        ]}
      >
        <button
          aria-current={selected ? 'true' : undefined}
          data-testid={`marker-row-${marker.id}`}
          type="button"
          className={cn(
            'group relative flex w-full items-center gap-2 px-2 py-1.5 text-left',
            'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
            selected
              ? 'bg-fill text-text'
              : 'text-text-secondary hover:bg-fill/60 hover:text-text',
            'data-[popup-open]:bg-fill data-[popup-open]:text-text',
          )}
          onClick={onSelect}
        >
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0 left-0 w-0.5 rounded-full transition-colors',
              selected ? 'bg-accent' : 'bg-transparent',
            )}
          />
          <Star
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 transition-colors',
              selected ? 'text-accent' : 'text-text-quaternary',
            )}
          />
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-tertiary">
            {formatTime(marker.time)}
          </span>
          <span aria-hidden className="text-text-quaternary">
            ·
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              marker.label ? '' : 'italic text-text-tertiary',
            )}
          >
            {label}
          </span>
        </button>
      </ContextMenuTrigger>
    </li>
  );
}
