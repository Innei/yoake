import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GradeState, Segment } from '~/lib/fs/clipSidecar';

import type { EncodeProgress } from '../encodeGraded';
import { encodeGraded } from '../encodeGraded';
import { createMp4Writer } from '../mp4Writer';

interface FakeWriter {
  addAudioPacket: ReturnType<typeof vi.fn>;
  addFrame: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({
  writers: [] as FakeWriter[],
}));

vi.mock('../mp4Writer', () => ({
  createMp4Writer: vi.fn(async () => {
    const writer = {
      addAudioPacket: vi.fn(async () => undefined),
      addFrame: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      finalize: vi.fn(async () => undefined),
    };
    h.writers.push(writer);
    return writer;
  }),
}));

const WIDTH = 4;
const HEIGHT = 2;

function makeSegment(id: string, inSec: number, outSec: number): Segment {
  return { id, in: inSec, out: outSec, playMode: 'normal', speed: 1 };
}

function makeWritable() {
  return {
    abort: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
  } as unknown as FileSystemWritableFileStream;
}

function makeGrabFrame() {
  return vi.fn(
    async (_sourceTime: number, _effectiveGrade: GradeState | undefined) => ({
      height: HEIGHT,
      rgba: new Uint8Array(WIDTH * HEIGHT * 4),
      width: WIDTH,
    }),
  );
}

function baseOpts() {
  return {
    baseGrade: {},
    codec: 'avc' as const,
    duration: 0,
    fps: 1,
    grabFrame: makeGrabFrame(),
    height: HEIGHT,
    segments: [makeSegment('a', 0, 1)],
    width: WIDTH,
    writable: makeWritable(),
  };
}

function writer(): FakeWriter {
  return h.writers[0]!;
}

beforeEach(() => {
  h.writers.length = 0;
  vi.mocked(createMp4Writer).mockClear();
});

