/// <reference types="@webgpu/types" />

export function configureHdrCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
): GPUCanvasContext {
  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('canvas.getContext("webgpu") returned null');
  }
  context.configure({
    device,
    format: 'rgba16float',
    colorSpace: 'srgb',
    toneMapping: { mode: 'extended' },
    alphaMode: 'opaque',
  });
  return context;
}
