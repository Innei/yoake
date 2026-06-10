import { describe, expect, it } from 'vitest';

import type { Segment } from '~/lib/fs/clipSidecar';

import { buildFramePlan } from '../frameSource';

function seg(id: string, inSec: number, outSec: number): Segment {
  return { id, in: inSec, out: outSec, playMode: 'normal', speed: 1 };
}

describe('buildFramePlan', () => {
  it('returns empty plan when fps is zero', () => {
    expect(buildFramePlan({ duration: 10, fps: 0, segments: [] })).toEqual([]);
  });

  it('covers full duration when no segments are provided', () => {
    const plan = buildFramePlan({ duration: 1, fps: 4, segments: [] });
    expect(plan).toHaveLength(4);
    expect(plan[0]!.outputFrameIndex).toBe(0);
    expect(plan.at(-1)!.outputFrameIndex).toBe(3);
    expect(plan[0]!.sourceTime).toBeGreaterThan(0);
    expect(plan.at(-1)!.sourceTime).toBeLessThan(1);
  });

  it('emits contiguous output frame indices across multiple segments', () => {
    const plan = buildFramePlan({
      duration: 10,
      fps: 2,
      segments: [seg('a', 0, 1), seg('b', 2, 3)],
    });
    expect(plan.map((f) => f.outputFrameIndex)).toEqual([0, 1, 2, 3]);
    expect(plan.slice(0, 2).every((f) => f.sourceTime >= 0 && f.sourceTime <= 1)).toBe(true);
    expect(plan.slice(2).every((f) => f.sourceTime >= 2 && f.sourceTime <= 3)).toBe(true);
  });

  it('orders segments by in-time before emission', () => {
    const plan = buildFramePlan({
      duration: 10,
      fps: 1,
      segments: [seg('b', 4, 5), seg('a', 1, 2)],
    });
    expect(plan).toHaveLength(2);
    expect(plan[0]!.sourceTime).toBeGreaterThanOrEqual(1);
    expect(plan[0]!.sourceTime).toBeLessThanOrEqual(2);
    expect(plan[1]!.sourceTime).toBeGreaterThanOrEqual(4);
    expect(plan[1]!.sourceTime).toBeLessThanOrEqual(5);
  });

  it('skips zero-length ranges', () => {
    const plan = buildFramePlan({
      duration: 5,
      fps: 4,
      segments: [seg('a', 0, 0), seg('b', 1, 2)],
    });
    expect(plan.every((f) => f.sourceTime >= 1 && f.sourceTime <= 2)).toBe(true);
    expect(plan).toHaveLength(4);
  });

  it('halves frame count at 2x speed', () => {
    const plan = buildFramePlan({
      duration: 10,
      fps: 4,
      segments: [{ ...seg('a', 0, 2), speed: 2 }],
    });
    expect(plan).toHaveLength(4);
    expect(plan.at(-1)!.sourceTime).toBeGreaterThan(1.5);
  });

  it('doubles frame count at 0.5x speed', () => {
    const plan = buildFramePlan({
      duration: 10,
      fps: 4,
      segments: [{ ...seg('a', 0, 2), speed: 0.5 }],
    });
    expect(plan).toHaveLength(16);
  });

  it('emits decreasing source times for reverse segments', () => {
    const plan = buildFramePlan({
      duration: 10,
      fps: 4,
      segments: [{ ...seg('a', 1, 3), playMode: 'reverse' }],
    });
    expect(plan).toHaveLength(8);
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i]!.sourceTime).toBeLessThan(plan[i - 1]!.sourceTime);
    }
    expect(plan[0]!.sourceTime).toBeLessThan(3);
    expect(plan.at(-1)!.sourceTime).toBeGreaterThanOrEqual(1);
  });

  it('holds the in-frame for the freeze duration', () => {
    const plan = buildFramePlan({
      duration: 10,
      fps: 4,
      segments: [
        { ...seg('a', 1, 3), playMode: 'freeze', freezeDurationSec: 1.5 },
      ],
    });
    expect(plan).toHaveLength(6);
    expect(plan.every((f) => f.sourceTime === 1)).toBe(true);
  });

  it('ignores speed and playMode when bakeSpeed is false', () => {
    const plan = buildFramePlan({
      bakeSpeed: false,
      duration: 10,
      fps: 4,
      segments: [
        { ...seg('a', 0, 2), playMode: 'reverse', speed: 2 },
      ],
    });
    expect(plan).toHaveLength(8);
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i]!.sourceTime).toBeGreaterThan(plan[i - 1]!.sourceTime);
    }
  });
});
