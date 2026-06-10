import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canUseDirectExport, encodeDirect } from '../encodeDirect';
import { createMp4Writer } from '../mp4Writer';
import {
  baseOpts,
  frameTimestamps,
  h,
  makeSegment,
  resetHarness,
  writer,
} from './encodeDirectHarness';

vi.mock('mediabunny', async () =>
  (await import('./encodeDirectHarness')).mediabunnyMockModule(),
);
vi.mock('../mp4Writer', async () =>
  (await import('./encodeDirectHarness')).mp4WriterMockModule(),
);

beforeEach(() => {
  resetHarness();
  vi.mocked(createMp4Writer).mockClear();
});

describe('canUseDirectExport', () => {
  it('allows ungraded source-resolution normal-speed exports', () => {
    expect(
      canUseDirectExport({
        bakeGrade: false,
        bakeSpeed: true,
        bakeTrim: true,
        resolution: 'source',
        segments: [makeSegment('a', 0, 1)],
      }),
    ).toBe(true);
  });

  it('rejects grade, scaling, and speed semantics that require rendering', () => {
    expect(
      canUseDirectExport({
        bakeGrade: true,
        bakeSpeed: true,
        bakeTrim: true,
        resolution: 'source',
        segments: [],
      }),
    ).toBe(false);
    expect(
      canUseDirectExport({
        bakeGrade: false,
        bakeSpeed: true,
        bakeTrim: true,
        resolution: '1080p',
        segments: [],
      }),
    ).toBe(false);
    expect(
      canUseDirectExport({
        bakeGrade: false,
        bakeSpeed: true,
        bakeTrim: true,
        resolution: 'source',
        segments: [{ ...makeSegment('a', 0, 1), playMode: 'reverse' }],
      }),
    ).toBe(false);
  });

  it('ignores segment speed when trim or speed is not baked', () => {
    const fast = { ...makeSegment('a', 0, 1), speed: 2 };
    expect(
      canUseDirectExport({
        bakeGrade: false,
        bakeSpeed: true,
        bakeTrim: false,
        resolution: 'source',
        segments: [fast],
      }),
    ).toBe(true);
    expect(
      canUseDirectExport({
        bakeGrade: false,
        bakeSpeed: false,
        bakeTrim: true,
        resolution: 'source',
        segments: [fast],
      }),
    ).toBe(true);
  });
});