describe('encodeGraded', () => {
  it('rejects on invalid size, fps, or empty plan without creating a writer', async () => {
    await expect(
      encodeGraded({ ...baseOpts(), width: 0 }),
    ).rejects.toThrow(/invalid size/);
    await expect(encodeGraded({ ...baseOpts(), fps: 0 })).rejects.toThrow(
      /invalid fps/,
    );
    await expect(
      encodeGraded({ ...baseOpts(), segments: [] }),
    ).rejects.toThrow(/no frames/);
    expect(createMp4Writer).not.toHaveBeenCalled();
  });

  it('creates the writer with codec, fps, size and writable', async () => {
    const opts = baseOpts();
    await encodeGraded(opts);
    expect(createMp4Writer).toHaveBeenCalledWith({
      codec: 'avc',
      fps: 1,
      height: HEIGHT,
      width: WIDTH,
      writable: opts.writable,
    });
  });

  it('forwards the quality option to the writer', async () => {
    await encodeGraded({ ...baseOpts(), quality: 'very-high' });
    expect(createMp4Writer).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 'very-high' }),
    );
  });

  it('adds frames with sequential second timestamps and 1/fps duration', async () => {
    await encodeGraded({
      ...baseOpts(),
      duration: 1,
      fps: 4,
      segments: [],
    });

    const calls = writer().addFrame.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c[1])).toEqual([0, 0.25, 0.5, 0.75]);
    expect(calls.map((c) => c[2])).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('constructs RGBA VideoFrames with microsecond timestamps', async () => {
    await encodeGraded({
      ...baseOpts(),
      duration: 1,
      fps: 4,
      segments: [],
    });

    const frames = writer().addFrame.mock.calls.map(
      (c) => c[0] as { data: unknown; init: VideoFrameBufferInit },
    );
    for (const frame of frames) {
      expect(frame.init.format).toBe('RGBA');
      expect(frame.init.codedWidth).toBe(WIDTH);
      expect(frame.init.codedHeight).toBe(HEIGHT);
      expect(frame.init.duration).toBe(250_000);
      expect(frame.data).toBeInstanceOf(Uint8Array);
    }
    expect(frames.map((f) => f.init.timestamp)).toEqual([
      0, 250_000, 500_000, 750_000,
    ]);
  });

  it('passes the segment grade override merged over the base grade to grabFrame', async () => {
    const grab = makeGrabFrame();
    const segments: Segment[] = [
      makeSegment('a', 0, 1),
      { ...makeSegment('b', 1, 2), gradeOverride: { exposure: 1.5 } },
    ];
    await encodeGraded({
      ...baseOpts(),
      baseGrade: { exposure: 0 },
      grabFrame: grab,
      segments,
    });

    expect(grab).toHaveBeenCalledTimes(2);
    expect(grab.mock.calls[0]![1]).toEqual({ exposure: 0 });
    expect(grab.mock.calls[1]![1]).toEqual({ exposure: 1.5 });
  });

  it('rejects and cancels the writer when a grabbed frame has the wrong byte length', async () => {
    const grab = vi.fn(async () => ({
      height: HEIGHT,
      rgba: new Uint8Array(3),
      width: WIDTH,
    }));
    await expect(
      encodeGraded({ ...baseOpts(), grabFrame: grab }),
    ).rejects.toThrow(/unexpected size 3/);

    expect(writer().cancel).toHaveBeenCalledTimes(1);
    expect(writer().finalize).not.toHaveBeenCalled();
  });

  it('cancels the writer and rejects when aborted mid-loop', async () => {
    const controller = new AbortController();
    const grab = vi.fn(async () => {
      controller.abort();
      return {
        height: HEIGHT,
        rgba: new Uint8Array(WIDTH * HEIGHT * 4),
        width: WIDTH,
      };
    });

    await expect(
      encodeGraded({
        ...baseOpts(),
        grabFrame: grab,
        segments: [makeSegment('a', 0, 2)],
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    expect(grab).toHaveBeenCalledTimes(1);
    expect(writer().addFrame).not.toHaveBeenCalled();
    expect(writer().cancel).toHaveBeenCalledTimes(1);
    expect(writer().finalize).not.toHaveBeenCalled();
  });

  it('rejects before creating a writer when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      encodeGraded({ ...baseOpts(), signal: controller.signal }),
    ).rejects.toThrow();

    expect(createMp4Writer).not.toHaveBeenCalled();
  });

  it('cancels the writer and propagates the error when grabFrame rejects', async () => {
    const grab = vi.fn(async () => {
      throw new Error('grab failed');
    });

    await expect(
      encodeGraded({ ...baseOpts(), grabFrame: grab }),
    ).rejects.toThrow('grab failed');

    expect(writer().cancel).toHaveBeenCalledTimes(1);
    expect(writer().finalize).not.toHaveBeenCalled();
  });

  it('cancels the writer when addFrame rejects', async () => {
    const grab = vi.fn(async () => {
      writer().addFrame.mockRejectedValueOnce(new Error('encode failed'));
      return {
        height: HEIGHT,
        rgba: new Uint8Array(WIDTH * HEIGHT * 4),
        width: WIDTH,
      };
    });

    await expect(
      encodeGraded({ ...baseOpts(), grabFrame: grab }),
    ).rejects.toThrow('encode failed');

    expect(writer().cancel).toHaveBeenCalledTimes(1);
    expect(writer().finalize).not.toHaveBeenCalled();
  });

  it('cancels the writer and rethrows when finalize rejects', async () => {
    const grab = vi.fn(async () => {
      writer().finalize.mockRejectedValueOnce(new Error('finalize failed'));
      return {
        height: HEIGHT,
        rgba: new Uint8Array(WIDTH * HEIGHT * 4),
        width: WIDTH,
      };
    });

    await expect(
      encodeGraded({ ...baseOpts(), grabFrame: grab }),
    ).rejects.toThrow('finalize failed');

    expect(writer().finalize).toHaveBeenCalledTimes(1);
    expect(writer().cancel).toHaveBeenCalledTimes(1);
  });

  it('finalizes exactly once and never cancels on success', async () => {
    const result = await encodeGraded(baseOpts());

    expect(result).toEqual({ frameCount: 1 });
    expect(writer().finalize).toHaveBeenCalledTimes(1);
    expect(writer().cancel).not.toHaveBeenCalled();
  });

  it('reports plan, per-frame grab/encode, then finalize before writer.finalize resolves', async () => {
    const onProgress = vi.fn();
    await encodeGraded({
      ...baseOpts(),
      onProgress,
      segments: [makeSegment('a', 0, 2)],
    });

    const events = onProgress.mock.calls.map((c) => c[0] as EncodeProgress);
    expect(events).toEqual([
      { framesDone: 0, framesTotal: 2, phase: 'plan', ratio: 0 },
      {
        frameCurrent: 1,
        framesDone: 0,
        framesTotal: 2,
        phase: 'grab',
        ratio: 0,
      },
      { framesDone: 1, framesTotal: 2, phase: 'encode', ratio: 0.5 },
      {
        frameCurrent: 2,
        framesDone: 1,
        framesTotal: 2,
        phase: 'grab',
        ratio: 0.5,
      },
      { framesDone: 2, framesTotal: 2, phase: 'encode', ratio: 1 },
      { framesTotal: 2, phase: 'finalize', ratio: 1 },
    ]);
    expect(onProgress.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      writer().finalize.mock.invocationCallOrder[0]!,
    );
  });
});
