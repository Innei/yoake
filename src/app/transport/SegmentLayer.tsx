import { useCallback, useRef, useState } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '~/components/ui/context-menu';
import type { Segment, SegmentPlayMode } from '~/fs/clipSidecar';
import { cn } from '~/lib/cn';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

interface Props {
  readOnly?: boolean;
}

const FALLBACK_FPS = 30;
const HANDLE_PX = 4;

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, '0');
}

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const total = Math.floor(safe);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const ms = Math.floor((safe - total) * 1000);
  return `${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

function snap(time: number, fps: number): number {
  const step = fps > 0 ? 1 / fps : 1 / FALLBACK_FPS;
  return Math.round(time / step) * step;
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

type Edge = 'in' | 'out';

interface DragState {
  edge: Edge;
  pointerId: number;
  segId: string;
}

export function SegmentLayer({ readOnly = false }: Props) {
  const clipId = useClipsStore((s) => s.selectedClipId);
  const segments = useClipDataStore((s) =>
    clipId ? (s.entries[clipId]?.segments ?? []) : [],
  );
  const duration = useEditStore((s) => s.duration);
  const fps = useEditStore((s) => s.fps);
  const updateSegment = useClipDataStore((s) => s.updateSegment);
  const removeSegment = useClipDataStore((s) => s.removeSegment);
  const setSegmentPlayMode = useClipDataStore((s) => s.setSegmentPlayMode);
  const setSegmentSpeed = useClipDataStore((s) => s.setSegmentSpeed);
  const splitAtTime = useClipDataStore((s) => s.splitAtTime);
  const addMarker = useClipDataStore((s) => s.addMarker);
  const setCurrentTime = useEditStore((s) => s.setCurrentTime);
  const selectSegment = useEditModeStore((s) => s.selectSegment);
  const selectMarker = useEditModeStore((s) => s.selectMarker);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [emptyClickTime, setEmptyClickTime] = useState<number | undefined>(
    undefined,
  );
  const [bandClickTime, setBandClickTime] = useState<
    { segId: string; time: number } | undefined
  >(undefined);

  const computeTimeFromClientX = useCallback(
    (clientX: number): number | undefined => {
      const track = trackRef.current;
      if (!track || duration <= 0) return undefined;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return undefined;
      const ratio = (clientX - rect.left) / rect.width;
      const raw = clampNumber(ratio * duration, 0, duration);
      return snap(raw, fps);
    },
    [duration, fps],
  );

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    segId: string,
    edge: Edge,
  ) => {
    if (readOnly) return;
    if (!clipId) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { edge, pointerId: event.pointerId, segId };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!clipId) return;
    const next = computeTimeFromClientX(event.clientX);
    if (next === undefined) return;
    const list = useClipDataStore.getState().entries[clipId]?.segments ?? [];
    const index = list.findIndex((seg) => seg.id === drag.segId);
    if (index === -1) return;
    const current = list[index]!;
    const prevNeighbor = list[index - 1];
    const nextNeighbor = list[index + 1];
    const EPSILON = 1e-4;
    if (drag.edge === 'in') {
      const min = prevNeighbor ? prevNeighbor.out : 0;
      const max = current.out - EPSILON;
      const clamped = clampNumber(next, min, max);
      if (clamped === current.in) return;
      updateSegment(clipId, drag.segId, { in: clamped });
    } else {
      const min = current.in + EPSILON;
      const max = nextNeighbor ? nextNeighbor.in : duration;
      const clamped = clampNumber(next, min, max);
      if (clamped === current.out) return;
      updateSegment(clipId, drag.segId, { out: clamped });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* releasing a never-captured pointer throws — ignore */
    }
    dragRef.current = null;
  };

  const handleBandClick = (event: React.MouseEvent, segId: string) => {
    if (readOnly) return;
    event.stopPropagation();
    selectSegment(segId);
  };

  const handleBandContextMenu = (event: React.MouseEvent, segId: string) => {
    if (readOnly) return;
    event.stopPropagation();
    const time = computeTimeFromClientX(event.clientX);
    setBandClickTime({ segId, time: time ?? 0 });
  };

  const handleEmptyContextMenu = (event: React.MouseEvent) => {
    if (readOnly) return;
    const time = computeTimeFromClientX(event.clientX);
    setEmptyClickTime(time);
  };

  const jumpTo = (time: number) => {
    setCurrentTime(time);
  };

  const onSplitAtBand = () => {
    if (!clipId || !bandClickTime) return;
    splitAtTime(clipId, bandClickTime.time);
  };

  const onJumpToIn = () => {
    if (!bandClickTime) return;
    const seg = segments.find((s) => s.id === bandClickTime.segId);
    if (!seg) return;
    jumpTo(seg.in);
  };

  const onJumpToOut = () => {
    if (!bandClickTime) return;
    const seg = segments.find((s) => s.id === bandClickTime.segId);
    if (!seg) return;
    jumpTo(seg.out);
  };

  const onDeleteSegment = () => {
    if (!clipId || !bandClickTime) return;
    removeSegment(clipId, bandClickTime.segId);
    useEditModeStore.getState().clearSelection();
  };

  const onSetPlayMode = (mode: SegmentPlayMode) => {
    if (!clipId || !bandClickTime) return;
    setSegmentPlayMode(clipId, bandClickTime.segId, mode);
  };

  const onSetSpeed = (speed: number) => {
    if (!clipId || !bandClickTime) return;
    setSegmentSpeed(clipId, bandClickTime.segId, speed);
  };

  const onAddMarkerHere = () => {
    if (!clipId || emptyClickTime === undefined) return;
    const id = addMarker(clipId, emptyClickTime, '');
    selectMarker(id);
  };

  const emptyMenu = !readOnly ? (
    <ContextMenu>
      <ContextMenuTrigger
        className="absolute inset-0 z-0"
        data-testid="transport-segment-empty-trigger"
        onContextMenu={handleEmptyContextMenu}
      />
      <ContextMenuContent data-testid="transport-empty-context-menu">
        <ContextMenuItem onClick={onAddMarkerHere}>
          Add marker here
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ) : null;

  return (
    <div
      className="relative h-full w-full"
      data-testid="transport-segment-layer"
      ref={trackRef}
    >
      {emptyMenu}
      {duration > 0
        ? segments.map((seg) => (
            <SegmentBand
              duration={duration}
              key={seg.id}
              readOnly={readOnly}
              segment={seg}
              onBandClick={(event) => handleBandClick(event, seg.id)}
              onBandContextMenu={(event) => handleBandContextMenu(event, seg.id)}
              onDeleteSegment={onDeleteSegment}
              onHandlePointerMove={handlePointerMove}
              onHandlePointerUp={handlePointerUp}
              onJumpToIn={onJumpToIn}
              onJumpToOut={onJumpToOut}
              onSetPlayMode={onSetPlayMode}
              onSetSpeed={onSetSpeed}
              onSplitHere={onSplitAtBand}
              onHandlePointerDown={(event, edge) =>
                handlePointerDown(event, seg.id, edge)
              }
            />
          ))
        : null}
    </div>
  );
}

interface BandProps {
  duration: number;
  onBandClick: (event: React.MouseEvent) => void;
  onBandContextMenu: (event: React.MouseEvent) => void;
  onDeleteSegment: () => void;
  onHandlePointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    edge: Edge,
  ) => void;
  onHandlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandlePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onJumpToIn: () => void;
  onJumpToOut: () => void;
  onSetPlayMode: (mode: SegmentPlayMode) => void;
  onSetSpeed: (speed: number) => void;
  onSplitHere: () => void;
  readOnly: boolean;
  segment: Segment;
}

function SegmentBand({
  segment,
  duration,
  readOnly,
  onBandClick,
  onBandContextMenu,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
  onSplitHere,
  onJumpToIn,
  onJumpToOut,
  onDeleteSegment,
  onSetPlayMode,
  onSetSpeed,
}: BandProps) {
  const leftPct = (segment.in / duration) * 100;
  const widthPct = ((segment.out - segment.in) / duration) * 100;
  const speedLabel =
    segment.speed && segment.speed !== 1
      ? `${segment.speed.toFixed(2)}x`
      : '1x';
  const title = `${formatTime(segment.in)} - ${formatTime(segment.out)}  ${segment.playMode}  ${speedLabel}`;

  const bandInner = (
    <>
      {!readOnly ? (
        <div
          aria-label="Trim segment start"
          className="absolute inset-y-0 left-0 z-10 cursor-ew-resize bg-accent/70 transition-colors hover:bg-accent"
          data-testid={`transport-segment-handle-${segment.id}-in`}
          style={{ width: HANDLE_PX }}
          onPointerCancel={onHandlePointerUp}
          onPointerDown={(event) => onHandlePointerDown(event, 'in')}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        />
      ) : null}
      <button
        data-testid={`transport-segment-body-${segment.id}`}
        disabled={readOnly}
        tabIndex={-1}
        title={title}
        type="button"
        className={cn(
          'flex-1 rounded-sm border border-accent/40 bg-accent/30 transition-colors',
          readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-accent/40',
        )}
        onClick={onBandClick}
      />
      {!readOnly ? (
        <div
          aria-label="Trim segment end"
          className="absolute inset-y-0 right-0 z-10 cursor-ew-resize bg-accent/70 transition-colors hover:bg-accent"
          data-testid={`transport-segment-handle-${segment.id}-out`}
          style={{ width: HANDLE_PX }}
          onPointerCancel={onHandlePointerUp}
          onPointerDown={(event) => onHandlePointerDown(event, 'out')}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        />
      ) : null}
    </>
  );

  if (readOnly) {
    return (
      <div
        className="absolute inset-y-1 z-10 flex items-stretch"
        data-testid={`transport-segment-band-${segment.id}`}
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
        }}
      >
        {bandInner}
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="absolute inset-y-1 z-10 flex items-stretch"
        data-testid={`transport-segment-band-${segment.id}`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        onContextMenu={onBandContextMenu}
      >
        {bandInner}
      </ContextMenuTrigger>
      <ContextMenuContent data-testid={`transport-segment-menu-${segment.id}`}>
        <ContextMenuItem onClick={onSplitHere}>Split here</ContextMenuItem>
        <ContextMenuItem onClick={onJumpToIn}>Jump to in</ContextMenuItem>
        <ContextMenuItem onClick={onJumpToOut}>Jump to out</ContextMenuItem>
        <ContextMenuSeparator />
        <MenuGroupLabel>Set playMode</MenuGroupLabel>
        <ContextMenuItem onClick={() => onSetPlayMode('normal')}>
          Normal
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onSetPlayMode('reverse')}>
          Reverse
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onSetPlayMode('freeze')}>
          Freeze
        </ContextMenuItem>
        {segment.playMode === 'normal' || segment.playMode === 'reverse' ? (
          <>
            <ContextMenuSeparator />
            <MenuGroupLabel>Set speed</MenuGroupLabel>
            <ContextMenuItem onClick={() => onSetSpeed(0.25)}>
              0.25x
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onSetSpeed(0.5)}>
              0.5x
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onSetSpeed(1)}>1x</ContextMenuItem>
            <ContextMenuItem onClick={() => onSetSpeed(2)}>2x</ContextMenuItem>
            <ContextMenuItem onClick={() => onSetSpeed(4)}>4x</ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={onDeleteSegment}>
          Delete segment
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MenuGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-text-tertiary">
      {children}
    </div>
  );
}

