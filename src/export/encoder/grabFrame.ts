/// <reference types="@webgpu/types" />

import { exportCurrentFrame } from '~/export/render';
import type { GradeState } from '~/fs/clipSidecar';
import type { GpuPipelines, GpuVideo } from '~/state/gpuStore';

export interface GrabFrameContext {
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

interface ExtendedVideoElement extends HTMLVideoElement {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: VideoFrameCallbackMetadata) => void,
  ) => number;
}

interface VideoFrameCallbackMetadata {
  mediaTime: number;
  presentedFrames: number;
}

function seekVideoTo(
  video: HTMLVideoElement,
  time: number,
  toleranceSec = 0.001,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) <= toleranceSec) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error(`grabFrame: video seek to ${time}s failed`));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      video.currentTime = time;
    } catch (cause) {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  });
}

function awaitNextVideoFrame(video: HTMLVideoElement): Promise<void> {
  const extended = video as ExtendedVideoElement;
  if (typeof extended.requestVideoFrameCallback === 'function') {
    return new Promise((resolve) => {
      extended.requestVideoFrameCallback!(() => resolve());
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 16));
}

function resolveExposure(base: number, override: GradeState | undefined): number {
  if (!override) return base;
  return override.exposure ?? base;
}

export async function grabFrame(
  ctx: GrabFrameContext,
  sourceTime: number,
  effectiveGrade: GradeState | undefined,
): Promise<GrabbedFrame> {
  const { video } = ctx;
  const videoEl = video.el;
  if (videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
    throw new Error('grabFrame: clip not loaded');
  }
  await seekVideoTo(videoEl, sourceTime);
  await awaitNextVideoFrame(videoEl);

  const exposure = resolveExposure(ctx.exposureBase, effectiveGrade);

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
