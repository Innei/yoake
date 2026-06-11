import { describe, expect, it } from 'vitest';

import type { Segment } from '~/lib/fs/clipSidecar';

import { clampSegmentRange } from '../segmentRange';

function seg(inSec: number, outSec: number): Segment {
  return {
    id: `seg-${inSec}-${outSec}`,
    in: inSec,
    out: outSec,
    playMode: 'normal',
    speed: 1,
  };
}

describe('clampSegmentRange', () => {
  it('returns the range untouched when nothing overlaps', () => {
    expect(clampSegmentRange(2, 12, 60, [])).toEqual({ in: 2, out: 12 });
  });

  it('clamps lo to 0 and hi to duration', () => {
    expect(clampSegmentRange(-5, 5, 60, [])).toEqual({ in: 0, out: 5 });
    expect(clampSegmentRange(55, 65, 60, [])).toEqual({ in: 55, out: 60 });
  });

  it('returns undefined when the clamped range collapses', () => {
    expect(clampSegmentRange(-10, 0, 60, [])).toBeUndefined();
    expect(clampSegmentRange(60, 70, 60, [])).toBeUndefined();
  });

  it('uses hi as the upper bound when duration is unknown', () => {
    expect(clampSegmentRange(2, 12, 0, [])).toEqual({ in: 2, out: 12 });
  });

  it('shrinks the end against a segment on the right', () => {
    expect(clampSegmentRange(2, 12, 60, [seg(8, 20)])).toEqual({
      in: 2,
      out: 8,
    });
  });

  it('shrinks the start against a segment on the left', () => {
    expect(clampSegmentRange(2, 12, 60, [seg(0, 5)])).toEqual({
      in: 5,
      out: 12,
    });
  });

  it('shrinks against segments on both sides', () => {
    expect(clampSegmentRange(2, 12, 60, [seg(0, 4), seg(10, 20)])).toEqual({
      in: 4,
      out: 10,
    });
  });

  it('returns undefined when an existing segment covers the range', () => {
    expect(clampSegmentRange(2, 12, 60, [seg(0, 20)])).toBeUndefined();
  });

  it('returns undefined when shrinking leaves no room', () => {
    expect(clampSegmentRange(2, 12, 60, [seg(0, 7), seg(7, 20)])).toBeUndefined();
  });

  it('ignores segments that do not overlap', () => {
    expect(
      clampSegmentRange(10, 20, 60, [seg(0, 10), seg(20, 30)]),
    ).toEqual({ in: 10, out: 20 });
  });
});
