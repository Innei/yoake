export interface ClipMeta {
  handle: FileSystemFileHandle;
  id: string;
  lastModified: number;
  name: string;
  size: number;
}

export interface LutDescriptor {
  handle: FileSystemFileHandle;
  id: string;
  name: string;
}

export interface ParsedLut {
  data: Float32Array;
  size: number;
}

export interface GradingParams {
  exposure: number;
}

export type RenderMode = 'graded' | 'original';

export type PeakNits = 400 | 600 | 1000;

export interface HdrSettings {
  peakNits: PeakNits;
  strength: number;
}

export interface LastSession {
  clipId?: string;
  grading: GradingParams;
  hdr: HdrSettings;
  lutId?: string;
}
