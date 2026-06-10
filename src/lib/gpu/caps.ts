/// <reference types="@webgpu/types" />

export interface HdrCaps {
  dynamicRangeHigh: boolean;
  hdrReady: boolean;
  toneMappingExtended: boolean;
  webGpu: boolean;
}

export function probeHdrCaps(
  _device: GPUDevice,
  configuredContext: GPUCanvasContext,
): HdrCaps {
  const webGpu = true;

  const dynamicRangeHigh =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(dynamic-range: high)').matches;

  const config = configuredContext.getConfiguration?.();
  const toneMappingExtended = config?.toneMapping?.mode === 'extended';

  return {
    webGpu,
    dynamicRangeHigh,
    toneMappingExtended,
    hdrReady: webGpu && dynamicRangeHigh && toneMappingExtended,
  };
}
