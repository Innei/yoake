import type { GainmapPipeline } from './pipelines/gainmap';
import type { HdrComposePipeline } from './pipelines/hdrCompose';
import type { LutSdrBasePipeline } from './pipelines/lutSdrBase';
import type { SceneLinearPipeline } from './pipelines/sceneLinear';

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
