import { describe, expect, it } from 'vitest';

import type { Segment } from '~/fs/clipSidecar';

import {
  decidePreviewCutTick,
  type PreviewCutCursor,
} from '../previewCutPlayback';

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg',
    in: 0,
    out: 1,
    playMode: 'normal',
    speed: 1,
    ...overrides,
  };
}

const emptyCursor: PreviewCutCursor = {};

describe('decidePreviewCutTick', () => {
  it('returns pass when segments is empty', () => {
    const decision = decidePreviewCutTick({
      currentTime: 1,
      dtSec: 1 / 30,
      nowMs: 0,
      segments: [],
      cursor: emptyCursor,
    });
    expect(decision).toEqual({ kind: 'pass' });
  });

  it('jumps to next segment.in when current time is in a discard area', () => {
    const segments = [
      makeSegment({ id: 'a', in: 2, out: 4 }),
      makeSegment({ id: 'b', in: 6, out: 8 }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 1,
      dtSec: 1 / 30,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') expect(decision.sourceTime).toBe(2);
  });

  it('jumps from gap between segments to next segment.in', () => {
    const segments = [
      makeSegment({ id: 'a', in: 0, out: 1 }),
      makeSegment({ id: 'b', in: 3, out: 4 }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 2,
      dtSec: 1 / 30,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') expect(decision.sourceTime).toBe(3);
  });

  it('pauses when past the last segment with no next', () => {
    const segments = [makeSegment({ id: 'a', in: 1, out: 2 })];
    const decision = decidePreviewCutTick({
      currentTime: 5,
      dtSec: 1 / 30,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('pause');
  });

  it('advances by dt * speed inside a normal segment (speed 2)', () => {
    const segments = [
      makeSegment({ id: 'a', in: 0, out: 10, playMode: 'normal', speed: 2 }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 1,
      dtSec: 0.5,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') {
      expect(decision.sourceTime).toBeCloseTo(2, 6);
    }
  });

  it('advances by dt inside a normal segment (speed 1, default)', () => {
    const segments = [
      makeSegment({ id: 'a', in: 0, out: 10, playMode: 'normal', speed: 1 }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 3,
      dtSec: 1 / 30,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') {
      expect(decision.sourceTime).toBeCloseTo(3 + 1 / 30, 6);
    }
  });

  it('reverse segment advances FORWARD at |speed| (MVP deferral)', () => {
    const segments = [
      makeSegment({ id: 'a', in: 0, out: 10, playMode: 'reverse', speed: 1 }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 4,
      dtSec: 0.25,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') {
      expect(decision.sourceTime).toBeCloseTo(4.25, 6);
    }
  });

  it('freeze segment pins source time and records freezeEnteredAtMs on first tick', () => {
    const segments = [
      makeSegment({
        id: 'fz',
        in: 2,
        out: 2.001,
        playMode: 'freeze',
        speed: 1,
        freezeDurationSec: 2,
      }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 2,
      dtSec: 1 / 30,
      nowMs: 1000,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') {
      expect(decision.sourceTime).toBe(2);
      expect(decision.cursorUpdate?.freezeEnteredAtMs).toBe(1000);
      expect(decision.cursorUpdate?.freezeSegmentId).toBe('fz');
    }
  });

  it('freeze segment remains pinned while wall clock < freezeDurationSec', () => {
    const segments = [
      makeSegment({
        id: 'fz',
        in: 2,
        out: 2.001,
        playMode: 'freeze',
        speed: 1,
        freezeDurationSec: 2,
      }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 2,
      dtSec: 1 / 30,
      nowMs: 1500,
      segments,
      cursor: { freezeEnteredAtMs: 1000, freezeSegmentId: 'fz' },
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') expect(decision.sourceTime).toBe(2);
  });

  it('freeze segment exits to next segment.in after freezeDurationSec elapsed', () => {
    const segments = [
      makeSegment({
        id: 'fz',
        in: 2,
        out: 2.001,
        playMode: 'freeze',
        speed: 1,
        freezeDurationSec: 2,
      }),
      makeSegment({ id: 'next', in: 5, out: 7, playMode: 'normal', speed: 1 }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 2,
      dtSec: 1 / 30,
      nowMs: 3000,
      segments,
      cursor: { freezeEnteredAtMs: 1000, freezeSegmentId: 'fz' },
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') {
      expect(decision.sourceTime).toBe(5);
      expect(decision.cursorUpdate?.freezeEnteredAtMs).toBeUndefined();
    }
  });

  it('freeze segment pauses when elapsed and no next segment exists', () => {
    const segments = [
      makeSegment({
        id: 'fz',
        in: 2,
        out: 2.001,
        playMode: 'freeze',
        speed: 1,
        freezeDurationSec: 2,
      }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 2,
      dtSec: 1 / 30,
      nowMs: 3000,
      segments,
      cursor: { freezeEnteredAtMs: 1000, freezeSegmentId: 'fz' },
    });
    expect(decision.kind).toBe('pause');
  });

  it('jumps to next segment when crossing segment.out on a normal tick', () => {
    const segments = [
      makeSegment({ id: 'a', in: 0, out: 3, playMode: 'normal', speed: 1 }),
      makeSegment({ id: 'b', in: 6, out: 8, playMode: 'normal', speed: 1 }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 2.95,
      dtSec: 0.2,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') expect(decision.sourceTime).toBe(6);
  });

  it('pauses when crossing segment.out with no next segment', () => {
    const segments = [
      makeSegment({ id: 'a', in: 0, out: 3, playMode: 'normal', speed: 1 }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 2.95,
      dtSec: 0.2,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decision.kind).toBe('pause');
  });

  it('cumulative source advance under speed=1 equals N * dt (no double-step)', () => {
    const segments = [
      makeSegment({ id: 'a', in: 0, out: 100, playMode: 'normal', speed: 1 }),
    ];
    const dt = 1 / 30;
    let driven = 0;
    let cursor: PreviewCutCursor = {};
    for (let i = 0; i < 10; i++) {
      const decision = decidePreviewCutTick({
        currentTime: driven,
        dtSec: dt,
        nowMs: i * dt * 1000,
        segments,
        cursor,
      });
      expect(decision.kind).toBe('advance');
      if (decision.kind === 'advance') {
        driven = decision.sourceTime;
        cursor = decision.cursorUpdate ?? {};
      }
    }
    expect(driven).toBeCloseTo(10 * dt, 6);
  });

  it('cumulative source advance under speed=2 equals N * 2 * dt', () => {
    const segments = [
      makeSegment({ id: 'a', in: 0, out: 100, playMode: 'normal', speed: 2 }),
    ];
    const dt = 1 / 30;
    let driven = 0;
    let cursor: PreviewCutCursor = {};
    for (let i = 0; i < 10; i++) {
      const decision = decidePreviewCutTick({
        currentTime: driven,
        dtSec: dt,
        nowMs: i * dt * 1000,
        segments,
        cursor,
      });
      if (decision.kind === 'advance') {
        driven = decision.sourceTime;
        cursor = decision.cursorUpdate ?? {};
      }
    }
    expect(driven).toBeCloseTo(10 * 2 * dt, 6);
  });

  it('freeze segment carries isFreezing hint while pinned', () => {
    const segments = [
      makeSegment({
        id: 'fz',
        in: 2,
        out: 2.001,
        playMode: 'freeze',
        speed: 1,
        freezeDurationSec: 2,
      }),
    ];
    const decision = decidePreviewCutTick({
      currentTime: 2,
      dtSec: 1 / 30,
      nowMs: 1500,
      segments,
      cursor: { freezeEnteredAtMs: 1000, freezeSegmentId: 'fz' },
    });
    expect(decision.kind).toBe('advance');
    if (decision.kind === 'advance') {
      expect(decision.isFreezing).toBe(true);
    }
  });

  it('binary search: containing segment lookup works across many segments', () => {
    const segments: Segment[] = [];
    for (let i = 0; i < 50; i++) {
      segments.push(makeSegment({ id: `s${i}`, in: i * 10, out: i * 10 + 5 }));
    }
    const decisionGap = decidePreviewCutTick({
      currentTime: 327,
      dtSec: 1 / 30,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decisionGap.kind).toBe('advance');
    if (decisionGap.kind === 'advance') {
      expect(decisionGap.sourceTime).toBe(330);
    }
    const decisionIn = decidePreviewCutTick({
      currentTime: 322,
      dtSec: 1 / 30,
      nowMs: 0,
      segments,
      cursor: emptyCursor,
    });
    expect(decisionIn.kind).toBe('advance');
    if (decisionIn.kind === 'advance') {
      expect(decisionIn.sourceTime).toBeCloseTo(322 + 1 / 30, 6);
    }
  });
});
