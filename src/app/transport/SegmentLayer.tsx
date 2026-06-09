import { useCallback, useRef } from 'react';

import type { Segment } from '~/fs/clipSidecar';
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
  const selectSegment = useEditModeStore((s) => s.selectSegment);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

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

  return (
    <div
      className="relative h-full w-full"
      data-testid="transport-segment-layer"
      ref={trackRef}
    >
      {duration > 0
        ? segments.map((seg) => (
            <SegmentBand
              duration={duration}
              key={seg.id}
              readOnly={readOnly}
              segment={seg}
              onBandClick={(event) => handleBandClick(event, seg.id)}
              onHandlePointerMove={handlePointerMove}
              onHandlePointerUp={handlePointerUp}
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
  onHandlePointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    edge: Edge,
  ) => void;
  onHandlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandlePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  readOnly: boolean;
  segment: Segment;
}

function SegmentBand({
  segment,
  duration,
  readOnly,
  onBandClick,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
}: BandProps) {
  const leftPct = (segment.in / duration) * 100;
  const widthPct = ((segment.out - segment.in) / duration) * 100;
  const speedLabel =
    segment.speed && segment.speed !== 1
      ? `${segment.speed.toFixed(2)}x`
      : '1x';
  const title = `${formatTime(segment.in)} - ${formatTime(segment.out)}  ${segment.playMode}  ${speedLabel}`;

  return (
    <div
      className="absolute inset-y-1 flex items-stretch"
      data-testid={`transport-segment-band-${segment.id}`}
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
      }}
    >
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
    </div>
  );
}
