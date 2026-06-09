import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '~/components/ui/context-menu';
import type { Marker } from '~/fs/clipSidecar';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

interface Props {
  readOnly?: boolean;
}

export function MarkerLayer({ readOnly = false }: Props) {
  const clipId = useClipsStore((s) => s.selectedClipId);
  const markers = useClipDataStore((s) =>
    clipId ? (s.entries[clipId]?.markers ?? []) : [],
  );
  const duration = useEditStore((s) => s.duration);
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
        <MarkerDot
          duration={duration}
          key={marker.id}
          marker={marker}
          readOnly={readOnly}
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

interface DotProps {
  duration: number;
  marker: Marker;
  onDelete: () => void;
  onJumpTo: () => void;
  onSelect: () => void;
  readOnly: boolean;
}

function MarkerDot({
  marker,
  duration,
  readOnly,
  onJumpTo,
  onSelect,
  onDelete,
}: DotProps) {
  const leftPct = Math.max(0, Math.min(100, (marker.time / duration) * 100));

  if (readOnly) {
    return (
      <div
        aria-label={marker.label || 'Marker'}
        className="pointer-events-auto absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400 ring-1 ring-black/40"
        data-testid={`transport-marker-dot-${marker.id}`}
        style={{ left: `${leftPct}%` }}
        title={marker.label || 'Marker'}
      />
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        aria-label={marker.label || 'Marker'}
        className="pointer-events-auto absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-yellow-400 ring-1 ring-black/40"
        data-testid={`transport-marker-dot-${marker.id}`}
        style={{ left: `${leftPct}%` }}
        title={marker.label || 'Marker'}
        onClick={onSelect}
      />
      <ContextMenuContent data-testid={`transport-marker-menu-${marker.id}`}>
        <ContextMenuItem
          onClick={() => {
            onJumpTo();
            onSelect();
          }}
        >
          Jump to time
        </ContextMenuItem>
        <ContextMenuItem destructive onClick={onDelete}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
