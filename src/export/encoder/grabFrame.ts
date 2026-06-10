/// <reference types="@webgpu/types" />

import { exportCurrentFrame } from '~/export/render';
import type { GradeState } from '~/fs/clipSidecar';
import type { GpuPipelines, GpuVideo } from '~/state/gpuStore';

export interface GrabFrameContext {
  bypassGrade?: boolean;
  device: GPUDevice;
  exposureBase: number;
  hdrPeakNits: number;
  hdrStrength: number;
  height: number;
  lut3d: GPUTexture;
  pipelines: GpuPipelines;
  video: GpuVideo;
  width: number;
}

export interface GrabbedFrame {
  height: number;
  rgba: Uint8Array;
  width: number;
}

export interface GrabFrameOptions {
  onStatus?: (status: string) => void;
}

interface ExtendedVideoElement extends HTMLVideoElement {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: VideoFrameCallbackMetadata) => void,
  ) => number;
}

interface VideoFrameCallbackMetadata {
  mediaTime: number;
  presentedFrames: number;
}

const FRAME_PRESENT_TIMEOUT_MS = 250;
const SEEK_TIMEOUT_MS = 5000;

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

function seekVideoTo(
  video: HTMLVideoElement,
  time: number,
  toleranceSec = 0.001,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) <= toleranceSec) {
      resolve(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `grabFrame: timed out seeking video to ${formatSeconds(time)}`,
        ),
      );
    }, SEEK_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve(true);
    };
    const onError = () => {
      cleanup();
      reject(new Error(`grabFrame: video seek to ${time}s failed`));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      video.currentTime = time;
    } catch (cause) {
      cleanup();
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  });
}

function awaitPresentedFrame(
  video: HTMLVideoElement,
  timeoutMs = FRAME_PRESENT_TIMEOUT_MS,
): Promise<void> {
  const extended = video as ExtendedVideoElement;
  if (typeof extended.requestVideoFrameCallback !== 'function') {
    return new Promise((resolve) => setTimeout(resolve, 32));
  }
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    // on a paused video the seek's presentation can happen before this
    // callback is registered, in which case rvfc never fires again
    timeoutId = window.setTimeout(finish, timeoutMs);
    extended.requestVideoFrameCallback!(() => finish());
  });
}

function resolveExposure(base: number, override: GradeState | undefined): number {
  if (!override) return base;
  return override.exposure ?? base;
}

let rawCanvas: HTMLCanvasElement | null = null;

function grabRawFrame(
  video: HTMLVideoElement,
  width: number,
  height: number,
): GrabbedFrame {
  rawCanvas ??= document.createElement('canvas');
  if (rawCanvas.width !== width) rawCanvas.width = width;
  if (rawCanvas.height !== height) rawCanvas.height = height;
  const ctx2d = rawCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx2d) {
    throw new Error('grabFrame: 2d canvas context unavailable');
  }
  ctx2d.drawImage(video, 0, 0, width, height);
  const image = ctx2d.getImageData(0, 0, width, height);
  return {
    width,
    height,
    rgba: new Uint8Array(image.data.buffer, 0, image.data.byteLength),
  };
}

export async function grabFrame(
  ctx: GrabFrameContext,
  sourceTime: number,
  effectiveGrade: GradeState | undefined,
  opts: GrabFrameOptions = {},
): Promise<GrabbedFrame> {
  const { video } = ctx;
  const videoEl = video.el;
  if (videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
    throw new Error('grabFrame: clip not loaded');
  }
  const sourceLabel = formatSeconds(sourceTime);
  opts.onStatus?.(`Seeking export video to ${sourceLabel}…`);
  const seeked = await seekVideoTo(videoEl, sourceTime);
  if (seeked) {
    opts.onStatus?.(`Waiting for decoded frame at ${sourceLabel}…`);
    await awaitPresentedFrame(videoEl);
  }

  if (ctx.bypassGrade) {
    opts.onStatus?.(`Reading raw export frame at ${sourceLabel}…`);
    return grabRawFrame(videoEl, ctx.width, ctx.height);
  }

  const exposure = resolveExposure(ctx.exposureBase, effectiveGrade);

  opts.onStatus?.(`Rendering export frame at ${sourceLabel}…`);
  const result = await exportCurrentFrame({
    device: ctx.device,
    sceneLinearPipeline: ctx.pipelines.sceneLinear,
    lutSdrPipeline: ctx.pipelines.lutSdrBase,
    hdrComposePipeline: ctx.pipelines.hdrCompose,
    getExternalTexture: ctx.video.getExternalTexture,
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
