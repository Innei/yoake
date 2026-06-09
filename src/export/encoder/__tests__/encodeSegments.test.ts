import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Segment } from '~/fs/clipSidecar';

import { encodeSegments } from '../encodeSegments';

function makeSegment(id: string, inSec: number, outSec: number): Segment {
  return { id, in: inSec, out: outSec, playMode: 'normal', speed: 1 };
}

function makeFakeFfmpeg() {
  const writeFile = vi.fn(async () => undefined);
  const exec = vi.fn(async () => 0);
  const readFile = vi.fn(async () => new Uint8Array([0xFF, 0xD8, 0xFF]));
  const deleteFile = vi.fn(async () => undefined);
  const on = vi.fn();
  const off = vi.fn();
  return {
    writeFile,
    exec,
    readFile,
    deleteFile,
    on,
    off,
  };
}

const WIDTH = 4;
const HEIGHT = 2;

function makeGrabFrame() {
  return vi.fn(async () => ({
    width: WIDTH,
    height: HEIGHT,
    rgba: new Uint8Array(WIDTH * HEIGHT * 4),
  }));
}

describe('encodeSegments', () => {
  let ff: ReturnType<typeof makeFakeFfmpeg>;

  beforeEach(() => {
    ff = makeFakeFfmpeg();
  });

  it('throws when no frames are planned', async () => {
    await expect(
      encodeSegments({
        baseGrade: {},
        duration: 0,
        exposureBase: 0,
        filename: 'out.mp4',
        fps: 30,
        getFfmpeg: async () => ff as never,
        grabFrame: makeGrabFrame(),
        height: HEIGHT,
        segments: [],
        width: WIDTH,
      }),
    ).rejects.toThrow(/no frames/);
  });

  it('writes raw frames + invokes libx264 with expected args', async () => {
    const grab = makeGrabFrame();
    const result = await encodeSegments({
      baseGrade: {},
      duration: 0,
      exposureBase: 0,
      filename: 'OUT.mp4',
      fps: 2,
      getFfmpeg: async () => ff as never,
      grabFrame: grab,
      height: HEIGHT,
      segments: [makeSegment('a', 0, 1)],
      width: WIDTH,
    });

    expect(grab).toHaveBeenCalledTimes(2);
    expect(ff.writeFile).toHaveBeenCalledTimes(1);
    const writeArgs = ff.writeFile.mock.calls[0]!;
    expect(writeArgs[0]).toBe('in.raw');
    expect((writeArgs[1] as Uint8Array).byteLength).toBe(WIDTH * HEIGHT * 4 * 2);

    expect(ff.exec).toHaveBeenCalledTimes(1);
    const execArgs = ff.exec.mock.calls[0]![0] as string[];
    expect(execArgs).toContain('-c:v');
    expect(execArgs).toContain('libx264');
    expect(execArgs).toContain('-pix_fmt');
    expect(execArgs).toContain('yuv420p');
    expect(execArgs).toContain('-s');
    expect(execArgs).toContain(`${WIDTH}x${HEIGHT}`);
    expect(execArgs).toContain('-r');
    expect(execArgs).toContain('2');
    expect(execArgs.at(-1)).toBe('OUT.mp4');

    expect(result.filename).toBe('OUT.mp4');
    expect(result.frameCount).toBe(2);
    expect(result.blob.type).toBe('video/mp4');
  });

  it('reports progress through the grab phase', async () => {
    const onProgress = vi.fn();
    await encodeSegments({
      baseGrade: {},
      duration: 0,
      exposureBase: 0,
      filename: 'out.mp4',
      fps: 1,
      getFfmpeg: async () => ff as never,
      grabFrame: makeGrabFrame(),
      height: HEIGHT,
      onProgress,
      segments: [makeSegment('a', 0, 2)],
      width: WIDTH,
    });
    const grabEvents = onProgress.mock.calls
      .map((c) => c[0] as { phase: string; ratio: number })
      .filter((e) => e.phase === 'grab');
    expect(grabEvents.length).toBeGreaterThan(0);
    expect(grabEvents.at(-1)!.ratio).toBe(1);
  });

  it('throws when ffmpeg exits non-zero', async () => {
    ff.exec = vi.fn(async () => 1);
    await expect(
      encodeSegments({
        baseGrade: {},
        duration: 0,
        exposureBase: 0,
        filename: 'out.mp4',
        fps: 1,
        getFfmpeg: async () => ff as never,
        grabFrame: makeGrabFrame(),
        height: HEIGHT,
        segments: [makeSegment('a', 0, 1)],
        width: WIDTH,
      }),
    ).rejects.toThrow(/exited with code 1/);
  });

  it('applies per-segment grade override via grabFrame call', async () => {
    const grab = vi.fn(async () => ({
      width: WIDTH,
      height: HEIGHT,
      rgba: new Uint8Array(WIDTH * HEIGHT * 4),
    }));
    const segments: Segment[] = [
      makeSegment('a', 0, 1),
      { ...makeSegment('b', 1, 2), gradeOverride: { exposure: 1.5 } },
    ];
    await encodeSegments({
      baseGrade: { exposure: 0 },
      duration: 0,
      exposureBase: 0,
      filename: 'out.mp4',
      fps: 1,
      getFfmpeg: async () => ff as never,
      grabFrame: grab,
      height: HEIGHT,
      segments,
      width: WIDTH,
    });
    const firstGrade = grab.mock.calls[0]![1];
    const secondGrade = grab.mock.calls[1]![1];
    expect(firstGrade).toEqual({ exposure: 0 });
    expect(secondGrade).toEqual({ exposure: 1.5 });
  });
});
