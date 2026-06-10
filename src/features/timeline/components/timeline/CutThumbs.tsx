import { useCallback, useRef } from 'react';

import { cn } from '~/lib/cn';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

import { useTimeline } from './context';

type Edge = 'in' | 'out';

interface DragState {
  anchorClientX: number;
  anchorTime: number;
  edge: Edge;
  pointerId: number;
}

const MIN_DURATION_SEC = 1 / 120;
const FINE_SCALE = 0.1;

function snap(time: number, fps: number): number {
  const step = fps > 0 ? 1 / fps : 1 / 30;
  return Math.round(time / step) * step;
}

export function CutThumbs() {
  const cutMode = useEditModeStore((s) => s.cutMode);
  const clipId = useClipsStore((s) => s.selectedClipId);
  const segment = useClipDataStore((s) => {
    if (!cutMode.active || !clipId) return undefined;
    return s.entries[clipId]?.segments.find((seg) => seg.id === cutMode.segmentId);
  });
  const updateSegment = useClipDataStore((s) => s.updateSegment);
  const setCurrentTime = useEditStore((s) => s.setCurrentTime);
  const setPlaying = useEditStore((s) => s.setPlaying);
  const { duration, fps, timeToPercent } = useTimeline();
  const dragRef = useRef<DragState | null>(null);

  const trackRectOf = useCallback(
    (target: HTMLElement): DOMRect | undefined => {
      const parent = target.parentElement;
      if (!parent) return undefined;
      const rect = parent.getBoundingClientRect();
      return rect.width > 0 ? rect : undefined;
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, edge: Edge) => {
      event.preventDefault();
      event.stopPropagation();
      if (!segment) return;
      dragRef.current = {
        edge,
        pointerId: event.pointerId,
        anchorClientX: event.clientX,
        anchorTime: edge === 'in' ? segment.in : segment.out,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setPlaying(false);
      setCurrentTime(edge === 'in' ? segment.in : segment.out);
    },
    [segment, setCurrentTime, setPlaying],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!segment || !clipId || duration <= 0) return;
      event.stopPropagation();
      const rect = trackRectOf(event.currentTarget);
      if (!rect) return;
      const dx = event.clientX - drag.anchorClientX;
      const secPerPx = duration / rect.width;
      const scale = event.shiftKey ? FINE_SCALE : 1;
      const raw = drag.anchorTime + dx * secPerPx * scale;
      const target = snap(Math.max(0, Math.min(duration, raw)), fps);
      if (drag.edge === 'in') {
        const limit = segment.out - MIN_DURATION_SEC;
        const next = Math.min(limit, target);
        if (Math.abs(next - segment.in) > 1e-4) {
          updateSegment(clipId, segment.id, { in: next });
          setCurrentTime(next);
        }
      } else {
        const limit = segment.in + MIN_DURATION_SEC;
        const next = Math.max(limit, target);
        if (Math.abs(next - segment.out) > 1e-4) {
          updateSegment(clipId, segment.id, { out: next });
          setCurrentTime(next);
        }
      }
    },
    [clipId, duration, fps, segment, setCurrentTime, trackRectOf, updateSegment],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore release on un-captured pointer */
      }
    },
    [],
  );

  if (!cutMode.active || !segment) return null;

  const inPct = timeToPercent(segment.in);
  const outPct = timeToPercent(segment.out);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 z-30 h-2 -translate-y-1/2 rounded-full bg-accent/80"
        style={{ left: `${inPct}%`, width: `${Math.max(0, outPct - inPct)}%` }}
      />
      <CutThumb
        ariaLabel="Cut in-point"
        leftPct={inPct}
        testId="transport-cut-thumb-in"
        tone="in"
        onPointerCancel={handlePointerUp}
        onPointerDown={(e) => handlePointerDown(e, 'in')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <CutThumb
        ariaLabel="Cut out-point"
        leftPct={outPct}
        testId="transport-cut-thumb-out"
        tone="out"
        onPointerCancel={handlePointerUp}
        onPointerDown={(e) => handlePointerDown(e, 'out')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </>
  );
}

interface ThumbProps {
  ariaLabel: string;
  leftPct: number;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  testId: string;
  tone: 'in' | 'out';
}

function CutThumb({
  ariaLabel,
  leftPct,
  testId,
  tone,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ThumbProps) {
  return (
    <div
      aria-label={ariaLabel}
      data-testid={testId}
      role="slider"
      style={{ left: `${leftPct}%` }}
      className={cn(
        'pointer-events-auto absolute top-1/2 z-40 size-4 -translate-x-1/2 -translate-y-1/2',
        'rounded-sm border border-background-secondary shadow',
        'cursor-ew-resize transition-transform hover:scale-110 active:scale-110',
        tone === 'in'
          ? 'bg-emerald-400 ring-1 ring-emerald-600/70'
          : 'bg-rose-400 ring-1 ring-rose-600/70',
      )}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
