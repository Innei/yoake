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
      kind: 'advance';
      sourceTime: number;
    }
  | { cursorUpdate?: PreviewCutCursor; kind: 'pause' };

const EPSILON = 1e-6;

function findContainingSegment(
  segments: readonly Segment[],
  time: number,
): Segment | undefined {
  return segments.find((s) => time >= s.in - EPSILON && time < s.out - EPSILON);
}

function findNextSegment(
  segments: readonly Segment[],
  time: number,
): Segment | undefined {
  return segments.find((s) => s.in >= time - EPSILON);
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
