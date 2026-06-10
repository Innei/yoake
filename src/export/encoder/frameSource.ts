import type { Segment } from '~/fs/clipSidecar';

export interface FramePlan {
  outputFrameIndex: number;
  sourceTime: number;
}

export interface BuildFramePlanOptions {
  bakeSpeed?: boolean;
  duration: number;
  fps: number;
  segments: readonly Segment[];
}

const MIN_SPEED = 0.05;
const MAX_SPEED = 10;
const DEFAULT_FREEZE_SEC = 2;
const OUT_EPSILON = 1e-6;

function sortKeepSegments(segments: readonly Segment[]): Segment[] {
  return [...segments].sort((a, b) => a.in - b.in);
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

export function buildFramePlan(opts: BuildFramePlanOptions): FramePlan[] {
  const { duration, fps, segments, bakeSpeed = true } = opts;
  if (!(fps > 0)) return [];
  const frameDur = 1 / fps;

  const plan: FramePlan[] = [];
  let outIdx = 0;
  const emit = (sourceTime: number) => {
    plan.push({ sourceTime, outputFrameIndex: outIdx });
    outIdx += 1;
  };

  if (segments.length === 0) {
    if (!(duration > 0)) return [];
    const frameCount = Math.max(1, Math.round(duration * fps));
    for (let i = 0; i < frameCount; i += 1) {
      const t = (i + 0.5) * frameDur;
      emit(Math.min(duration - OUT_EPSILON, Math.max(0, t)));
    }
    return plan;
  }

  for (const segment of sortKeepSegments(segments)) {
    const span = segment.out - segment.in;
    if (!(span > 0)) continue;

    const playMode = bakeSpeed ? segment.playMode : 'normal';
    const speed = bakeSpeed ? clampSpeed(segment.speed) : 1;

    if (playMode === 'freeze') {
      const holdSec = segment.freezeDurationSec ?? DEFAULT_FREEZE_SEC;
      const frameCount = Math.max(1, Math.round(holdSec * fps));
      for (let i = 0; i < frameCount; i += 1) {
        emit(segment.in);
      }
      continue;
    }

    const step = speed * frameDur;
    const frameCount = Math.max(1, Math.round(span / step));
    for (let i = 0; i < frameCount; i += 1) {
      const t =
        playMode === 'reverse'
          ? segment.out - (i + 0.5) * step
          : segment.in + (i + 0.5) * step;
      emit(Math.min(segment.out - OUT_EPSILON, Math.max(segment.in, t)));
    }
  }
  return plan;
}
