/// <reference types="@webgpu/types" />

import { buildLut3DUploadData } from '~/lib/color/lutTexture';
import type { ParsedLut } from '~/types';

import fullscreenVertSource from '../shaders/fullscreenTriangle.vert.wgsl?raw';
import lutSdrFragSource from '../shaders/lutSdrBase.frag.wgsl?raw';

export interface LutSdrBasePipeline {
  destroy: () => void;
  run: (
    sceneLinear: GPUTexture,
    lut3d: GPUTexture,
    exposureBuf: GPUBuffer,
    targetView: GPUTextureView,
    encoder: GPUCommandEncoder,
  ) => void;
}

const OUTPUT_FORMAT: GPUTextureFormat = 'rgba8unorm';

export function createLutSdrBasePipeline(device: GPUDevice): LutSdrBasePipeline {
  const vertModule = device.createShaderModule({
    label: 'fullscreenTriangle.vert',
    code: fullscreenVertSource,
  });
  const fragModule = device.createShaderModule({
    label: 'lutSdrBase.frag',
    code: lutSdrFragSource,
  });

  const sceneBindGroupLayout = device.createBindGroupLayout({
    label: 'lutSdrBase.sceneLayout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
    ],
  });

  const lutBindGroupLayout = device.createBindGroupLayout({
    label: 'lutSdrBase.lutLayout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
    ],
  });

  const paramsBindGroupLayout = device.createBindGroupLayout({
    label: 'lutSdrBase.paramsLayout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'lutSdrBase.pipelineLayout',
    bindGroupLayouts: [sceneBindGroupLayout, lutBindGroupLayout, paramsBindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    label: 'lutSdrBase.pipeline',
    layout: pipelineLayout,
    vertex: { module: vertModule, entryPoint: 'vs' },
    fragment: {
      module: fragModule,
      entryPoint: 'fs',
      targets: [{ format: OUTPUT_FORMAT }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const sceneSampler = device.createSampler({
    label: 'lutSdrBase.sceneSampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const lutSampler = device.createSampler({
    label: 'lutSdrBase.lutSampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });

  let destroyed = false;

  function run(
    sceneLinear: GPUTexture,
    lut3d: GPUTexture,
    exposureBuf: GPUBuffer,
    targetView: GPUTextureView,
    encoder: GPUCommandEncoder,
  ): void {
    if (destroyed) {
      throw new Error('lutSdrBase pipeline used after destroy()');
    }

    const sceneBindGroup = device.createBindGroup({
      label: 'lutSdrBase.sceneBindGroup',
      layout: sceneBindGroupLayout,
      entries: [
        { binding: 0, resource: sceneLinear.createView() },
        { binding: 1, resource: sceneSampler },
      ],
    });

    const lutBindGroup = device.createBindGroup({
      label: 'lutSdrBase.lutBindGroup',
      layout: lutBindGroupLayout,
      entries: [
        { binding: 0, resource: lut3d.createView({ dimension: '3d' }) },
        { binding: 1, resource: lutSampler },
      ],
    });

    const paramsBindGroup = device.createBindGroup({
      label: 'lutSdrBase.paramsBindGroup',
      layout: paramsBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: exposureBuf } }],
    });

    const pass = encoder.beginRenderPass({
      label: 'lutSdrBase.pass',
      colorAttachments: [
        {
          view: targetView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, sceneBindGroup);
    pass.setBindGroup(1, lutBindGroup);
    pass.setBindGroup(2, paramsBindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  function destroy(): void {
    destroyed = true;
  }

  return { run, destroy };
}

export function uploadLut3D(device: GPUDevice, parsedLut: ParsedLut): GPUTexture {
  const { width, height, depth, pixels } = buildLut3DUploadData(parsedLut);

  const texture = device.createTexture({
    label: 'lutSdrBase.lut3d',
    size: { width, height, depthOrArrayLayers: depth },
    dimension: '3d',
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
  });

  const halfPixels = floatArrayToHalfBuffer(pixels);
  const bytesPerRow = width * 4 * 2;

  device.queue.writeTexture(
    { texture },
    halfPixels,
    { bytesPerRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: depth },
  );

  return texture;
}

function floatArrayToHalfBuffer(values: Float32Array): Uint16Array<ArrayBuffer> {
  const out = new Uint16Array(values.length) as Uint16Array<ArrayBuffer>;
  for (let i = 0; i < values.length; i++) {
    out[i] = floatToHalf(values[i]!);
  }
  return out;
}

function floatToHalf(value: number): number {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = value;
  const x = u32[0]!;
  const sign = (x >>> 16) & 0x8000;
  let mantissa = x & 0x007F_FFFF;
  let exponent = (x >>> 23) & 0xFF;

  if (exponent === 0xFF) {
    return sign | 0x7C00 | (mantissa ? 0x0200 : 0);
  }

  exponent = exponent - 127 + 15;
  if (exponent >= 0x1F) {
    return sign | 0x7C00;
  }
  if (exponent <= 0) {
    if (exponent < -10) {
      return sign;
    }
    mantissa = (mantissa | 0x0080_0000) >> (1 - exponent);
    if (mantissa & 0x0000_1000) mantissa += 0x0000_2000;
    return sign | (mantissa >> 13);
  }
  if (mantissa & 0x0000_1000) {
    mantissa += 0x0000_2000;
    if (mantissa & 0x0080_0000) {
      mantissa = 0;
      exponent += 1;
      if (exponent >= 0x1F) {
        return sign | 0x7C00;
      }
    }
  }
  return sign | (exponent << 10) | (mantissa >> 13);
}
