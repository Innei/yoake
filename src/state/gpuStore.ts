import { create } from 'zustand';

import type { HdrCaps } from '~/gpu/caps';
import type { GainmapPipeline } from '~/gpu/pipelines/gainmap';
import type { HdrComposePipeline } from '~/gpu/pipelines/hdrCompose';
import type { LutSdrBasePipeline } from '~/gpu/pipelines/lutSdrBase';
import type { SceneLinearPipeline } from '~/gpu/pipelines/sceneLinear';

export interface GpuPipelines {
  gainmap: GainmapPipeline;
  hdrCompose: HdrComposePipeline;
  lutSdrBase: LutSdrBasePipeline;
  sceneLinear: SceneLinearPipeline;
}

export interface GpuVideo {
  el: HTMLVideoElement;
  getExternalTexture: () => GPUExternalTexture | null;
}

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
