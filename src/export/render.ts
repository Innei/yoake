/// <reference types="@webgpu/types" />

import type { HdrComposePipeline } from '~/gpu/pipelines/hdrCompose';
import type { LutSdrBasePipeline } from '~/gpu/pipelines/lutSdrBase';
import type { SceneLinearPipeline } from '~/gpu/pipelines/sceneLinear';

export interface ExportFrameMeta {
  peakNits: number;
}

export interface ExportFrameResult {
  hdrLinearF32: Float32Array | null;
  height: number;
  meta: ExportFrameMeta;
  sdrBaseBytes: Uint8ClampedArray;
  width: number;
}

export interface ExportFrameParams {
  device: GPUDevice;
  exposure: number;
  getExternalTexture: () => GPUExternalTexture | null;
  hdrComposePipeline: HdrComposePipeline;
  hdrEnabled: boolean;
  hdrStrength: number;
  height: number;
  lut3d: GPUTexture;
  lutSdrPipeline: LutSdrBasePipeline;
  peakNits: number;
  sceneLinearPipeline: SceneLinearPipeline;
  width: number;
}

const ROW_ALIGNMENT = 256;

function alignedBytesPerRow(width: number): number {
  const raw = width * 4;
  return Math.ceil(raw / ROW_ALIGNMENT) * ROW_ALIGNMENT;
}

function writeF32Uniform(
  device: GPUDevice,
  buffer: GPUBuffer,
  values: number[],
): void {
  const tmp = new Float32Array(buffer.size / 4);
  for (let i = 0; i < values.length; i += 1) {
    tmp[i] = values[i]!;
  }
  device.queue.writeBuffer(buffer, 0, tmp.buffer, 0, tmp.byteLength);
}

function createOffscreen(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  label: string,
): GPUTexture {
  return device.createTexture({
    label,
    size: { width, height, depthOrArrayLayers: 1 },
    format,
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });
}

function halfBitsToFloat(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7C00) >> 10;
  const m = h & 0x3FF;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (m / 1024);
  if (e === 0x1F) return m ? Number.NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + m / 1024);
}

async function readBackRgba8(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const bytesPerRow = alignedBytesPerRow(width);
  const padded = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder({ label: 'export.readback' });
  encoder.copyTextureToBuffer(
    { texture },
    { buffer: padded, bytesPerRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);

  try {
    await padded.mapAsync(GPUMapMode.READ);
    const view = new Uint8Array(padded.getMappedRange());
    const out = new Uint8ClampedArray(width * height * 4);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y += 1) {
      const src = y * bytesPerRow;
      const dst = y * rowBytes;
      out.set(view.subarray(src, src + rowBytes), dst);
    }
    padded.unmap();
    return out;
  } finally {
    padded.destroy();
  }
}

export async function exportCurrentFrame(
  params: ExportFrameParams,
): Promise<ExportFrameResult> {
  const {
    device,
    sceneLinearPipeline,
    lutSdrPipeline,
    hdrComposePipeline,
    getExternalTexture,
    hdrEnabled,
    hdrStrength,
    lut3d,
    exposure,
    peakNits,
    width,
    height,
  } = params;

  if (width <= 0 || height <= 0) {
    throw new Error(`exportCurrentFrame: invalid size ${width}x${height}`);
  }

  const externalTexture = getExternalTexture();
  if (!externalTexture) {
    throw new Error('exportCurrentFrame: video frame unavailable (importExternalTexture returned null)');
  }

  const peakHeadroom = Math.max(1, peakNits / 100);

  const sceneTex = createOffscreen(
    device,
    width,
    height,
    'rgba16float',
    'export.sceneLinear',
  );
  const sdrTex = createOffscreen(
    device,
    width,
    height,
    'rgba8unorm',
    'export.sdrBase',
  );
  const hdrTex = hdrEnabled
    ? createOffscreen(device, width, height, 'rgba16float', 'export.hdrLinear')
    : null;

  const exposureBuf = device.createBuffer({
    label: 'export.exposureUniform',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeF32Uniform(device, exposureBuf, [exposure]);

  const peakBuf = device.createBuffer({
    label: 'export.peakHeadroomUniform',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeF32Uniform(device, peakBuf, [peakHeadroom, hdrStrength]);

  const pass1Encoder = device.createCommandEncoder({ label: 'export.pass1' });
  sceneLinearPipeline.run(externalTexture, sceneTex.createView(), pass1Encoder);
  device.queue.submit([pass1Encoder.finish()]);

  const pass2Encoder = device.createCommandEncoder({ label: 'export.pass2' });
  lutSdrPipeline.run(
    sceneTex,
    lut3d,
    exposureBuf,
    sdrTex.createView(),
    pass2Encoder,
  );
  device.queue.submit([pass2Encoder.finish()]);

  if (hdrTex) {
    const pass3Encoder = device.createCommandEncoder({ label: 'export.pass3' });
    hdrComposePipeline.run(
      sdrTex,
      sceneTex,
      peakBuf,
      hdrTex.createView(),
      pass3Encoder,
    );
    device.queue.submit([pass3Encoder.finish()]);
  }

  try {
    const sdrBaseBytes = await readBackRgba8(device, sdrTex, width, height);
    const hdrLinearF32 = hdrTex
      ? await readBackRgba16FloatAsRgbF32(device, hdrTex, width, height)
      : null;

    return {
      sdrBaseBytes,
      hdrLinearF32,
      width,
      height,
      meta: { peakNits },
    };
  } finally {
    sceneTex.destroy();
    sdrTex.destroy();
    hdrTex?.destroy();
    exposureBuf.destroy();
    peakBuf.destroy();
  }
}

const ROW_ALIGNMENT_16F = 256;

async function readBackRgba16FloatAsRgbF32(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
): Promise<Float32Array> {
  const rawBytesPerRow = width * 8;
  const bytesPerRow = Math.ceil(rawBytesPerRow / ROW_ALIGNMENT_16F) * ROW_ALIGNMENT_16F;
  const padded = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder({ label: 'export.readbackHdr' });
  encoder.copyTextureToBuffer(
    { texture },
    { buffer: padded, bytesPerRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);
  try {
    await padded.mapAsync(GPUMapMode.READ);
    const view = new Uint8Array(padded.getMappedRange());
    const out = new Float32Array(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      const rowStart = y * bytesPerRow;
      const rowU16 = new Uint16Array(view.buffer, view.byteOffset + rowStart, width * 4);
      for (let x = 0; x < width; x += 1) {
        const idx = x * 4;
        const dst = (y * width + x) * 3;
        out[dst] = halfBitsToFloat(rowU16[idx]!);
        out[dst + 1] = halfBitsToFloat(rowU16[idx + 1]!);
        out[dst + 2] = halfBitsToFloat(rowU16[idx + 2]!);
      }
    }
    padded.unmap();
    return out;
  } finally {
    padded.destroy();
  }
}
