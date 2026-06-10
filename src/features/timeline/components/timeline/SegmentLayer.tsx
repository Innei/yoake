import { useCallback, useRef } from 'react';

import {
  type ContextMenuItemDef,
  ContextMenuTrigger,
  showContextMenu,
} from '~/components/ui/context-menu';
import type { Segment, SegmentPlayMode } from '~/lib/fs/clipSidecar';
import { cn } from '~/lib/cn';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';

import { useTimeline } from './context';

const EMPTY_SEGMENTS: readonly Segment[] = [];

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

export function SegmentLayer() {
  const { clientXToTime, duration, fps, readOnly, timeToPercent } = useTimeline();
  const clipId = useClipsStore((s) => s.selectedClipId);
  const segments = useClipDataStore((s) =>
    clipId ? (s.entries[clipId]?.segments ?? EMPTY_SEGMENTS) : EMPTY_SEGMENTS,
  );
  const updateSegment = useClipDataStore((s) => s.updateSegment);
  const removeSegment = useClipDataStore((s) => s.removeSegment);
  const setSegmentPlayMode = useClipDataStore((s) => s.setSegmentPlayMode);
  const setSegmentSpeed = useClipDataStore((s) => s.setSegmentSpeed);
  const splitAtTime = useClipDataStore((s) => s.splitAtTime);
  const addMarker = useClipDataStore((s) => s.addMarker);
  const setCurrentTime = useEditStore((s) => s.setCurrentTime);
  const selectSegment = useEditModeStore((s) => s.selectSegment);
  const selectMarker = useEditModeStore((s) => s.selectMarker);
  const clearSelection = useEditModeStore((s) => s.clearSelection);

  const dragRef = useRef<DragState | null>(null);

  const snapTime = useCallback(
    (clientX: number): number | undefined => {
      const t = clientXToTime(clientX);
      return t === undefined ? undefined : snap(t, fps);
    },
    [clientXToTime, fps],
  );

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    segId: string,
    edge: Edge,
  ) => {
    if (readOnly || !clipId) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { edge, pointerId: event.pointerId, segId };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !clipId) return;
    const next = snapTime(event.clientX);
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

  const buildBandMenu = (
    seg: Segment,
    clickTime: number,
  ): ContextMenuItemDef[] => {
    const speedItems: ContextMenuItemDef[] =
      seg.playMode === 'normal' || seg.playMode === 'reverse'
        ? [
            { kind: 'separator' },
            { kind: 'group', label: 'Set speed' },
            ...[0.25, 0.5, 1, 2, 4].map<ContextMenuItemDef>((s) => ({
              label: `${s}x`,
              onSelect: () => {
                if (clipId) setSegmentSpeed(clipId, seg.id, s);
              },
            })),
          ]
        : [];
    return [
      {
        label: 'Split here',
        onSelect: () => {
          if (clipId) splitAtTime(clipId, clickTime);
        },
      },
      { label: 'Jump to in', onSelect: () => setCurrentTime(seg.in) },
      { label: 'Jump to out', onSelect: () => setCurrentTime(seg.out) },
      { kind: 'separator' },
      { kind: 'group', label: 'Set playMode' },
      ...(['normal', 'reverse', 'freeze'] as SegmentPlayMode[]).map<ContextMenuItemDef>(
        (m) => ({
          label: m.charAt(0).toUpperCase() + m.slice(1),
          onSelect: () => {
            if (clipId) setSegmentPlayMode(clipId, seg.id, m);
          },
        }),
      ),
      ...speedItems,
      { kind: 'separator' },
      {
        destructive: true,
        label: 'Delete segment',
        onSelect: () => {
          if (!clipId) return;
          removeSegment(clipId, seg.id);
          clearSelection();
        },
      },
    ];
  };

  const handleBandContextMenu = (
    event: React.MouseEvent<HTMLElement>,
    seg: Segment,
  ) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const time = snapTime(event.clientX) ?? 0;
    showContextMenu(buildBandMenu(seg, time), { event });
  };

  const handleEmptyContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (readOnly) return;
    event.preventDefault();
    const time = snapTime(event.clientX);
    if (time === undefined) return;
    showContextMenu(
      [
        {
          label: 'Add marker here',
          onSelect: () => {
            if (!clipId) return;
            const id = addMarker(clipId, time, '');
            selectMarker(id);
          },
        },
      ],
      { event },
    );
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-3 -translate-y-1/2"
      data-testid="transport-segment-layer"
    >
      {!readOnly ? (
        <ContextMenuTrigger
          className="pointer-events-auto absolute inset-0 z-0"
          data-testid="transport-segment-empty-trigger"
          onContextMenu={handleEmptyContextMenu}
        />
      ) : null}
      {duration > 0
        ? segments.map((seg) => (
            <SegmentBand
              duration={duration}
              key={seg.id}
              readOnly={readOnly}
              segment={seg}
              timeToPercent={timeToPercent}
              onBandClick={(event) => handleBandClick(event, seg.id)}
              onBandContextMenu={(event) => handleBandContextMenu(event, seg)}
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
  onBandContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onHandlePointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    edge: Edge,
  ) => void;
  onHandlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandlePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  readOnly: boolean;
  segment: Segment;
  timeToPercent: (time: number) => number;
}

function SegmentBand({
  segment,
  duration,
  readOnly,
  timeToPercent,
  onBandClick,
  onBandContextMenu,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
}: BandProps) {
  const leftPct = timeToPercent(segment.in);
  const widthPct = duration > 0 ? ((segment.out - segment.in) / duration) * 100 : 0;
  const speedLabel =
    segment.speed && segment.speed !== 1
      ? `${segment.speed.toFixed(2)}x`
      : '1x';
  const title = `${formatTime(segment.in)} - ${formatTime(segment.out)}  ${segment.playMode}  ${speedLabel}`;

  const stopScrub = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

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
        onPointerDown={stopScrub}
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
        className="pointer-events-auto absolute inset-y-0 z-10 flex items-stretch"
        data-testid={`transport-segment-band-${segment.id}`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      >
        {bandInner}
      </div>
    );
  }

  return (
    <ContextMenuTrigger onContextMenu={onBandContextMenu}>
      <div
        className="pointer-events-auto absolute inset-y-0 z-10 flex items-stretch"
        data-testid={`transport-segment-band-${segment.id}`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      >
        {bandInner}
      </div>
    </ContextMenuTrigger>
  );
}
