import { create } from 'zustand';

import type { HdrCaps } from '~/lib/gpu/caps';
import type { GpuPipelines, GpuVideo } from '~/lib/gpu/types';

export type { GpuPipelines, GpuVideo } from '~/lib/gpu/types';

interface GpuState {
  caps: HdrCaps | null;
  device: GPUDevice | null;
  lut3dTexture: GPUTexture | null;
  pipelines: GpuPipelines | null;
  setCaps: (caps: HdrCaps | null) => void;
  setDevice: (device: GPUDevice | null) => void;
  setLut3dTexture: (texture: GPUTexture | null) => void;
  setPipelines: (pipelines: GpuPipelines | null) => void;
  setVideo: (video: GpuVideo | null) => void;
  video: GpuVideo | null;
}

export const useGpuStore = create<GpuState>((set) => ({
  device: null,
  caps: null,
  pipelines: null,
  lut3dTexture: null,
  video: null,
  setDevice: (device) => set({ device }),
  setCaps: (caps) => set({ caps }),
  setPipelines: (pipelines) => set({ pipelines }),
  setLut3dTexture: (texture) => set({ lut3dTexture: texture }),
  setVideo: (video) => set({ video }),
}));
