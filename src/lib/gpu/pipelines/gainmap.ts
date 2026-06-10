/// <reference types="@webgpu/types" />
/// <reference types="vite/client" />

import vertSource from '../shaders/fullscreenTriangle.vert.wgsl?raw';
import fragSource from '../shaders/gainmap.frag.wgsl?raw';
import statsSource from '../shaders/gainmapStats.compute.wgsl?raw';

export interface GainmapStatsResult {
  max: number;
  min: number;
}

export interface GainmapPipeline {
  destroy: () => void;
  readStats: (statsBuf: GPUBuffer, device: GPUDevice) => Promise<GainmapStatsResult>;
  runEncode: (
    hdr: GPUTexture,
    sdr: GPUTexture,
    metaBuf: GPUBuffer,
    targetView: GPUTextureView,
    encoder: GPUCommandEncoder,
  ) => void;
  runStats: (
    hdr: GPUTexture,
    sdr: GPUTexture,
    statsBuf: GPUBuffer,
    encoder: GPUCommandEncoder,
  ) => void;
}

export const GAINMAP_STATS_BUFFER_SIZE = 8;
export const GAINMAP_META_BUFFER_SIZE = 8;
const STATS_WORKGROUP_X = 8;
const STATS_WORKGROUP_Y = 8;

const F32_POS_INF_BITS = 0x7F80_0000 | 0;
const F32_ZERO_BITS = 0;

export function createGainmapPipeline(device: GPUDevice): GainmapPipeline {
  const statsModule = device.createShaderModule({ code: statsSource });
  const fragModule = device.createShaderModule({ code: fragSource });
  const vertModule = device.createShaderModule({ code: vertSource });

  const statsPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: statsModule, entryPoint: 'main' },
  });

  const encodePipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: vertModule, entryPoint: 'vs' },
    fragment: {
      module: fragModule,
      entryPoint: 'fs',
      targets: [{ format: 'rgba8unorm' }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const statsResetSrc = device.createBuffer({
    size: GAINMAP_STATS_BUFFER_SIZE,
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  {
    const view = new Int32Array(statsResetSrc.getMappedRange());
    view[0] = F32_POS_INF_BITS;
    view[1] = F32_ZERO_BITS;
    statsResetSrc.unmap();
  }

  const statsBindLayout = statsPipeline.getBindGroupLayout(0);
  const encodeBindLayout = encodePipeline.getBindGroupLayout(0);

  let destroyed = false;

  return {
    runStats(hdr, sdr, statsBuf, encoder) {
      if (destroyed) {
        throw new Error('gainmap pipeline has been destroyed');
      }
      encoder.copyBufferToBuffer(statsResetSrc, 0, statsBuf, 0, GAINMAP_STATS_BUFFER_SIZE);

      const bindGroup = device.createBindGroup({
        layout: statsBindLayout,
        entries: [
          { binding: 0, resource: hdr.createView() },
          { binding: 1, resource: sdr.createView() },
          { binding: 2, resource: { buffer: statsBuf } },
        ],
      });

      const width = hdr.width;
      const height = hdr.height;
      const groupsX = Math.ceil(width / STATS_WORKGROUP_X);
      const groupsY = Math.ceil(height / STATS_WORKGROUP_Y);

      const pass = encoder.beginComputePass();
      pass.setPipeline(statsPipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(groupsX, groupsY, 1);
      pass.end();
    },

    runEncode(hdr, sdr, metaBuf, targetView, encoder) {
      if (destroyed) {
        throw new Error('gainmap pipeline has been destroyed');
      }
      const bindGroup = device.createBindGroup({
        layout: encodeBindLayout,
        entries: [
          { binding: 0, resource: hdr.createView() },
          { binding: 1, resource: sdr.createView() },
          { binding: 2, resource: sampler },
          { binding: 3, resource: { buffer: metaBuf } },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: targetView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(encodePipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    },

    async readStats(statsBuf, dev) {
      if (destroyed) {
        throw new Error('gainmap pipeline has been destroyed');
      }
      const staging = dev.createBuffer({
        size: GAINMAP_STATS_BUFFER_SIZE,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = dev.createCommandEncoder();
      encoder.copyBufferToBuffer(statsBuf, 0, staging, 0, GAINMAP_STATS_BUFFER_SIZE);
      dev.queue.submit([encoder.finish()]);

      try {
        await staging.mapAsync(GPUMapMode.READ);
        const ints = new Int32Array(staging.getMappedRange().slice(0));
        staging.unmap();
        const minBits = ints[0] ?? F32_POS_INF_BITS;
        const maxBits = ints[1] ?? F32_ZERO_BITS;
        const minF = i32BitsToF32(minBits);
        const maxF = i32BitsToF32(maxBits);
        const safeMin = Number.isFinite(minF) ? Math.max(0, minF) : 0;
        const safeMax = Number.isFinite(maxF) ? Math.max(safeMin, maxF) : safeMin;
        return { min: safeMin, max: safeMax };
      } finally {
        staging.destroy();
      }
    },

    destroy() {
      destroyed = true;
      statsResetSrc.destroy();
    },
  };
}

const SCRATCH = new ArrayBuffer(4);
const SCRATCH_I = new Int32Array(SCRATCH);
const SCRATCH_F = new Float32Array(SCRATCH);

function i32BitsToF32(bits: number): number {
  SCRATCH_I[0] = bits;
  return SCRATCH_F[0] ?? 0;
}
