import { useCallback, useRef } from 'react';

import { cn } from '~/lib/cn';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { useTimeline } from './context';

type Edge = 'in' | 'out';

interface DragState {
  edge: Edge;
  pointerId: number;
}

const MIN_DURATION_SEC = 1 / 120;

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

  const computeTime = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.currentTarget.parentElement as HTMLElement | null;
      if (!target || duration <= 0) return undefined;
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0) return undefined;
      const ratio = (event.clientX - rect.left) / rect.width;
      const t = Math.max(0, Math.min(duration, ratio * duration));
      return snap(t, fps);
    },
    [duration, fps],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, edge: Edge) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = { edge, pointerId: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
      setPlaying(false);
      if (segment) {
        setCurrentTime(edge === 'in' ? segment.in : segment.out);
      }
    },
    [segment, setCurrentTime, setPlaying],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!segment || !clipId) return;
      event.stopPropagation();
      const t = computeTime(event);
      if (t === undefined) return;
      if (drag.edge === 'in') {
        const limit = segment.out - MIN_DURATION_SEC;
        const next = Math.min(limit, Math.max(0, t));
        if (Math.abs(next - segment.in) > 1e-4) {
          updateSegment(clipId, segment.id, { in: next });
          setCurrentTime(next);
        }
      } else {
        const limit = segment.in + MIN_DURATION_SEC;
        const next = Math.max(limit, Math.min(duration, t));
        if (Math.abs(next - segment.out) > 1e-4) {
          updateSegment(clipId, segment.id, { out: next });
          setCurrentTime(next);
        }
      }
    },
    [clipId, computeTime, duration, segment, setCurrentTime, updateSegment],
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
