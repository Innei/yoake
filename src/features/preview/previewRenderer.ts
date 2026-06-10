/// <reference types="@webgpu/types" />

import type { RefObject } from 'react';

import type { GainmapPipeline } from '~/lib/gpu/pipelines/gainmap';
import type { HdrComposePipeline } from '~/lib/gpu/pipelines/hdrCompose';
import type { LutSdrBasePipeline } from '~/lib/gpu/pipelines/lutSdrBase';
import type { RawDlogPreviewPipeline } from '~/lib/gpu/pipelines/rawDlogPreview';
import type { SceneLinearPipeline } from '~/lib/gpu/pipelines/sceneLinear';
import type { ParsedLut, RenderMode } from '~/types';

export const MAX_PREVIEW_WIDTH = 1920;
export const MAX_PREVIEW_HEIGHT = 1080;

export interface GpuResources {
  context: GPUCanvasContext;
  device: GPUDevice;
  exposureBuf: GPUBuffer;
  gainmap: GainmapPipeline;
  hdrCompose: HdrComposePipeline;
  hdrReady: boolean;
  lutSdrBase: LutSdrBasePipeline;
  peakHeadroomBuf: GPUBuffer;
  rawDlogPreview: RawDlogPreviewPipeline;
  sceneLinear: SceneLinearPipeline;
  sdrHeadroomBuf: GPUBuffer;
}

export interface IntermediateTextures {
  height: number;
  sceneLinear: GPUTexture;
  sdrBase: GPUTexture;
  width: number;
}

function fitPreviewSize(srcW: number, srcH: number): { height: number; width: number } {
  if (srcW <= 0 || srcH <= 0) {
    return { width: MAX_PREVIEW_WIDTH, height: MAX_PREVIEW_HEIGHT };
  }
  const scale = Math.min(
    1,
    MAX_PREVIEW_WIDTH / srcW,
    MAX_PREVIEW_HEIGHT / srcH,
  );
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}

function createIntermediates(
  device: GPUDevice,
  width: number,
  height: number,
): IntermediateTextures {
  const sceneLinear = device.createTexture({
    label: 'preview.sceneLinear',
    size: { width, height },
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const sdrBase = device.createTexture({
    label: 'preview.sdrBase',
    size: { width, height },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  return { sceneLinear, sdrBase, width, height };
}

interface RenderArgs {
  canvas: HTMLCanvasElement;
  gpu: GpuResources;
  hdrEnabled: boolean;
  intermediatesRef: RefObject<IntermediateTextures | null>;
  lutTexture: GPUTexture | null;
  parsedLut: ParsedLut | undefined;
  renderMode: RenderMode;
  video: HTMLVideoElement;
}

export function renderFrame(args: RenderArgs): void {
  const { gpu, video, canvas, intermediatesRef, lutTexture, parsedLut } = args;
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (srcW === 0 || srcH === 0) return;

  const { width, height } = fitPreviewSize(srcW, srcH);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  let externalTexture: GPUExternalTexture;
  try {
    externalTexture = gpu.device.importExternalTexture({ source: video });
  } catch {
    return;
  }

  const encoder = gpu.device.createCommandEncoder({ label: 'preview.encoder' });
  const canvasView = gpu.context.getCurrentTexture().createView();

  if (args.renderMode === 'original' || !parsedLut || !lutTexture) {
    gpu.rawDlogPreview.run(externalTexture, canvasView, encoder);
    gpu.device.queue.submit([encoder.finish()]);
    return;
  }

  let intermediates = intermediatesRef.current;
  if (!intermediates || intermediates.width !== width || intermediates.height !== height) {
    intermediates?.sceneLinear.destroy();
    intermediates?.sdrBase.destroy();
    intermediates = createIntermediates(gpu.device, width, height);
    intermediatesRef.current = intermediates;
  }

  gpu.sceneLinear.run(externalTexture, intermediates.sceneLinear.createView(), encoder);
  gpu.lutSdrBase.run(
    intermediates.sceneLinear,
    lutTexture,
    gpu.exposureBuf,
    intermediates.sdrBase.createView(),
    encoder,
  );

  const composeHeadroomBuf = gpu.hdrReady && args.hdrEnabled
    ? gpu.peakHeadroomBuf
    : gpu.sdrHeadroomBuf;

  gpu.hdrCompose.run(
    intermediates.sdrBase,
    intermediates.sceneLinear,
    composeHeadroomBuf,
    canvasView,
    encoder,
  );
  gpu.device.queue.submit([encoder.finish()]);
}
