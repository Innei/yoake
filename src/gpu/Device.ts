/// <reference types="@webgpu/types" />

export class WebGpuUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGpuUnavailableError';
  }
}

export async function getDevice(): Promise<GPUDevice> {
  if (!navigator.gpu) {
    throw new WebGpuUnavailableError('navigator.gpu is unavailable in this browser');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new WebGpuUnavailableError('navigator.gpu.requestAdapter() returned null');
  }
  try {
    return await adapter.requestDevice();
  } catch (cause) {
    throw new WebGpuUnavailableError(
      `adapter.requestDevice() failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

export async function destroyDevice(device: GPUDevice): Promise<void> {
  device.destroy();
  await Promise.resolve();
}
