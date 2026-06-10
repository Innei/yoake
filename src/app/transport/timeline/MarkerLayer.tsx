import type { PointerEvent as ReactPointerEvent } from 'react';

import { ContextMenuTrigger } from '~/components/ui/context-menu';
import type { Marker } from '~/fs/clipSidecar';
import { cn } from '~/lib/cn';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { useTimeline } from './context';

const EMPTY_MARKERS: readonly Marker[] = [];

export function MarkerLayer() {
  const { duration, readOnly, timeToPercent } = useTimeline();
  const clipId = useClipsStore((s) => s.selectedClipId);
  const markers = useClipDataStore((s) =>
    clipId ? (s.entries[clipId]?.markers ?? EMPTY_MARKERS) : EMPTY_MARKERS,
  );
  const selectedId = useEditModeStore((s) =>
    s.outlineSelection.kind === 'marker' ? s.outlineSelection.id : undefined,
  );
  const setCurrentTime = useEditStore((s) => s.setCurrentTime);
  const removeMarker = useClipDataStore((s) => s.removeMarker);
  const selectMarker = useEditModeStore((s) => s.selectMarker);
  const clearSelection = useEditModeStore((s) => s.clearSelection);

  if (duration <= 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid="transport-marker-layer"
    >
      {markers.map((marker) => (
        <MarkerPin
          duration={duration}
          key={marker.id}
          marker={marker}
          readOnly={readOnly}
          selected={marker.id === selectedId}
          timeToPercent={timeToPercent}
          onJumpTo={() => setCurrentTime(marker.time)}
          onSelect={() => selectMarker(marker.id)}
          onDelete={() => {
            if (!clipId) return;
            removeMarker(clipId, marker.id);
            clearSelection();
          }}
        />
      ))}
    </div>
  );
}

interface PinProps {
  duration: number;
  marker: Marker;
  onDelete: () => void;
  onJumpTo: () => void;
  onSelect: () => void;
  readOnly: boolean;
  selected: boolean;
  timeToPercent: (time: number) => number;
}

function MarkerPin({
  marker,
  duration,
  readOnly,
  selected,
  timeToPercent,
  onJumpTo,
  onSelect,
  onDelete,
}: PinProps) {
  const leftPct = duration > 0 ? timeToPercent(marker.time) : 0;
  const label = marker.label || 'Marker';

  const stopScrub = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  if (readOnly) {
    return (
      <div
        aria-label={label}
        className="pointer-events-auto absolute top-0 z-30 flex h-5 w-4 -translate-x-1/2 items-start justify-center opacity-60"
        data-testid={`transport-marker-dot-${marker.id}`}
        style={{ left: `${leftPct}%` }}
        title={label}
      >
        <div className="relative">
          <div className="size-2.5 rounded-full bg-yellow-400 outline outline-1 outline-black/35" />
          <div className="absolute left-1/2 top-2.5 h-1 w-px -translate-x-1/2 bg-yellow-400/60" />
        </div>
      </div>
    );
  }

  return (
    <ContextMenuTrigger
      aria-label={label}
      className="group pointer-events-auto absolute top-0 z-30 flex h-5 w-4 -translate-x-1/2 cursor-pointer items-start justify-center"
      data-testid={`transport-marker-dot-${marker.id}`}
      style={{ left: `${leftPct}%` }}
      title={label}
      items={[
        {
          label: 'Jump to time',
          onSelect: () => {
            onJumpTo();
            onSelect();
          },
        },
        { destructive: true, label: 'Delete', onSelect: onDelete },
      ]}
      onClick={onSelect}
      onPointerDown={stopScrub}
    >
      <div
        className={cn(
          'size-2.5 rounded-full bg-yellow-400 outline outline-1 outline-black/40 transition-[box-shadow,transform]',
          'group-hover:size-3 group-hover:bg-yellow-300 group-hover:shadow-[0_0_0_3px_rgba(253,224,71,0.18)]',
          selected && 'shadow-[0_0_0_2px_var(--color-accent,#7aa2ff)]',
        )}
      />
      <div className="absolute left-1/2 top-2.5 h-1 w-px -translate-x-1/2 bg-yellow-400" />
    </ContextMenuTrigger>
  );
}
