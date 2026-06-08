/// <reference types="@webgpu/types" />
/// <reference types="vite/client" />

import vertSource from '../shaders/fullscreenTriangle.vert.wgsl?raw';
import fragSource from '../shaders/hdrCompose.frag.wgsl?raw';

export interface HdrComposePipeline {
  destroy: () => void;
  run: (
    sdrBase: GPUTexture,
    sceneLinear: GPUTexture,
    peakHeadroomBuf: GPUBuffer,
    targetView: GPUTextureView,
    encoder: GPUCommandEncoder,
  ) => void;
}

export function createHdrComposePipeline(device: GPUDevice): HdrComposePipeline {
  const vertModule = device.createShaderModule({ code: vertSource });
  const fragModule = device.createShaderModule({ code: fragSource });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: vertModule, entryPoint: 'vs' },
    fragment: {
      module: fragModule,
      entryPoint: 'fs',
      targets: [{ format: 'rgba16float' }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const sdrSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const sceneSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const textureBindGroupLayout = pipeline.getBindGroupLayout(0);
  const uniformBindGroupLayout = pipeline.getBindGroupLayout(1);

  let destroyed = false;

  return {
    run(sdrBase, sceneLinear, peakHeadroomBuf, targetView, encoder) {
      if (destroyed) {
        throw new Error('hdrCompose pipeline has been destroyed');
      }
      const textureBindGroup = device.createBindGroup({
        layout: textureBindGroupLayout,
        entries: [
          { binding: 0, resource: sdrBase.createView() },
          { binding: 1, resource: sdrSampler },
          { binding: 2, resource: sceneLinear.createView() },
          { binding: 3, resource: sceneSampler },
        ],
      });
      const uniformBindGroup = device.createBindGroup({
        layout: uniformBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: peakHeadroomBuf } }],
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
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, textureBindGroup);
      pass.setBindGroup(1, uniformBindGroup);
      pass.draw(3);
      pass.end();
    },
    destroy() {
      destroyed = true;
    },
  };
}
