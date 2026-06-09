import type { Segment } from '~/fs/clipSidecar';

export interface PreviewCutCursor {
  freezeEnteredAtMs?: number;
  freezeSegmentId?: string;
}

export interface PreviewCutTickInput {
  currentTime: number;
  cursor: PreviewCutCursor;
  dtSec: number;
  nowMs: number;
  segments: readonly Segment[];
}

export type PreviewCutDecision =
  | { kind: 'pass' }
  | {
      cursorUpdate?: PreviewCutCursor;
      isFreezing?: boolean;
      kind: 'advance';
      sourceTime: number;
    }
  | { cursorUpdate?: PreviewCutCursor; kind: 'pause' };

const EPSILON = 1e-6;

function lowerBoundByIn(segments: readonly Segment[], time: number): number {
  let lo = 0;
  let hi = segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (segments[mid].in < time - EPSILON) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function findContainingSegment(
  segments: readonly Segment[],
  time: number,
): Segment | undefined {
  const idx = lowerBoundByIn(segments, time);
  const candidate = idx > 0 ? segments[idx - 1] : undefined;
  if (
    candidate &&
    time >= candidate.in - EPSILON &&
    time < candidate.out - EPSILON
  ) {
    return candidate;
  }
  const atIdx = segments[idx];
  if (
    atIdx &&
    time >= atIdx.in - EPSILON &&
    time < atIdx.out - EPSILON
  ) {
    return atIdx;
  }
  return undefined;
}

function findNextSegment(
  segments: readonly Segment[],
  time: number,
): Segment | undefined {
  const idx = lowerBoundByIn(segments, time);
  return segments[idx];
}

export function decidePreviewCutTick(
  input: PreviewCutTickInput,
): PreviewCutDecision {
  const { segments, currentTime, dtSec, nowMs, cursor } = input;

  if (segments.length === 0) return { kind: 'pass' };

  const containing = findContainingSegment(segments, currentTime);

  if (!containing) {
    const next = findNextSegment(segments, currentTime);
    if (!next) {
      return {
        kind: 'pause',
        cursorUpdate: { freezeEnteredAtMs: undefined, freezeSegmentId: undefined },
      };
    }
    return {
      kind: 'advance',
      sourceTime: next.in,
      cursorUpdate: { freezeEnteredAtMs: undefined, freezeSegmentId: undefined },
    };
  }

  if (containing.playMode === 'freeze') {
    const freezeFor = containing.freezeDurationSec ?? 0;
    const enteredAt =
      cursor.freezeSegmentId === containing.id && cursor.freezeEnteredAtMs !== undefined
        ? cursor.freezeEnteredAtMs
        : nowMs;
    const elapsed = (nowMs - enteredAt) / 1000;
    if (elapsed >= freezeFor) {
      const next = segments.find((s) => s.in >= containing.out - EPSILON);
      if (!next) {
        return {
          kind: 'pause',
          cursorUpdate: { freezeEnteredAtMs: undefined, freezeSegmentId: undefined },
        };
      }
      return {
        kind: 'advance',
        sourceTime: next.in,
        cursorUpdate: { freezeEnteredAtMs: undefined, freezeSegmentId: undefined },
      };
    }
    return {
      kind: 'advance',
      sourceTime: containing.in,
      isFreezing: true,
      cursorUpdate: {
        freezeEnteredAtMs: enteredAt,
        freezeSegmentId: containing.id,
      },
    };
  }

  const rate = Math.abs(containing.speed) || 1;
  const tentative = currentTime + dtSec * rate;

  if (tentative >= containing.out - EPSILON) {
    const next = segments.find((s) => s.in >= containing.out - EPSILON);
    if (!next) {
      return {
        kind: 'pause',
        cursorUpdate: { freezeEnteredAtMs: undefined, freezeSegmentId: undefined },
      };
    }
    return {
      kind: 'advance',
      sourceTime: next.in,
      cursorUpdate: { freezeEnteredAtMs: undefined, freezeSegmentId: undefined },
    };
  }

  return {
    kind: 'advance',
    sourceTime: tentative,
    cursorUpdate: { freezeEnteredAtMs: undefined, freezeSegmentId: undefined },
  };
}
