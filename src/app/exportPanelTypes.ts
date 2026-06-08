import type { GainmapPipeline } from '~/gpu/pipelines/gainmap';
import type { HdrComposePipeline } from '~/gpu/pipelines/hdrCompose';
import type { LutSdrBasePipeline } from '~/gpu/pipelines/lutSdrBase';
import type { SceneLinearPipeline } from '~/gpu/pipelines/sceneLinear';

export type ExportFormat = 'sdr' | 'ultraHdr';

export type ExportStatus =
  | { kind: 'idle' }
  | { kind: 'running'; format: ExportFormat }
  | { kind: 'success'; filename: string; format: ExportFormat };

export interface ExportPanelHdrCaps {
  toneMappingExtended: boolean;
}

export interface ExportPanelProps {
  clipBaseName: string;
  device: GPUDevice;
  gainmapPipeline: GainmapPipeline;
  getExternalTexture: () => GPUExternalTexture | null;
  hdrCaps: ExportPanelHdrCaps;
  hdrComposePipeline: HdrComposePipeline;
  height: number;
  lut3d: GPUTexture | null;
  lutLabel: string;
  lutSdrPipeline: LutSdrBasePipeline;
  sceneLinearPipeline: SceneLinearPipeline;
  videoEl: HTMLVideoElement | null;
  width: number;
}
