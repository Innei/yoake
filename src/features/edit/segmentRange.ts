import type { Segment } from '~/lib/fs/clipSidecar';

export interface SegmentRange {
  in: number;
  out: number;
}

export function clampSegmentRange(
  lo: number,
  hi: number,
  duration: number,
  segments: readonly Segment[],
): SegmentRange | undefined {
  const maxOut = duration > 0 ? duration : hi;
  let inSec = Math.max(0, lo);
  let outSec = Math.min(maxOut, hi);
  if (!(outSec > inSec)) return undefined;

  const sorted = [...segments].sort((a, b) => a.in - b.in);
  for (const seg of sorted) {
    if (seg.out <= inSec) continue;
    if (seg.in >= outSec) break;
    if (seg.in <= inSec && seg.out >= outSec) return undefined;
    if (inSec < seg.in && outSec > seg.in) outSec = seg.in;
    if (outSec > seg.out && inSec < seg.out) inSec = seg.out;
    if (!(outSec > inSec)) return undefined;
  }
  return { in: inSec, out: outSec };
}
