import type { Segment } from '~/fs/clipSidecar';

export interface FramePlan {
  outputFrameIndex: number;
  sourceTime: number;
}

export interface BuildFramePlanOptions {
  duration: number;
  fps: number;
  segments: readonly Segment[];
}

function sortKeepSegments(segments: readonly Segment[]): Segment[] {
  return [...segments].sort((a, b) => a.in - b.in);
}

export function buildFramePlan(opts: BuildFramePlanOptions): FramePlan[] {
  const { duration, fps, segments } = opts;
  if (!(fps > 0)) return [];
  const frameDur = 1 / fps;

  const ranges: { in: number; out: number }[] =
    segments.length === 0
      ? duration > 0
        ? [{ in: 0, out: duration }]
        : []
      : sortKeepSegments(segments).map((s) => ({ in: s.in, out: s.out }));

  const plan: FramePlan[] = [];
  let outIdx = 0;
  for (const range of ranges) {
    const span = range.out - range.in;
    if (!(span > 0)) continue;
    const frameCount = Math.max(1, Math.round(span * fps));
    for (let i = 0; i < frameCount; i += 1) {
      const t = range.in + (i + 0.5) * frameDur;
      const clamped = Math.min(range.out - 1e-6, Math.max(range.in, t));
      plan.push({ sourceTime: clamped, outputFrameIndex: outIdx });
      outIdx += 1;
    }
  }
  return plan;
}
