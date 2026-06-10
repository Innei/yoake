/// <reference types="@webgpu/types" />

import { exportCurrentFrame } from '~/export/render';
import type { GradeState } from '~/fs/clipSidecar';

import type {
  GrabbedFrame,
  GrabFrameContext,
  GrabFrameOptions,
} from '../grabFrame';

export type GrabFrameStreamContext = Omit<GrabFrameContext, 'video'> & {
  getFrameAt: (sourceTime: number) => Promise<VideoFrame>;
};

function resolveExposure(
  base: number,
  override: GradeState | undefined,
): number {
  if (!override) return base;
  return override.exposure ?? base;
}

let rawCanvas: HTMLCanvasElement | null = null;

function grabRawFrame(
  frame: VideoFrame,
  width: number,
  height: number,
): GrabbedFrame {
  rawCanvas ??= document.createElement('canvas');
  if (rawCanvas.width !== width) rawCanvas.width = width;
  if (rawCanvas.height !== height) rawCanvas.height = height;
  const ctx2d = rawCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx2d) {
    throw new Error('grabFrameStream: 2d canvas context unavailable');
  }
  ctx2d.drawImage(frame, 0, 0, width, height);
  const image = ctx2d.getImageData(0, 0, width, height);
  return {
    width,
    height,
    rgba: new Uint8Array(image.data.buffer, 0, image.data.byteLength),
  };
}

export async function grabFrameStream(
  ctx: GrabFrameStreamContext,
  sourceTime: number,
  effectiveGrade: GradeState | undefined,
  opts: GrabFrameOptions = {},
): Promise<GrabbedFrame> {
  const sourceLabel = `${sourceTime.toFixed(2)}s`;
  opts.onStatus?.(`Decoding frame at ${sourceLabel}…`);
  const frame = await ctx.getFrameAt(sourceTime);

  if (ctx.bypassGrade) {
    opts.onStatus?.(`Reading raw export frame at ${sourceLabel}…`);
    return grabRawFrame(frame, ctx.width, ctx.height);
  }

  const exposure = resolveExposure(ctx.exposureBase, effectiveGrade);

  opts.onStatus?.(`Rendering export frame at ${sourceLabel}…`);
  const result = await exportCurrentFrame({
    device: ctx.device,
    sceneLinearPipeline: ctx.pipelines.sceneLinear,
    lutSdrPipeline: ctx.pipelines.lutSdrBase,
    hdrComposePipeline: ctx.pipelines.hdrCompose,
    getExternalTexture: () => {
      try {
        return ctx.device.importExternalTexture({ source: frame });
      } catch {
        return null;
      }
    },
    hdrEnabled: false,
    hdrStrength: ctx.hdrStrength,
    lut3d: ctx.lut3d,
    exposure,
    peakNits: ctx.hdrPeakNits,
    width: ctx.width,
    height: ctx.height,
  });

  return {
    width: result.width,
    height: result.height,
    rgba: new Uint8Array(
      result.sdrBaseBytes.buffer,
      result.sdrBaseBytes.byteOffset,
      result.sdrBaseBytes.byteLength,
    ),
  };
}
