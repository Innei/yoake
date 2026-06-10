import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExportFrameParams } from '~/lib/export/render';
import { exportCurrentFrame } from '~/lib/export/render';
import type { GpuPipelines } from '~/lib/gpu/types';

import type { GrabFrameStreamContext } from '../grabFrameStream';
import { grabFrameStream } from '../grabFrameStream';

vi.mock('~/lib/export/render', () => ({
  exportCurrentFrame: vi.fn(),
}));

const WIDTH = 4;
const HEIGHT = 2;

const fakeCtx2d = {
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(7),
  })),
};

const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => fakeCtx2d),
};

function makeFrame(): VideoFrame {
  return { close: vi.fn() } as unknown as VideoFrame;
}

function makeContext(
  frame: VideoFrame,
  overrides: Partial<GrabFrameStreamContext> = {},
): GrabFrameStreamContext & {
  device: { importExternalTexture: ReturnType<typeof vi.fn> };
} {
  const device = {
    importExternalTexture: vi.fn(() => ({ kind: 'external' })),
  };
  return {
    device: device as unknown as GPUDevice,
    exposureBase: 0.5,
    getFrameAt: vi.fn(async () => frame),
    hdrPeakNits: 1000,
    hdrStrength: 0.8,
    height: HEIGHT,
    lut3d: { lut: true } as unknown as GPUTexture,
    pipelines: {
      gainmap: {},
      hdrCompose: {},
      lutSdrBase: {},
      sceneLinear: {},
    } as unknown as GpuPipelines,
    width: WIDTH,
    ...overrides,
  } as GrabFrameStreamContext & {
    device: { importExternalTexture: ReturnType<typeof vi.fn> };
  };
}

const exportCurrentFrameMock = vi.mocked(exportCurrentFrame);

beforeEach(() => {
  exportCurrentFrameMock.mockReset();
  exportCurrentFrameMock.mockImplementation(async (params) => ({
    hdrLinearF32: null,
    height: params.height,
    meta: { peakNits: params.peakNits },
    sdrBaseBytes: new Uint8ClampedArray(params.width * params.height * 4),
    width: params.width,
  }));
  fakeCtx2d.drawImage.mockClear();
  fakeCtx2d.getImageData.mockClear();
  vi.spyOn(document, 'createElement').mockReturnValue(
    fakeCanvas as unknown as HTMLCanvasElement,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('grabFrameStream', () => {
  it('renders the graded frame, passing exposure overrides and hdr settings through', async () => {
    const frame = makeFrame();
    const ctx = makeContext(frame);

    const grabbed = await grabFrameStream(ctx, 1.25, { exposure: 2 });

    expect(ctx.getFrameAt).toHaveBeenCalledWith(1.25);
    expect(exportCurrentFrameMock).toHaveBeenCalledTimes(1);
    const params = exportCurrentFrameMock.mock
      .calls[0]![0] as ExportFrameParams;
    expect(params.exposure).toBe(2);
    expect(params.peakNits).toBe(1000);
    expect(params.hdrStrength).toBe(0.8);
    expect(params.hdrEnabled).toBe(false);
    expect(params.lut3d).toBe(ctx.lut3d);
    expect(grabbed.width).toBe(WIDTH);
    expect(grabbed.height).toBe(HEIGHT);
    expect(grabbed.rgba.byteLength).toBe(WIDTH * HEIGHT * 4);
  });

  it('falls back to the base exposure without a grade override', async () => {
    const ctx = makeContext(makeFrame());

    await grabFrameStream(ctx, 0.5, undefined);
    await grabFrameStream(ctx, 0.5, {});

    const first = exportCurrentFrameMock.mock.calls[0]![0] as ExportFrameParams;
    const second = exportCurrentFrameMock.mock
      .calls[1]![0] as ExportFrameParams;
    expect(first.exposure).toBe(0.5);
    expect(second.exposure).toBe(0.5);
  });

  it('imports the decoded frame as an external texture lazily', async () => {
    const frame = makeFrame();
    const ctx = makeContext(frame);

    await grabFrameStream(ctx, 0, undefined);

    const params = exportCurrentFrameMock.mock
      .calls[0]![0] as ExportFrameParams;
    expect(ctx.device.importExternalTexture).not.toHaveBeenCalled();
    const texture = params.getExternalTexture();
    expect(ctx.device.importExternalTexture).toHaveBeenCalledWith({
      source: frame,
    });
    expect(texture).toEqual({ kind: 'external' });
  });

  it('returns null from the external-texture closure when import throws', async () => {
    const ctx = makeContext(makeFrame());
    ctx.device.importExternalTexture.mockImplementation(() => {
      throw new Error('device lost');
    });

    await grabFrameStream(ctx, 0, undefined);

    const params = exportCurrentFrameMock.mock
      .calls[0]![0] as ExportFrameParams;
    expect(params.getExternalTexture()).toBeNull();
  });

  it('draws the frame to a 2d canvas on the bypassGrade path', async () => {
    const frame = makeFrame();
    const ctx = makeContext(frame, { bypassGrade: true });

    const grabbed = await grabFrameStream(ctx, 0.75, { exposure: 3 });

    expect(exportCurrentFrameMock).not.toHaveBeenCalled();
    expect(fakeCanvas.width).toBe(WIDTH);
    expect(fakeCanvas.height).toBe(HEIGHT);
    expect(fakeCtx2d.drawImage).toHaveBeenCalledWith(
      frame,
      0,
      0,
      WIDTH,
      HEIGHT,
    );
    expect(grabbed.rgba.byteLength).toBe(WIDTH * HEIGHT * 4);
    expect(grabbed.rgba[0]).toBe(7);
  });

  it('does not close the borrowed frame', async () => {
    const frame = makeFrame();

    await grabFrameStream(makeContext(frame), 0, undefined);
    await grabFrameStream(makeContext(frame, { bypassGrade: true }), 0, undefined);

    expect(
      (frame as unknown as { close: ReturnType<typeof vi.fn> }).close,
    ).not.toHaveBeenCalled();
  });
});