describe('encodeDirect', () => {
  it('throws on a source without a video track', async () => {
    h.videoTrack = null;

    await expect(encodeDirect(baseOpts())).rejects.toThrow(/no video track/);
    expect(createMp4Writer).not.toHaveBeenCalled();
    expect(h.disposes[0]).toHaveBeenCalledTimes(1);
  });

  it('creates the writer from probed track dimensions and fps', async () => {
    const opts = baseOpts();
    await encodeDirect(opts);

    expect(createMp4Writer).toHaveBeenCalledWith({
      codec: 'avc',
      fps: 2,
      height: 1080,
      width: 1920,
      writable: opts.writable,
    });
  });

  it('forwards the quality option to the writer', async () => {
    await encodeDirect({ ...baseOpts(), quality: 'low' });

    expect(createMp4Writer).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 'low' }),
    );
  });

  it('exports the whole source when no segments are present', async () => {
    const result = await encodeDirect(baseOpts());

    expect(frameTimestamps()).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(result.frameCount).toBe(8);
    expect(h.disposes[0]).toHaveBeenCalledTimes(1);
  });

  it('exports the whole source when bakeTrim is false', async () => {
    await encodeDirect({
      ...baseOpts(),
      bakeTrim: false,
      segments: [makeSegment('a', 1, 2)],
    });

    expect(frameTimestamps()).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });

  it('shifts a single segment to start at zero', async () => {
    await encodeDirect({
      ...baseOpts(),
      segments: [makeSegment('a', 1, 2)],
    });

    expect(frameTimestamps()).toEqual([0, 0.5]);
    expect(writer().addFrame.mock.calls.map((c) => c[2])).toEqual([0.5, 0.5]);
  });

  it('concatenates sorted segments with seamless output timestamps', async () => {
    await encodeDirect({
      ...baseOpts(),
      segments: [makeSegment('b', 3, 4), makeSegment('a', 0, 1)],
    });

    expect(frameTimestamps()).toEqual([0, 0.5, 1, 1.5]);
    const frames = writer().addFrame.mock.calls.map(
      (c) => c[0] as { sourceTimestamp: number },
    );
    expect(frames.map((f) => f.sourceTimestamp)).toEqual([0, 0.5, 3, 3.5]);
  });

  it('clamps off-grid segment bounds on covering and straddling samples', async () => {
    await encodeDirect({
      ...baseOpts(),
      segments: [makeSegment('a', 0.75, 1.75)],
    });

    const calls = writer().addFrame.mock.calls;
    const frames = calls.map((c) => c[0] as { sourceTimestamp: number });
    expect(frames.map((f) => f.sourceTimestamp)).toEqual([0.5, 1, 1.5]);
    expect(calls.map((c) => c[1])).toEqual([0, 0.25, 0.75]);
    expect(calls.map((c) => c[2])).toEqual([0.25, 0.5, 0.25]);
  });

  it('closes each sample after converting it to a frame', async () => {
    await encodeDirect(baseOpts());

    expect(h.yieldedSamples).toHaveLength(8);
    for (const sample of h.yieldedSamples) {
      expect(sample.toVideoFrame).toHaveBeenCalledTimes(1);
      expect(sample.closed).toBe(true);
    }
  });

  it('reports encode progress as processed output duration and finalize at 1', async () => {
    const onProgress = vi.fn();
    await encodeDirect({
      ...baseOpts(),
      onProgress,
      segments: [makeSegment('a', 0, 2)],
    });

    const events = onProgress.mock.calls.map(
      (c) => c[0] as { phase: string; ratio: number },
    );
    expect(
      events.filter((e) => e.phase === 'encode').map((e) => e.ratio),
    ).toEqual([0.25, 0.5, 0.75, 1]);
    expect(events.at(-1)).toEqual({ phase: 'finalize', ratio: 1 });
  });

  it('rejects before creating a writer when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      encodeDirect({ ...baseOpts(), signal: controller.signal }),
    ).rejects.toThrow();

    expect(createMp4Writer).not.toHaveBeenCalled();
  });

  it('cancels the writer, closes yielded samples, and rejects when aborted mid-stream', async () => {
    const controller = new AbortController();
    await expect(
      encodeDirect({
        ...baseOpts(),
        onProgress: () => controller.abort(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    expect(writer().addFrame).toHaveBeenCalledTimes(1);
    expect(writer().cancel).toHaveBeenCalledTimes(1);
    expect(writer().finalize).not.toHaveBeenCalled();
    expect(h.disposes[0]).toHaveBeenCalledTimes(1);
    expect(h.yieldedSamples.length).toBeGreaterThan(1);
    for (const sample of h.yieldedSamples) {
      expect(sample.closed).toBe(true);
    }
  });

  it('cancels the writer and rethrows when addFrame rejects', async () => {
    vi.mocked(createMp4Writer).mockImplementationOnce(async () => {
      const failing = {
        addAudioPacket: vi.fn(async () => undefined),
        addFrame: vi.fn(async () => {
          throw new Error('encode failed');
        }),
        cancel: vi.fn(async () => undefined),
        finalize: vi.fn(async () => undefined),
      };
      h.writers.push(failing);
      return failing;
    });

    await expect(encodeDirect(baseOpts())).rejects.toThrow('encode failed');

    expect(writer().cancel).toHaveBeenCalledTimes(1);
    expect(writer().finalize).not.toHaveBeenCalled();
    for (const sample of h.yieldedSamples) {
      expect(sample.closed).toBe(true);
    }
  });

  it('cancels the writer and rethrows when finalize rejects', async () => {
    vi.mocked(createMp4Writer).mockImplementationOnce(async () => {
      const failing = {
        addAudioPacket: vi.fn(async () => undefined),
        addFrame: vi.fn(async () => undefined),
        cancel: vi.fn(async () => undefined),
        finalize: vi.fn(async () => {
          throw new Error('finalize failed');
        }),
      };
      h.writers.push(failing);
      return failing;
    });

    await expect(encodeDirect(baseOpts())).rejects.toThrow('finalize failed');

    expect(writer().finalize).toHaveBeenCalledTimes(1);
    expect(writer().cancel).toHaveBeenCalledTimes(1);
  });

  it('finalizes exactly once and never cancels on success', async () => {
    await encodeDirect(baseOpts());

    expect(writer().finalize).toHaveBeenCalledTimes(1);
    expect(writer().cancel).not.toHaveBeenCalled();
  });

  it('rejects timeline semantics outside the direct-export envelope', async () => {
    await expect(
      encodeDirect({
        ...baseOpts(),
        segments: [{ ...makeSegment('a', 0, 1), playMode: 'reverse' }],
      }),
    ).rejects.toThrow(/unsupported timeline semantics/);
    expect(createMp4Writer).not.toHaveBeenCalled();
  });
});
