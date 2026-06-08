/// <reference types="@webgpu/types" />
/// <reference types="vite/client" />

import vertSource from '../shaders/fullscreenTriangle.vert.wgsl?raw';
import fragSource from '../shaders/sceneLinear.frag.wgsl?raw';

export interface SceneLinearPipeline {
  destroy: () => void;
  run: (
    externalTexture: GPUExternalTexture,
    targetView: GPUTextureView,
    encoder: GPUCommandEncoder,
  ) => void;
}

export function createSceneLinearPipeline(device: GPUDevice): SceneLinearPipeline {
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

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const bindGroupLayout = pipeline.getBindGroupLayout(0);

  let destroyed = false;

  return {
    run(externalTexture, targetView, encoder) {
      if (destroyed) {
        throw new Error('sceneLinear pipeline has been destroyed');
      }
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: externalTexture },
          { binding: 1, resource: sampler },
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
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    },
    destroy() {
      destroyed = true;
    },
  };
}
